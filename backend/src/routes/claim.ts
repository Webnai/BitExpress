import { Router, Request, Response } from "express";

import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { convertUsdToLocal } from "../services/fxService";
import { sendNotification } from "../services/notificationService";
import { processPayout } from "../services/payoutService";
import {
  getIdempotencyKey,
  getIdempotentResponse,
  hashRequestBody,
  saveIdempotentResponse,
} from "../utils/idempotency";
import { logRequestError, logRequestInfo } from "../utils/logging";
import { verifyClaimRemittanceTx } from "../services/stacksVerificationService";

const router = Router();

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const receiverWallet = req.auth?.walletAddress;
    const actorUid = req.auth?.uid;

    if (!receiverWallet || !actorUid) {
      res.status(401).json({ error: "Missing authenticated wallet context." });
      return;
    }

    const { transferId, claimCode, claimStacksTxId } = req.body as {
      transferId?: string;
      claimCode?: string;
      claimStacksTxId?: string;
    };

    if (!transferId) {
      res.status(400).json({
        error: "Missing required field: transferId",
      });
      return;
    }

    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header is required." });
      return;
    }

    const requestHash = hashRequestBody({
      transferId,
      receiverWallet,
      claimCode: claimCode ?? null,
      claimStacksTxId: claimStacksTxId ?? null,
    });

    const existing = await getIdempotentResponse("claim", idempotencyKey, requestHash);
    if (existing === "mismatch") {
      res.status(409).json({ error: "Idempotency key reused with a different request payload." });
      return;
    }
    if (existing) {
      logRequestInfo(req, "claim.idempotency_hit", {
        transferId,
        receiverWallet,
      });
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    const transfer = await db.getTransfer(transferId);
    if (!transfer) {
      res.status(404).json({ error: "Transfer not found" });
      return;
    }

    if (transfer.status !== "pending") {
      res.status(400).json({
        error: `Transfer cannot be claimed. Current status: ${transfer.status}`,
      });
      return;
    }

    if (transfer.receiver !== receiverWallet) {
      res.status(403).json({ error: "Not authorized to claim this transfer" });
      return;
    }

    if (process.env.NODE_ENV !== "test") {
      if (!claimCode) {
        res.status(400).json({ error: "claimCode is required for on-chain claim verification." });
        return;
      }

      if (!claimStacksTxId) {
        res.status(400).json({
          error: "claimStacksTxId is required and must reference a successful claim-remittance transaction.",
        });
        return;
      }

      if (transfer.onChainTransferId === undefined) {
        res.status(400).json({
          error: "Transfer is missing on-chain transfer ID and cannot be verified for claim.",
        });
        return;
      }

      const verification = await verifyClaimRemittanceTx({
        txId: claimStacksTxId,
        receiverWallet,
        expectedOnChainTransferId: transfer.onChainTransferId,
        expectedClaimSecretHex: claimCode,
      });

      if (!verification.ok) {
        res.status(400).json({
          error: verification.reason || "Invalid claimStacksTxId for this claim.",
        });
        return;
      }
    }

    const localAmount = convertUsdToLocal(transfer.netAmount, transfer.destCountry);

    const payoutResult = await processPayout(
      {
        transferId,
        countryCode: transfer.destCountry,
        recipientPhone: transfer.recipientPhone || "",
        recipientName: transfer.recipientName || "Recipient",
        recipientMobileProvider: transfer.recipientMobileProvider,
        amountUsd: transfer.netAmount,
        payoutMethod: transfer.payoutMethod,
      },
      localAmount
    );

    if (!payoutResult.success) {
      res.status(502).json({
        error: "Payout failed",
        details: payoutResult.message,
      });
      return;
    }

    const now = new Date();

    const updatedTransfer = await db.updateTransfer(transferId, {
      status: "claimed",
      claimedAt: now.toISOString(),
      claimStacksTxId,
      mobileMoneyRef: payoutResult.reference,
      payoutProvider: payoutResult.provider,
      payoutStatus: payoutResult.payoutStatus,
      updatedAt: now.toISOString(),
      updatedAtMs: now.getTime(),
      updatedByUid: actorUid,
    });

    await db.upsertUser({
      walletAddress: receiverWallet,
      country: transfer.destCountry,
      phoneNumber: transfer.recipientPhone,
      kycStatus: "pending",
      actorUid,
    });

    await sendNotification({
      to: transfer.sender,
      type: "sms",
      templateId: "transfer_claimed",
      data: {
        amount: transfer.amountUsd,
        recipientName: transfer.recipientName || "recipient",
        transferId,
      },
    });

    const responseBody = {
      success: true,
      transfer: {
        id: transferId,
        status: "claimed",
        claimedAt: updatedTransfer?.claimedAt,
        payout: {
          reference: payoutResult.reference,
          localAmount: payoutResult.localAmount,
          localCurrency: payoutResult.localCurrency,
          message: payoutResult.message,
          estimatedDelivery: payoutResult.estimatedDelivery,
          provider: payoutResult.provider,
          status: payoutResult.payoutStatus,
        },
      },
    };

    await saveIdempotentResponse({
      scope: "claim",
      key: idempotencyKey,
      requestHash,
      responseStatus: 200,
      responseBody,
      transferId,
      createdByUid: actorUid,
      createdAt: now.toISOString(),
      createdAtMs: now.getTime(),
    });

    logRequestInfo(req, "claim.succeeded", {
      transferId,
      receiverWallet,
      payoutReference: payoutResult.reference,
    });

    res.json(responseBody);
  } catch (error) {
    logRequestError(req, "claim.failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
