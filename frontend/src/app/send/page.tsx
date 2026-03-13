"use client";

import { useState, useEffect } from "react";
import { SUPPORTED_COUNTRIES, calculateFee, getCountry } from "@/types";

const PAYOUT_METHODS = [
  { value: "mobile_money", label: "📱 Mobile Money" },
  { value: "bank_transfer", label: "🏦 Bank Transfer" },
  { value: "crypto_wallet", label: "₿ Crypto Wallet" },
];

interface SendFormData {
  senderWallet: string;
  receiverWallet: string;
  amountUsd: string;
  sourceCountry: string;
  destCountry: string;
  recipientPhone: string;
  recipientName: string;
  payoutMethod: string;
}

interface TransferResult {
  id: string;
  status: string;
  fee: number;
  netAmount: number;
}

export default function SendPage() {
  const [form, setForm] = useState<SendFormData>({
    senderWallet: "",
    receiverWallet: "",
    amountUsd: "",
    sourceCountry: "GHA",
    destCountry: "NGA",
    recipientPhone: "",
    recipientName: "",
    payoutMethod: "mobile_money",
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ localAmount: number; currency: string } | null>(null);
  // localRates: mapping of currency code → USD-to-local rate (from API)
  const [localRates, setLocalRates] = useState<Record<string, number>>({});

  const amount = parseFloat(form.amountUsd) || 0;
  const fee = calculateFee(amount);
  const netAmount = amount - fee;
  const destCountry = getCountry(form.destCountry);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  // Fetch exchange rates from backend on mount
  useEffect(() => {
    fetch(`${API_URL}/api/exchange-rate`)
      .then((r) => r.json())
      .then((data) => {
        // Build currency → localPerUsd map from BTC rates
        const rates: Record<string, number> = {};
        if (data.rates) {
          for (const [, rateInfo] of Object.entries(
            data.rates as Record<string, { rate: number; btcUsdPrice: number; to: string }>
          )) {
            // rate = local per BTC, btcUsdPrice = USD per BTC → localPerUsd = rate / btcUsdPrice
            rates[rateInfo.to] = rateInfo.rate / rateInfo.btcUsdPrice;
          }
        }
        setLocalRates(rates);
      })
      .catch(() => {
        // Fallback rates if API is unavailable
        setLocalRates({ GHS: 15.5, NGN: 1600, KES: 132, XOF: 620, TZS: 2600, UGX: 3800 });
      });
  }, [API_URL]);

  // Update local currency estimate when amount, dest country, or rates change
  useEffect(() => {
    if (amount > 0 && form.destCountry) {
      const country = getCountry(form.destCountry);
      if (country) {
        const rate = localRates[country.currency] || 0;
        if (rate > 0) {
          setEstimate({ localAmount: netAmount * rate, currency: country.currency });
        }
      }
    } else {
      setEstimate(null);
    }
  }, [amount, form.destCountry, netAmount, localRates]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            amountUsd: parseFloat(form.amountUsd),
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Transfer failed");
        return;
      }

      setResult(data.transfer);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen px-4 py-12 flex items-center justify-center">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">Transfer Initiated!</h2>
          <p className="text-gray-400 mb-6">
            Your transfer has been submitted to the Stacks blockchain.
          </p>

          <div
            className="rounded-lg p-4 mb-6 text-sm space-y-2"
            style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
          >
            <div className="flex justify-between">
              <span className="text-gray-400">Transfer ID</span>
              <span className="font-mono text-xs text-green-400">{result.id.slice(0, 16)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount</span>
              <span className="font-semibold">${form.amountUsd}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fee (1%)</span>
              <span className="text-orange-400">${result.fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recipient receives</span>
              <span className="text-green-400 font-semibold">${result.netAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: "rgba(249,115,22,0.2)", color: "#f97316" }}
              >
                {result.status}
              </span>
            </div>
          </div>

          <p className="text-gray-500 text-sm mb-6">
            📱 The recipient has been notified via SMS with a claim link.
          </p>

          <div className="flex gap-3">
            <button
              className="flex-1 py-3 rounded-xl font-medium transition-colors"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onClick={() => {
                setResult(null);
                setForm((prev) => ({ ...prev, amountUsd: "", receiverWallet: "", recipientPhone: "", recipientName: "" }));
              }}
            >
              Send Another
            </button>
            <a
              href={`/dashboard`}
              className="flex-1 btn-primary py-3 text-center rounded-xl font-medium"
            >
              View Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Send <span className="gradient-text">Money</span>
          </h1>
          <p className="text-gray-400">
            Cross-border remittance with ~1% fee, secured by Bitcoin
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {/* Wallet Addresses */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Your Wallet Address (Sender)
            </label>
            <input
              name="senderWallet"
              value={form.senderWallet}
              onChange={handleChange}
              placeholder="SP... (Stacks address)"
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f0f0f0",
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Recipient Wallet Address
            </label>
            <input
              name="receiverWallet"
              value={form.receiverWallet}
              onChange={handleChange}
              placeholder="SP... (recipient's Stacks address)"
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f0f0f0",
              }}
            />
          </div>

          {/* Countries */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                From Country
              </label>
              <select
                name="sourceCountry"
                value={form.sourceCountry}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code} style={{ background: "#1a1a2e" }}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                To Country
              </label>
              <select
                name="destCountry"
                value={form.destCountry}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code} style={{ background: "#1a1a2e" }}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                name="amountUsd"
                type="number"
                min="1"
                max="10000"
                step="0.01"
                value={form.amountUsd}
                onChange={handleChange}
                placeholder="20.00"
                required
                className="w-full pl-8 pr-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              />
            </div>

            {amount > 0 && (
              <div
                className="mt-2 p-3 rounded-lg text-sm space-y-1"
                style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}
              >
                <div className="flex justify-between">
                  <span className="text-gray-400">Platform fee (1%)</span>
                  <span className="text-orange-400">- ${fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-gray-300">Recipient receives</span>
                  <span className="text-green-400">${netAmount.toFixed(2)}</span>
                </div>
                {estimate && (
                  <div className="flex justify-between text-xs text-gray-500 pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <span>≈ Local currency</span>
                    <span>{estimate.currency} {estimate.localAmount.toFixed(0)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recipient Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Recipient Name
              </label>
              <input
                name="recipientName"
                value={form.recipientName}
                onChange={handleChange}
                placeholder="John Doe"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Recipient Phone (for SMS)
              </label>
              <input
                name="recipientPhone"
                value={form.recipientPhone}
                onChange={handleChange}
                placeholder="+2348012345678"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              />
            </div>
          </div>

          {/* Payout Method */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Payout Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYOUT_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, payoutMethod: method.value }))}
                  className="py-2 px-3 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background:
                      form.payoutMethod === method.value
                        ? "rgba(249,115,22,0.2)"
                        : "rgba(255,255,255,0.05)",
                    border:
                      form.payoutMethod === method.value
                        ? "1px solid rgba(249,115,22,0.5)"
                        : "1px solid rgba(255,255,255,0.1)",
                    color: form.payoutMethod === method.value ? "#f97316" : "#9ca3af",
                  }}
                >
                  {method.label}
                </button>
              ))}
            </div>
            {destCountry && form.payoutMethod === "mobile_money" && (
              <p className="text-xs text-gray-500 mt-1">
                📱 Will be sent via {destCountry.mobileMoney} in {destCountry.name}
              </p>
            )}
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
            disabled={loading || amount < 1}
            className="btn-primary w-full py-4 text-base"
          >
            {loading ? "Processing..." : `Send $${amount > 0 ? amount.toFixed(2) : "0.00"} →`}
          </button>

          <p className="text-center text-xs text-gray-600">
            Secured by Bitcoin via Stacks + sBTC escrow smart contract
          </p>
        </form>
      </div>
    </div>
  );
}
