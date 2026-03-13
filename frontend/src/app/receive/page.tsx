"use client";

import { useState } from "react";
import { getCountry } from "@/types";

interface ClaimResult {
  transferId: string;
  status: string;
  payout: {
    reference: string;
    localAmount: number;
    localCurrency: string;
    message: string;
    estimatedDelivery: string;
  };
}

interface TransactionInfo {
  id: string;
  amountUsd: number;
  netAmount: number;
  fee: number;
  sourceCountry: { code: string; name: string; flag: string };
  destCountry: { code: string; name: string; flag: string; mobileMoney: string };
  recipientName?: string;
  payoutMethod: string;
  status: string;
  createdAt: string;
}

const formatUtcDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
};

const formatUtcTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toISOString().slice(11, 16)} UTC`;
};

export default function ReceivePage() {
  const [transferId, setTransferId] = useState("");
  const [receiverWallet, setReceiverWallet] = useState("");
  const [txInfo, setTxInfo] = useState<TransactionInfo | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"lookup" | "review" | "claimed">("lookup");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferId.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/transaction/${transferId.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Transaction not found");
        return;
      }

      if (data.transaction.status !== "pending") {
        setError(`This transfer is already ${data.transaction.status}.`);
        return;
      }

      setTxInfo(data.transaction);
      setStep("review");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!txInfo || !receiverWallet.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferId: txInfo.id,
          receiverWallet: receiverWallet.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Claim failed");
        return;
      }

      setClaimResult(data.transfer);
      setStep("claimed");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("lookup");
    setTransferId("");
    setReceiverWallet("");
    setTxInfo(null);
    setClaimResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Claim <span className="gradient-text">Payment</span>
          </h1>
          <p className="text-gray-400">
            Enter your transfer ID to claim your sBTC and withdraw to mobile money
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {["lookup", "review", "claimed"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background:
                    step === s
                      ? "linear-gradient(135deg, #f97316, #f59e0b)"
                      : i < ["lookup", "review", "claimed"].indexOf(step)
                      ? "rgba(16,185,129,0.3)"
                      : "rgba(255,255,255,0.1)",
                  color:
                    i <= ["lookup", "review", "claimed"].indexOf(step)
                      ? "#fff"
                      : "#9ca3af",
                }}
              >
                {i < ["lookup", "review", "claimed"].indexOf(step) ? "✓" : i + 1}
              </div>
              {i < 2 && (
                <div
                  className="w-8 h-0.5"
                  style={{
                    background:
                      i < ["lookup", "review", "claimed"].indexOf(step)
                        ? "#10b981"
                        : "rgba(255,255,255,0.1)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Lookup */}
        {step === "lookup" && (
          <form onSubmit={handleLookup} className="card p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Transfer ID
              </label>
              <input
                value={transferId}
                onChange={(e) => { setTransferId(e.target.value); setError(null); }}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                required
                className="w-full px-4 py-3 rounded-xl text-sm outline-none font-mono"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                You received this ID via SMS or from the sender
              </p>
            </div>

            {error && (
              <div
                className="p-3 rounded-lg text-sm text-red-400"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !transferId.trim()}
              className="btn-primary w-full py-4"
            >
              {loading ? "Looking up..." : "Look Up Transfer →"}
            </button>
          </form>
        )}

        {/* Step 2: Review & Claim */}
        {step === "review" && txInfo && (
          <div className="card p-6 space-y-5">
            <h2 className="text-xl font-bold">Review Transfer</h2>

            <div
              className="p-4 rounded-xl space-y-3 text-sm"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex justify-between">
                <span className="text-gray-400">From</span>
                <span>
                  {txInfo.sourceCountry.flag} {txInfo.sourceCountry.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span className="font-semibold">${txInfo.amountUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">You receive</span>
                <span className="text-green-400 font-semibold">${txInfo.netAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Payout via</span>
                <span>{txInfo.destCountry.mobileMoney}</span>
              </div>
              {txInfo.recipientName && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Recipient</span>
                  <span>{txInfo.recipientName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Created</span>
                <span className="text-xs">
                  {formatUtcDateTime(txInfo.createdAt)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Your Wallet Address
              </label>
              <input
                value={receiverWallet}
                onChange={(e) => { setReceiverWallet(e.target.value); setError(null); }}
                placeholder="SP... (your Stacks wallet)"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              />
            </div>

            {error && (
              <div
                className="p-3 rounded-lg text-sm text-red-400"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                ⚠️ {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={loading || !receiverWallet.trim()}
                className="btn-primary flex-1 py-3 text-sm"
              >
                {loading ? "Claiming..." : "Claim Payment →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Claimed! */}
        {step === "claimed" && claimResult && (
          <div className="card p-6 text-center space-y-5">
            <div className="text-6xl">🎉</div>
            <h2 className="text-2xl font-bold">Payment Claimed!</h2>
            <p className="text-gray-400">
              Your payment has been processed and is being sent to your mobile money.
            </p>

            <div
              className="p-4 rounded-xl text-sm space-y-2"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              <div className="flex justify-between">
                <span className="text-gray-400">Amount</span>
                <span className="text-green-400 font-semibold">
                  {claimResult.payout.localCurrency}{" "}
                  {claimResult.payout.localAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Reference</span>
                <span className="font-mono text-xs">{claimResult.payout.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Est. delivery</span>
                <span className="text-xs">
                  {claimResult.payout.estimatedDelivery
                    ? formatUtcTime(claimResult.payout.estimatedDelivery)
                    : "Instant"}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-500">{claimResult.payout.message}</p>

            <button
              onClick={reset}
              className="btn-primary w-full py-3"
            >
              Claim Another Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
