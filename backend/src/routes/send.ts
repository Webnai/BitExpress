import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  BASIS_POINTS_DENOMINATOR,
  PLATFORM_FEE_BASIS_POINTS,
  SUPPORTED_COUNTRIES,
  getDeployerWallet,
} from "../config";
import { usdToSbtcSatoshis, getLiveBtcUsdPrice } from "../services/fxService";
import { sendNotification } from "../services/notificationService";
import {
  getIdempotencyKey,
  getIdempotentResponse,
  hashRequestBody,
  saveIdempotentResponse,
} from "../utils/idempotency";
import { logRequestError, logRequestInfo } from "../utils/logging";
import { verifySendRemittanceTx } from "../services/stacksVerificationService";

// Helper to validate Stacks wallet address format
function isValidStacksAddress(address: string): boolean {
  // Stacks addresses start with ST or SM (testnet) or S[PTM] (mainnet)
  return /^S[PTMN][A-Z0-9]{38,42}$/.test(address.trim().toUpperCase());
}

// Helper to get sBTC balance for a wallet
async function getSbtcBalance(walletAddress: string): Promise<number> {
  try {
    const stacksApiUrl = process.env.STACKS_API_URL || "https://api.testnet.hiro.so";
    const response = await fetch(`${stacksApiUrl}/extended/v1/address/${walletAddress}/balances`);
    
    if (!response.ok) {
      logRequestError(null as any, "send.balance_check_failed", {
        walletAddress,
        status: response.status,
      });
      return 0;
    }

    const data = await response.json() as any;
    
    // Parse all token balances to find sBTC
    // sBTC asset identifier format: contract.token::sBTC or similar
    const tokenBalances = data.tokens || {};
    
    // Try to find sBTC token (may be under different keys)
    for (const [assetId, balance] of Object.entries(tokenBalances)) {
      if (typeof assetId === "string" && assetId.includes("sbtc")) {
        const balanceValue = (balance as any)?.balance || 0;
        return Number(balanceValue) || 0;
      }
    }
    
    // Fallback: check under fungible tokens
    const fungibleTokens = data.fungible_tokens || {};
    for (const [assetId, balance] of Object.entries(fungibleTokens)) {
      if (typeof assetId === "string" && assetId.includes("sbtc")) {
        const balanceValue = (balance as any)?.balance || 0;
        return Number(balanceValue) || 0;
      }
    }
    
    return 0;
  } catch (error) {
    logRequestError(null as any, "send.balance_api_error", {
      walletAddress,
      message: error instanceof Error ? error.message : "unknown",
    });
    return 0;
  }
}

