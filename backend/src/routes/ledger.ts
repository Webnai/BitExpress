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
  const existing = (await db.getWalletLedger(walletAddress)).find(
    (entry) => entry.currency === normalizedCurrency
  );

  const updated: WalletLedgerBalance = {
    id: existing?.id ?? randomUUID(),
    walletAddress,
    currency: normalizedCurrency,
    availableBalance: (existing?.availableBalance ?? 0) + delta,
    pendingBalance: existing?.pendingBalance ?? 0,
    heldBalance: existing?.heldBalance ?? 0,
    lastReason: reason?.trim() || "manual_dev_credit",
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    createdByUid: existing?.createdByUid ?? actorUid,
    updatedByUid: actorUid,
    createdAtMs: existing?.createdAtMs ?? now.getTime(),
    updatedAtMs: now.getTime(),
  };

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

export default router;
