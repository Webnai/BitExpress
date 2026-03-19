import { createHmac, timingSafeEqual } from "crypto";

import { Router, Request, Response } from "express";

import {
  BTC_DEPOSIT_WEBHOOK_SECRET,
  PAYSTACK_WEBHOOK_SECRET,
} from "../config";
import { db, WalletLedgerBalance } from "../db";
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

async function updateTransferFromWebhook(input: {
  provider: "paystack";
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

function isStacksAddress(value: string): boolean {
  return /^S[PTMN][A-Z0-9]{20,60}$/.test(value.trim().toUpperCase());
}

function findLedgerEntry(
  entries: WalletLedgerBalance[],
  currency: WalletLedgerBalance["currency"]
): WalletLedgerBalance | undefined {
  return entries.find((entry) => entry.currency === currency);
}

function buildLedgerEntry(input: {
  existing?: WalletLedgerBalance;
  walletAddress: string;
  currency: WalletLedgerBalance["currency"];
  availableBalance: number;
  pendingBalance: number;
  heldBalance: number;
  reason: string;
}): WalletLedgerBalance {
  const now = new Date();
  const actorUid = "system:webhook";

  return {
    id: input.existing?.id ?? `${input.walletAddress}:${input.currency}`,
    walletAddress: input.walletAddress,
    currency: input.currency,
    availableBalance: input.availableBalance,
    pendingBalance: input.pendingBalance,
    heldBalance: input.heldBalance,
    lastReason: input.reason,
    createdAt: input.existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    createdByUid: input.existing?.createdByUid ?? actorUid,
    updatedByUid: actorUid,
    createdAtMs: input.existing?.createdAtMs ?? now.getTime(),
    updatedAtMs: now.getTime(),
  };
}

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

router.post("/btc/deposit", async (req: Request, res: Response) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = req.header("x-bitexpress-signature") || "";

  if (!shouldSkipSignature(BTC_DEPOSIT_WEBHOOK_SECRET)) {
    const expected = hmacSha256(rawBody, BTC_DEPOSIT_WEBHOOK_SECRET);
    if (!secureCompare(expected, signature)) {
      logError("webhook.btc_deposit.signature_invalid", {
        provider: "btc-deposit",
      });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }

  const payload = req.body as {
    walletAddress?: string;
    amountBtc?: number;
    status?: "pending" | "confirmed";
    mintSbtc?: boolean;
    sourceTxId?: string;
  };

  const walletAddress = String(payload.walletAddress || "").trim().toUpperCase();
  const amountBtc = Number(payload.amountBtc);
  const status = payload.status;
  const mintSbtc = Boolean(payload.mintSbtc);

  if (!walletAddress || !isStacksAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a valid Stacks wallet address." });
    return;
  }

  if (!Number.isFinite(amountBtc) || amountBtc <= 0) {
    res.status(400).json({ error: "amountBtc must be a positive number." });
    return;
  }

  if (status !== "pending" && status !== "confirmed") {
    res.status(400).json({ error: "status must be pending or confirmed." });
    return;
  }

  const entries = await db.getWalletLedger(walletAddress);
  const btcExisting = findLedgerEntry(entries, "BTC");

  const currentPending = btcExisting?.pendingBalance ?? 0;
  const currentAvailable = btcExisting?.availableBalance ?? 0;

  const nextPending = status === "pending" ? currentPending + amountBtc : Math.max(0, currentPending - amountBtc);
  const nextAvailable = status === "confirmed" ? currentAvailable + amountBtc : currentAvailable;

  const btcUpdated = buildLedgerEntry({
    existing: btcExisting,
    walletAddress,
    currency: "BTC",
    availableBalance: nextAvailable,
    pendingBalance: nextPending,
    heldBalance: btcExisting?.heldBalance ?? 0,
    reason: status === "pending" ? "webhook_btc_deposit_pending" : "webhook_btc_deposit_confirmed",
  });

  await db.upsertWalletLedger(btcUpdated);

  let sbtcUpdated: WalletLedgerBalance | undefined;
  if (status === "confirmed" && mintSbtc) {
    const sbtcExisting = findLedgerEntry(entries, "sBTC");
    sbtcUpdated = buildLedgerEntry({
      existing: sbtcExisting,
      walletAddress,
      currency: "sBTC",
      availableBalance: (sbtcExisting?.availableBalance ?? 0) + amountBtc,
      pendingBalance: sbtcExisting?.pendingBalance ?? 0,
      heldBalance: sbtcExisting?.heldBalance ?? 0,
      reason: "webhook_sbtc_credit_confirmed_btc",
    });

    await db.upsertWalletLedger(sbtcUpdated);
  }

  logInfo("webhook.btc_deposit.reconciled", {
    walletAddress,
    sourceTxId: payload.sourceTxId,
    amountBtc,
    status,
    mintSbtc,
    btcAvailable: btcUpdated.availableBalance,
    btcPending: btcUpdated.pendingBalance,
    sbtcAvailable: sbtcUpdated?.availableBalance,
  });

  res.json({
    received: true,
    walletAddress,
    amountBtc,
    status,
    mintSbtc,
    updated: {
      btc: btcUpdated,
      sbtc: sbtcUpdated ?? null,
    },
  });
});

export default router;