import { createHmac, timingSafeEqual } from "crypto";

import { Router, Request, Response } from "express";

import {
  CINETPAY_WEBHOOK_SECRET,
  PAYSTACK_WEBHOOK_SECRET,
} from "../config";
import { db } from "../db";
import { logError, logInfo } from "../utils/logging";

const router = Router();

function secureCompare(expected: string, provided: string): boolean {
  if (!expected || !provided) {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, providedBuf);
}

function hmacSha512(value: string, secret: string): string {
  return createHmac("sha512", secret).update(value).digest("hex");
}

function hmacSha256(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function shouldSkipSignature(secret: string): boolean {
  return process.env.NODE_ENV !== "production" && !secret;
}

function statusFromPaystackEvent(event: string): "processing" | "success" | "failed" {
  if (event === "transfer.success") {
    return "success";
  }
  if (event === "transfer.failed" || event === "transfer.reversed") {
    return "failed";
  }
  return "processing";
}

function statusFromCinetTreatmentStatus(value: string): "processing" | "success" | "failed" {
  const normalized = value.toUpperCase();
  if (normalized === "VAL") {
    return "success";
  }
  if (normalized === "REJ") {
    return "failed";
  }
  return "processing";
}

async function updateTransferFromWebhook(input: {
  provider: "paystack" | "cinetpay";
  reference: string;
  payoutStatus: "processing" | "success" | "failed";
  rawPayload: unknown;
}): Promise<boolean> {
  const transfers = await db.getAllTransfers();
  const transfer = transfers.find(
    (candidate) =>
      candidate.mobileMoneyRef === input.reference ||
      candidate.id === input.reference
  );

  if (!transfer) {
    logInfo("webhook.transfer.not_found", {
      provider: input.provider,
      reference: input.reference,
    });
    return false;
  }

  const now = new Date();
  await db.updateTransfer(transfer.id, {
    payoutProvider: input.provider,
    payoutStatus: input.payoutStatus,
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
    mobileMoneyRef: transfer.mobileMoneyRef || input.reference,
  });

  logInfo("webhook.transfer.reconciled", {
    provider: input.provider,
    transferId: transfer.id,
    reference: input.reference,
    payoutStatus: input.payoutStatus,
    payload: input.rawPayload,
  });

  return true;
}

router.post("/cinetpay/transfer", async (req: Request, res: Response) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature =
    req.header("x-cinetpay-signature") || req.header("x-token") || "";

  if (!shouldSkipSignature(CINETPAY_WEBHOOK_SECRET)) {
    const expected = hmacSha256(rawBody, CINETPAY_WEBHOOK_SECRET);
    if (!secureCompare(expected, signature)) {
      logError("webhook.cinetpay.signature_invalid", {
        provider: "cinetpay",
      });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }

  const payload = req.body as Record<string, unknown>;
  const eventData = Array.isArray(payload?.data)
    ? (payload.data[0] as Record<string, unknown> | undefined)
    : undefined;
  const clientReference = String(
    payload?.client_transaction_id || eventData?.client_transaction_id || ""
  );
  const transactionReference = String(
    payload?.transaction_id || eventData?.transaction_id || ""
  );
  const treatmentStatus = String(
    payload?.treatment_status || eventData?.treatment_status || "NEW"
  );

  if (!clientReference && !transactionReference) {
    res.status(202).json({ received: true, reconciled: false, reason: "missing_reference" });
    return;
  }

  const reconciled = await updateTransferFromWebhook({
    provider: "cinetpay",
    reference: clientReference || transactionReference,
    payoutStatus: statusFromCinetTreatmentStatus(treatmentStatus),
    rawPayload: payload,
  });

  res.json({ received: true, reconciled });
});

router.post("/paystack/transfer", async (req: Request, res: Response) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = req.header("x-paystack-signature") || "";

  if (!shouldSkipSignature(PAYSTACK_WEBHOOK_SECRET)) {
    const expected = hmacSha512(rawBody, PAYSTACK_WEBHOOK_SECRET);
    if (!secureCompare(expected, signature)) {
      logError("webhook.paystack.signature_invalid", {
        provider: "paystack",
      });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }

  const payload = req.body as {
    event?: string;
    data?: {
      reference?: string;
      status?: string;
    };
  };

  const reference = payload?.data?.reference;
  if (!reference) {
    res.status(202).json({ received: true, reconciled: false, reason: "missing_reference" });
    return;
  }

  const payoutStatus = payload.event
    ? statusFromPaystackEvent(payload.event)
    : statusFromPaystackEvent(payload.data?.status ? `transfer.${payload.data.status}` : "transfer.pending");

  const reconciled = await updateTransferFromWebhook({
    provider: "paystack",
    reference,
    payoutStatus,
    rawPayload: payload,
  });

  res.json({ received: true, reconciled });
});

export default router;