import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  BASIS_POINTS_DENOMINATOR,
  PLATFORM_FEE_BASIS_POINTS,
  SUPPORTED_COUNTRIES,
} from "../config";
import { usdToMicroStx } from "../services/fxService";
import { sendNotification } from "../services/notificationService";
import {
  getIdempotencyKey,
  getIdempotentResponse,
  hashRequestBody,
  saveIdempotentResponse,
} from "../utils/idempotency";
import { logRequestError, logRequestInfo } from "../utils/logging";

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
      payoutMethod?: "mobile_money" | "bank_transfer" | "crypto_wallet";
      stacksTxId?: string;
    };

    if (!receiverWallet || !amountUsd || !sourceCountry || !destCountry) {
      res.status(400).json({
        error: "Missing required fields: receiverWallet, amountUsd, sourceCountry, destCountry",
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
      receiverWallet,
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
        receiverWallet,
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

    const amount = Number(amountUsd);
    if (Number.isNaN(amount) || amount < 1 || amount > 10000) {
      res.status(400).json({ error: "Amount must be between $1 and $10,000" });
      return;
    }

    const fee = (amount * PLATFORM_FEE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
    const netAmount = amount - fee;
    const microStxAmount = usdToMicroStx(amount);

    const transferId = uuidv4();
    const now = new Date();

    const transfer = await db.createTransfer({
      id: transferId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: microStxAmount,
      amountUsd: amount,
      fee,
      netAmount,
      currency: "sBTC",
      sourceCountry,
      destCountry,
      recipientPhone,
      recipientName,
      payoutMethod,
      stacksTxId,
      status: "pending",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdByUid: actorUid,
      updatedByUid: actorUid,
      createdAtMs: now.getTime(),
      updatedAtMs: now.getTime(),
    });

    await Promise.all([
      db.upsertUser({
        walletAddress: senderWallet,
        country: sourceCountry,
        actorUid,
      }),
      db.upsertUser({
        walletAddress: receiverWallet,
        country: destCountry,
        phoneNumber: recipientPhone,
        actorUid,
      }),
    ]);

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
        amount: transfer.amountUsd,
        fee: transfer.fee,
        netAmount: transfer.netAmount,
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
      receiverWallet,
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