const router = Router();

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const senderWallet = req.auth?.walletAddress;
    const actorUid = req.auth?.uid;

    if (!senderWallet || !actorUid) {
      res.status(401).json({ error: "Missing authenticated wallet context." });
      return;
    }

    const {
      receiverWallet,
      amountUsd,
      sourceCountry,
      destCountry,
      recipientPhone,
      recipientName,
      payoutMethod = "mobile_money",
      stacksTxId,
    } = req.body as {
      receiverWallet?: string;
      amountUsd?: number;
      sourceCountry?: string;
      destCountry?: string;
      recipientPhone?: string;
      recipientName?: string;
      payoutMethod?: "mobile_money" | "crypto_wallet";
      stacksTxId?: string;
    };

    if (!amountUsd || !sourceCountry || !destCountry) {
      res.status(400).json({
        error: "Missing required fields: amountUsd, sourceCountry, destCountry",
      });
      return;
    }

    const requestedReceiverWallet = typeof receiverWallet === "string" ? receiverWallet : "";
    const effectiveReceiverWallet =
      payoutMethod === "mobile_money" ? getDeployerWallet() : requestedReceiverWallet;
    const beneficiaryWallet = payoutMethod === "mobile_money" ? requestedReceiverWallet || undefined : undefined;

    if (!effectiveReceiverWallet) {
      res.status(400).json({
        error: "receiverWallet is required for non-mobile-money payouts.",
      });
      return;
    }

    // Validate receiver wallet format
    if (!isValidStacksAddress(effectiveReceiverWallet)) {
      res.status(400).json({
        error: "Invalid receiver wallet address. Must be a valid Stacks wallet (e.g., ST... or SM...)",
      });
      return;
    }

    // Ensure sender and receiver are different
    if (effectiveReceiverWallet.toLowerCase() === senderWallet.toLowerCase()) {
      res.status(400).json({
        error: "Cannot send to your own wallet.",
      });
      return;
    }

    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header is required." });
      return;
    }

    const requestHash = hashRequestBody({
      senderWallet,
      receiverWallet: effectiveReceiverWallet,
      beneficiaryWallet: beneficiaryWallet ?? null,
      amountUsd,
      sourceCountry,
      destCountry,
      recipientPhone: recipientPhone ?? null,
      recipientName: recipientName ?? null,
      payoutMethod,
      stacksTxId: stacksTxId ?? null,
    });

    const existing = await getIdempotentResponse("send", idempotencyKey, requestHash);
    if (existing === "mismatch") {
      res.status(409).json({ error: "Idempotency key reused with a different request payload." });
      return;
    }
    if (existing) {
      logRequestInfo(req, "send.idempotency_hit", {
        senderWallet,
        receiverWallet: effectiveReceiverWallet,
      });
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    if (!SUPPORTED_COUNTRIES[sourceCountry]) {
      res.status(400).json({ error: `Unsupported source country: ${sourceCountry}` });
      return;
    }
    if (!SUPPORTED_COUNTRIES[destCountry]) {
      res.status(400).json({ error: `Unsupported destination country: ${destCountry}` });
      return;
    }

    if (payoutMethod === "mobile_money") {
      if (!recipientPhone || !recipientName) {
        res.status(400).json({
          error: "recipientPhone and recipientName are required for mobile-money payouts.",
        });
        return;
      }

      if (!SUPPORTED_COUNTRIES[destCountry].supportsMobileMoneyPayout) {
        res.status(400).json({
          error: `${SUPPORTED_COUNTRIES[destCountry].name} mobile-money payouts are not available.`,
        });
        return;
      }
    }


    const amount = Number(amountUsd);
    if (Number.isNaN(amount) || amount < 1 || amount > 10000) {
      res.status(400).json({ error: "Amount must be between $1 and $10,000" });
      return;
    }

    const fee = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
    const netAmount = amount - fee;
    const btcUsdPrice = await getLiveBtcUsdPrice();
    const sbtcAmount = usdToSbtcSatoshis(amount, btcUsdPrice);

    // Verify sender has sufficient sBTC balance
    if (process.env.NODE_ENV !== "test") {
      logRequestInfo(req, "send.balance_check.started", {
        senderWallet,
        requiredAmount: sbtcAmount,
      });

      const senderBalance = await getSbtcBalance(senderWallet);
      
      if (senderBalance < sbtcAmount) {
        logRequestInfo(req, "send.balance_check.insufficient", {
          senderWallet,
          available: senderBalance,
          required: sbtcAmount,
        });
        res.status(400).json({
          error: `Insufficient sBTC balance. Available: ${senderBalance} satoshis, Required: ${sbtcAmount} satoshis`,
        });
        return;
      }

      logRequestInfo(req, "send.balance_check.sufficient", {
        senderWallet,
        available: senderBalance,
        required: sbtcAmount,
      });
    }

    let onChainTransferId: number | undefined;

    if (process.env.NODE_ENV !== "test") {
      if (!stacksTxId) {
        res.status(400).json({
          error: "stacksTxId is required and must reference a successful send-remittance transaction.",
        });
        return;
      }

      logRequestInfo(req, "send.tx_verification_started", {
        stacksTxId,
        senderWallet,
        expectedAmount: sbtcAmount,
      });

      const verification = await verifySendRemittanceTx({
        txId: stacksTxId,
        senderWallet,
        expectedAmount: sbtcAmount,
      });

      if (!verification.ok) {
        logRequestInfo(req, "send.tx_verification_failed", {
          stacksTxId,
          reason: verification.reason,
        });
        res.status(400).json({
          error: verification.reason || "Invalid stacksTxId for this transfer.",
        });
        return;
      }

      onChainTransferId = verification.onChainTransferId;

      logRequestInfo(req, "send.tx_verification_succeeded", {
        stacksTxId,
        onChainTransferId,
      });
    }

    const transferId = uuidv4();
    const now = new Date();

    const transfer = await db.createTransfer({
      id: transferId,
      sender: senderWallet,
      receiver: effectiveReceiverWallet,
      beneficiaryWallet,
      onChainTransferId,
      amount: sbtcAmount,
      amountUsd: amount,
      fee,
      netAmount,
      currency: "sBTC",
      sourceCountry,
      destCountry,
      recipientPhone,
      recipientName,
      payoutMethod,
      payoutProvider: "paystack",
      payoutStatus: payoutMethod === "crypto_wallet" ? "success" : "not_started",
      stacksTxId,
      status: "pending",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdByUid: actorUid,
      updatedByUid: actorUid,
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    });

    const upsertUserPromises = [
      db.upsertUser({
        walletAddress: senderWallet,
        country: sourceCountry,
        actorUid,
      }),
    ];

    if (payoutMethod === "crypto_wallet") {
      upsertUserPromises.push(
        db.upsertUser({
          walletAddress: effectiveReceiverWallet,
          country: destCountry,
          phoneNumber: recipientPhone,
          actorUid,
        })
      );
    }

    await Promise.all(upsertUserPromises);

    if (recipientPhone) {
      await sendNotification({
        to: recipientPhone,
        type: "sms",
        templateId: "transfer_received",
        data: {
          amount: netAmount.toFixed(2),
          senderCountry: SUPPORTED_COUNTRIES[sourceCountry].name,
          claimCode: transferId.slice(0, 8).toUpperCase(),
          transferId,
        },
      });
    }

    const responseBody = {
      success: true,
      transfer: {
        id: transfer.id,
        status: transfer.status,
        onChainTransferId: transfer.onChainTransferId,
        amount: transfer.amountUsd,
        fee: transfer.fee,
        netAmount: transfer.netAmount,
        receiverWallet: transfer.receiver,
        beneficiaryWallet: transfer.beneficiaryWallet ?? null,
        claimAuthorization:
          transfer.payoutMethod === "mobile_money" ? "operator_only" : "receiver_only",
        sourceCountry,
        destCountry,
        createdAt: transfer.createdAt,
      },
    };

    await saveIdempotentResponse({
      scope: "send",
      key: idempotencyKey,
      requestHash,
      responseStatus: 201,
      responseBody,
      transferId,
      createdByUid: actorUid,
      createdAt: now.toISOString(),
      createdAtMs: now.getTime(),
    });

    logRequestInfo(req, "send.created", {
      transferId,
      senderWallet,
      receiverWallet: effectiveReceiverWallet,
      amountUsd: amount,
    });

    res.status(201).json(responseBody);
  } catch (error) {
    logRequestError(req, "send.failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
