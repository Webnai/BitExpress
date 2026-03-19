import { randomUUID } from "crypto";
import { Request, Response, Router } from "express";
import { db, WalletLedgerBalance } from "../db";
import { requireAuth } from "../middleware/auth";
import { logRequestInfo } from "../utils/logging";

const router = Router();

const ALLOWED_CURRENCIES: WalletLedgerBalance["currency"][] = ["BTC", "sBTC", "STX", "USD"];

function normalizeCurrency(value: string): WalletLedgerBalance["currency"] | null {
  const normalized = value.trim();
  if (!ALLOWED_CURRENCIES.includes(normalized as WalletLedgerBalance["currency"])) {
    return null;
  }
  return normalized as WalletLedgerBalance["currency"];
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
  actorUid: string;
  currency: WalletLedgerBalance["currency"];
  availableBalance: number;
  pendingBalance: number;
  heldBalance: number;
  reason: string;
}): WalletLedgerBalance {
  const now = new Date();

  return {
    id: input.existing?.id ?? randomUUID(),
    walletAddress: input.walletAddress,
    currency: input.currency,
    availableBalance: input.availableBalance,
    pendingBalance: input.pendingBalance,
    heldBalance: input.heldBalance,
    lastReason: input.reason,
    createdAt: input.existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    createdByUid: input.existing?.createdByUid ?? input.actorUid,
    updatedByUid: input.actorUid,
    createdAtMs: input.existing?.createdAtMs ?? now.getTime(),
    updatedAtMs: now.getTime(),
  };
}

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const walletAddress = req.auth?.walletAddress;
  if (!walletAddress) {
    res.status(401).json({ error: "Missing authenticated wallet context." });
    return;
  }

  const ledger = await db.getWalletLedger(walletAddress);
  res.json({
    walletAddress,
    ledger,
    note:
      "Scaffold endpoint for operator-managed balances (available/pending/held). Integrate this with BTC deposit webhooks and settlement jobs.",
  });
});

// Dev-only helper endpoint to seed balances while operator-managed flows are being built.
router.post("/me/credit", requireAuth, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Ledger credit endpoint is disabled in production." });
    return;
  }

  const walletAddress = req.auth?.walletAddress;
  const actorUid = req.auth?.uid;
  if (!walletAddress || !actorUid) {
    res.status(401).json({ error: "Missing authenticated wallet context." });
    return;
  }

  const { currency, amount, reason } = req.body as {
    currency?: string;
    amount?: number;
    reason?: string;
  };

  const normalizedCurrency = typeof currency === "string" ? normalizeCurrency(currency) : null;
  if (!normalizedCurrency) {
    res.status(400).json({ error: "currency must be one of BTC, sBTC, STX, USD." });
    return;
  }

  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta <= 0) {
    res.status(400).json({ error: "amount must be a positive number." });
    return;
  }

  const now = new Date();
  const entries = await db.getWalletLedger(walletAddress);
  const existing = findLedgerEntry(entries, normalizedCurrency);

  const updated = buildLedgerEntry({
    existing,
    walletAddress,
    actorUid,
    currency: normalizedCurrency,
    availableBalance: (existing?.availableBalance ?? 0) + delta,
    pendingBalance: existing?.pendingBalance ?? 0,
    heldBalance: existing?.heldBalance ?? 0,
    reason: reason?.trim() || "manual_dev_credit",
  });

  await db.upsertWalletLedger(updated);

  logRequestInfo(req, "ledger.credit.dev_applied", {
    walletAddress,
    currency: normalizedCurrency,
    amount: delta,
    availableBalance: updated.availableBalance,
  });

  res.status(201).json({
    walletAddress,
    updated,
  });
});

// Dev-only lifecycle simulator: pending BTC deposit -> settled available BTC (+ optional sBTC).
router.post("/me/deposit-simulate", requireAuth, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Deposit simulation endpoint is disabled in production." });
    return;
  }

  const walletAddress = req.auth?.walletAddress;
  const actorUid = req.auth?.uid;
  if (!walletAddress || !actorUid) {
    res.status(401).json({ error: "Missing authenticated wallet context." });
    return;
  }

  const { amountBtc, phase, mintSbtc } = req.body as {
    amountBtc?: number;
    phase?: "pending" | "settle";
    mintSbtc?: boolean;
  };

  const amount = Number(amountBtc);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "amountBtc must be a positive number." });
    return;
  }

  if (phase !== "pending" && phase !== "settle") {
    res.status(400).json({ error: "phase must be either pending or settle." });
    return;
  }

  const entries = await db.getWalletLedger(walletAddress);
  const btcExisting = findLedgerEntry(entries, "BTC");

  const btcCurrentPending = btcExisting?.pendingBalance ?? 0;
  const btcCurrentAvailable = btcExisting?.availableBalance ?? 0;

  if (phase === "settle" && btcCurrentPending < amount) {
    res.status(400).json({
      error: `Cannot settle ${amount} BTC because pending BTC is only ${btcCurrentPending}.`,
    });
    return;
  }

  const btcPending = phase === "pending" ? btcCurrentPending + amount : btcCurrentPending - amount;
  const btcAvailable = phase === "pending" ? btcCurrentAvailable : btcCurrentAvailable + amount;

  const btcUpdated = buildLedgerEntry({
    existing: btcExisting,
    walletAddress,
    actorUid,
    currency: "BTC",
    availableBalance: btcAvailable,
    pendingBalance: btcPending,
    heldBalance: btcExisting?.heldBalance ?? 0,
    reason: phase === "pending" ? "simulated_btc_deposit_pending" : "simulated_btc_deposit_settled",
  });

  await db.upsertWalletLedger(btcUpdated);

  let sbtcUpdated: WalletLedgerBalance | undefined;
  if (phase === "settle" && mintSbtc) {
    const sbtcExisting = findLedgerEntry(entries, "sBTC");
    sbtcUpdated = buildLedgerEntry({
      existing: sbtcExisting,
      walletAddress,
      actorUid,
      currency: "sBTC",
      availableBalance: (sbtcExisting?.availableBalance ?? 0) + amount,
      pendingBalance: sbtcExisting?.pendingBalance ?? 0,
      heldBalance: sbtcExisting?.heldBalance ?? 0,
      reason: "simulated_sbtc_credit_from_settled_btc",
    });

    await db.upsertWalletLedger(sbtcUpdated);
  }

  logRequestInfo(req, "ledger.deposit.simulated", {
    walletAddress,
    phase,
    amountBtc: amount,
    mintSbtc: Boolean(mintSbtc),
    btcAvailable: btcUpdated.availableBalance,
    btcPending: btcUpdated.pendingBalance,
    sbtcAvailable: sbtcUpdated?.availableBalance,
  });

  res.status(201).json({
    walletAddress,
    phase,
    amountBtc: amount,
    mintedSbtc: Boolean(sbtcUpdated),
    updated: {
      btc: btcUpdated,
      sbtc: sbtcUpdated ?? null,
    },
  });
});

export default router;
