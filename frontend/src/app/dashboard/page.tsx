"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SUPPORTED_COUNTRIES } from "@/types";

interface Transfer {
  id: string;
  receiver?: string;
  sender?: string;
  amountUsd: number;
  destCountry?: string;
  sourceCountry?: string;
  status: string;
  createdAt: string;
}

interface WalletHistory {
  sent: Transfer[];
  received: Transfer[];
}

interface PlatformStats {
  totalTransfers: number;
  totalVolumeUsd: number;
  avgFeePercent: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f97316",
  claimed: "#10b981",
  refunded: "#6b7280",
  failed: "#ef4444",
};

const formatUtcDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [inputAddress, setInputAddress] = useState("");
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [rates, setRates] = useState<{ supportedCountries: typeof SUPPORTED_COUNTRIES } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"sent" | "received">("sent");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  // Load exchange rates on mount
  useEffect(() => {
    fetch(`${API_URL}/api/exchange-rate`)
      .then((r) => r.json())
      .then(setRates)
      .catch(console.error);
  }, [API_URL]);

  const handleWalletLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAddress.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/transaction/wallet/${encodeURIComponent(inputAddress.trim())}`
      );
      const data = await res.json();
      setHistory(data);
      setWalletAddress(inputAddress.trim());
    } catch {
      console.error("Failed to load wallet history");
    } finally {
      setLoading(false);
    }
  };

  const sentCount = history?.sent.length || 0;
  const receivedCount = history?.received.length || 0;
  const totalSentUsd = history?.sent.reduce((sum, t) => sum + t.amountUsd, 0) || 0;

  const getCountryFlag = (code: string) =>
    SUPPORTED_COUNTRIES.find((c) => c.code === code)?.flag || "🌍";

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-1">
              <span className="gradient-text">Dashboard</span>
            </h1>
            <p className="text-gray-400">
              View your transfer history and platform stats
            </p>
          </div>
          <Link href="/send">
            <button className="btn-primary px-6 py-2">
              + New Transfer
            </button>
          </Link>
        </div>

        {/* Wallet Lookup */}
        <form onSubmit={handleWalletLookup} className="card p-4 mb-6">
          <div className="flex gap-3">
            <input
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              placeholder="Enter your Stacks wallet address (SP...)"
              className="flex-1 px-4 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f0f0f0",
              }}
            />
            <button
              type="submit"
              disabled={loading || !inputAddress.trim()}
              className="btn-primary px-6 py-2 text-sm"
            >
              {loading ? "Loading..." : "Search"}
            </button>
          </div>
        </form>

        {/* Stats Cards */}
        {walletAddress && history && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Transfers Sent", value: sentCount, icon: "📤" },
                { label: "Transfers Received", value: receivedCount, icon: "📥" },
                {
                  label: "Total Sent",
                  value: `$${totalSentUsd.toFixed(2)}`,
                  icon: "💰",
                },
                {
                  label: "Fees Saved vs WU",
                  value: `$${(totalSentUsd * 0.07).toFixed(2)}`,
                  icon: "🎉",
                },
              ].map((stat) => (
                <div key={stat.label} className="card p-4 text-center">
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Wallet Address Display */}
            <div
              className="p-3 rounded-xl mb-6 text-sm flex items-center gap-2"
              style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}
            >
              <span className="text-orange-400">🔑</span>
              <span className="text-gray-400">Wallet:</span>
              <span className="font-mono text-xs text-gray-300 truncate">{walletAddress}</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {(["sent", "received"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all"
                  style={{
                    background:
                      activeTab === tab
                        ? "rgba(249,115,22,0.2)"
                        : "rgba(255,255,255,0.05)",
                    border:
                      activeTab === tab
                        ? "1px solid rgba(249,115,22,0.4)"
                        : "1px solid rgba(255,255,255,0.1)",
                    color: activeTab === tab ? "#f97316" : "#9ca3af",
                  }}
                >
                  {tab === "sent" ? "📤" : "📥"} {tab} ({tab === "sent" ? sentCount : receivedCount})
                </button>
              ))}
            </div>

            {/* Transfer List */}
            <div className="space-y-3">
              {(activeTab === "sent" ? history.sent : history.received).length === 0 ? (
                <div className="card p-8 text-center text-gray-500">
                  No {activeTab} transfers found
                </div>
              ) : (
                (activeTab === "sent" ? history.sent : history.received).map((t) => (
                  <div key={t.id} className="card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {activeTab === "sent"
                          ? getCountryFlag(t.destCountry || "")
                          : getCountryFlag(t.sourceCountry || "")}
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {activeTab === "sent"
                            ? `→ ${t.destCountry || "?"}`
                            : `← ${t.sourceCountry || "?"}`}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {t.id.slice(0, 12)}...
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatUtcDate(t.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${t.amountUsd.toFixed(2)}</div>
                      <div
                        className="text-xs px-2 py-0.5 rounded-full inline-block mt-1"
                        style={{
                          background: `${STATUS_COLORS[t.status] || "#6b7280"}20`,
                          color: STATUS_COLORS[t.status] || "#6b7280",
                          border: `1px solid ${STATUS_COLORS[t.status] || "#6b7280"}40`,
                        }}
                      >
                        {t.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Exchange Rates */}
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">
            Live <span className="gradient-text">Exchange Rates</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {rates?.supportedCountries?.map((country) => (
              <div key={country.code} className="card p-3 text-center">
                <div className="text-2xl mb-1">{country.flag}</div>
                <div className="font-semibold text-sm">{country.name}</div>
                <div className="text-xs text-gray-400 mt-1">{country.currency}</div>
                <div className="text-xs text-orange-400 mt-1">{country.mobileMoney}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {!walletAddress && (
          <div className="mt-8 card p-8 text-center">
            <div className="text-4xl mb-3">👛</div>
            <h3 className="font-semibold mb-2">Enter your wallet address</h3>
            <p className="text-gray-500 text-sm">
              Search by Stacks wallet address to view your transfer history
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
