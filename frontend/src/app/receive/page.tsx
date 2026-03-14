"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Smartphone,
  Building2,
  Wallet,
  ChevronRight,
  Shield,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info,
  Zap,
} from "lucide-react";

import { useWallet } from "@/components/WalletProvider";
import CountryFlag from "@/components/CountryFlag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClaim, apiGetTransaction, apiGetWalletHistory, apiGetExchangeRates } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoadedTransaction {
  id: string;
  sender: string;
  receiver: string;
  amountUsd: number;
  fee: number;
  netAmount: number;
  status: string;
  sourceCountry: { code: string; name?: string; currency?: string };
  destCountry: { code: string; name?: string; currency?: string; mobileMoney?: string };
  recipientName?: string;
  recipientPhone?: string;
  payoutMethod?: string;
  stacksTxId?: string;
  createdAt: string;
  claimedAt?: string;
  mobileMoneyRef?: string;
}

interface RecentReceive {
  id: string;
  counterpartyWallet: string;
  counterpartyName?: string;
  amountUsd: number;
  countryName?: string;
  createdAt: string;
}

type WithdrawalMethod = "mobile_money" | "bank_transfer" | "crypto_wallet";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBtc(btc: number): string {
  if (btc === 0) return "0";
  if (btc < 0.001) return btc.toFixed(6);
  return btc.toFixed(4);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

type FlagCountry = "Ghana" | "Nigeria" | "Kenya" | "Togo";
const FLAG_NAMES: FlagCountry[] = ["Ghana", "Nigeria", "Kenya", "Togo"];

function toFlagCountry(name: string | undefined): FlagCountry | null {
  if (!name) return null;
  return FLAG_NAMES.find((f) => f.toLowerCase() === name.toLowerCase()) ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReceivePage() {
  const { address } = useWallet();
  const [transferId, setTransferId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [transaction, setTransaction] = useState<LoadedTransaction | null>(null);
  const [btcUsdPrice, setBtcUsdPrice] = useState(65000);
  const [recentReceives, setRecentReceives] = useState<RecentReceive[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<WithdrawalMethod>("mobile_money");
  const [claimedAt, setClaimedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Fetch live BTC/USD price from backend exchange rate service
  useEffect(() => {
    apiGetExchangeRates()
      .then((data) => {
        const first = Object.values(data.rates)[0];
        if (first?.btcUsdPrice) setBtcUsdPrice(first.btcUsdPrice);
      })
      .catch(() => {});
  }, []);

  // Load recent receives from wallet history
  useEffect(() => {
    if (!address) return;
    apiGetWalletHistory(address)
      .then((data) => {
        setRecentReceives(
          data.received.slice(0, 4).map((r) => ({
            id: r.id,
            counterpartyWallet: r.counterpartyWallet,
            counterpartyName: r.counterpartyName,
            amountUsd: r.amountUsd,
            countryName: r.countryName,
            createdAt: r.createdAt,
          }))
        );
      })
      .catch(() => {});
  }, [address]);

  async function fetchTransaction(id: string) {
    setIsLoading(true);
    try {
      const data = await apiGetTransaction(id.trim());
      setTransaction(data.transaction);
      setSelectedMethod((data.transaction.payoutMethod as WithdrawalMethod) ?? "mobile_money");
      setClaimedAt(data.transaction.claimedAt ?? null);
      toast.success("Transaction loaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load transaction.");
      setTransaction(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!transferId.trim()) {
      toast.error("Enter a transfer ID.");
      return;
    }
    await fetchTransaction(transferId.trim());
  }

  async function claimFunds() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!transaction) return;
    setIsClaiming(true);
    try {
      const res = await apiClaim({
        transferId: transaction.id,
        receiverWallet: address,
        claimCode: claimCode.trim() || undefined,
      });
      setClaimedAt(res.transfer.claimedAt ?? new Date().toISOString());
      setTransaction((prev) => (prev ? { ...prev, status: "claimed" } : prev));
      toast.success("Funds claimed successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setIsClaiming(false);
    }
  }

  function copyTxId() {
    if (!transaction) return;
    navigator.clipboard.writeText(transaction.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const btcAmount = transaction ? transaction.amountUsd / btcUsdPrice : 0;
  const feeBtc = transaction ? transaction.fee / btcUsdPrice : 0;
  const isClaimed = transaction?.status === "claimed";
  const flagCountry = toFlagCountry(transaction?.sourceCountry.name);
  const senderLabel = transaction?.recipientName ?? truncateAddress(transaction?.sender ?? "");

  const withdrawalMethods: {
    method: WithdrawalMethod;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
  }[] = [
    {
      method: "mobile_money",
      icon: <Smartphone className="w-5 h-5 text-[#ff7448]" />,
      iconBg: "bg-[#fff3ef]",
      title: "Withdraw to Mobile Money",
      subtitle: "MTN MoMo, Flutterwave, M-Pesa, Moov Money",
      badge: "Instant",
      badgeColor: "bg-[#ecfdf5] text-[#059669]",
    },
    {
      method: "bank_transfer",
      icon: <Building2 className="w-5 h-5 text-[#3b82f6]" />,
      iconBg: "bg-[#eff6ff]",
      title: "Convert to Local Currency",
      subtitle: "View current exchange rates",
      badge: "1-2 days",
      badgeColor: "bg-[#eff6ff] text-[#3b82f6]",
    },
    {
      method: "crypto_wallet",
      icon: <Wallet className="w-5 h-5 text-[#f59e0b]" />,
      iconBg: "bg-[#fffbeb]",
      title: "Save in BTC Wallet",
      subtitle: "Earn potential returns",
      badge: "Secure",
      badgeColor: "bg-[#f3f4f6] text-[#6b7280]",
    },
  ];

  // ── Empty / Search state ─────────────────────────────────────────────────────
  if (!transaction) {
    return (
      <div className="min-h-screen bg-[#f3f6fb] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#ff7448]/10 mb-4">
              <Wallet className="w-6 h-6 text-[#ff7448]" />
            </div>
            <h1 className="text-2xl font-bold text-[#132a52]">Receive Money</h1>
            <p className="text-[#6f7d95] mt-1 text-sm">
              Enter a transfer ID to claim your funds
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.06)] p-6">
            <form onSubmit={loadTransaction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="transferId">Transfer ID</Label>
                <Input
                  id="transferId"
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="e.g. TX-BTC-458932"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="claimCode">
                  Claim Code{" "}
                  <span className="text-[#8b99b0] font-normal">(optional)</span>
                </Label>
                <Input
                  id="claimCode"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  placeholder="Optional claim code"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Loading…" : "Load Transfer"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Main loaded UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-[#132a52]">Receive Money</h1>
          <p className="text-[#6f7d95] mt-1 text-sm">Claim your incoming Bitcoin transfer</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* ── Left column ── */}
          <div className="space-y-4">
            {/* Status banner */}
            {isClaimed ? (
              <div className="flex items-center justify-between bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 text-[#065f46] font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
                  Payment Received Successfully
                </div>
                <span className="text-xs bg-[#10b981] text-white px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Verified
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[#fff7ed] border border-[#fed7aa] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 text-[#92400e] font-semibold text-sm">
                  <Clock className="w-5 h-5 text-[#f59e0b]" />
                  Transfer Ready to Claim
                </div>
                <span className="text-xs bg-[#ff7448] text-white px-2.5 py-0.5 rounded-full font-semibold">
                  Pending
                </span>
              </div>
            )}

            {/* Main transaction card */}
            <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-6 space-y-5">
              {/* From */}
              <div>
                <p className="text-xs text-[#8b99b0] font-semibold uppercase tracking-wider mb-3">From</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#132a52] to-[#2a4a82] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {getInitials(senderLabel)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#132a52]">{senderLabel}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {flagCountry ? (
                        <CountryFlag country={flagCountry} size={16} />
                      ) : (
                        <span className="text-base">{transaction.sourceCountry.name ?? transaction.sourceCountry.code}</span>
                      )}
                      <span className="text-sm text-[#6f7d95]">
                        {transaction.sourceCountry.name ?? transaction.sourceCountry.code}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] ml-0.5" title="verified" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#f0f4fb]" />

              {/* Amount Received */}
              <div>
                <p className="text-xs text-[#8b99b0] font-semibold uppercase tracking-wider mb-3">Amount Received</p>
                <div className="rounded-xl border-2 border-[#ff7448] bg-[#fffaf8] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-[#132a52] tracking-tight">{formatBtc(btcAmount)}</p>
                    <p className="text-sm text-[#6f7d95] mt-1">
                      ≈ ${transaction.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className="px-3 py-1.5 rounded-full bg-[#ff7448] text-white text-sm font-semibold">BTC</span>
                    <span className="px-3 py-1.5 rounded-full border border-[#e1e8f3] text-[#6f7d95] text-sm font-semibold">sBTC</span>
                  </div>
                </div>
              </div>

              {/* Transaction metadata grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Transaction ID – full width */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 col-span-2 relative">
                  <p className="text-xs text-[#8b99b0] mb-1">Transaction ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-semibold text-[#132a52] break-all flex-1">{transaction.id}</p>
                    <button
                      onClick={copyTxId}
                      className="flex-shrink-0 text-[#6f7d95] hover:text-[#ff7448] transition-colors p-1"
                      title="Copy ID"
                    >
                      {copiedId ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#8b99b0]">Date &amp; Time</p>
                    <Clock className="w-3.5 h-3.5 text-[#c0cddf]" />
                  </div>
                  <p className="text-sm font-semibold text-[#132a52]">
                    {new Date(transaction.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[#6f7d95]">
                    {new Date(transaction.createdAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    GMT
                  </p>
                </div>

                {/* Network */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#8b99b0]">Network</p>
                    <Info className="w-3.5 h-3.5 text-[#c0cddf]" />
                  </div>
                  <p className="text-sm font-semibold text-[#132a52]">Bitcoin Mainnet</p>
                </div>

                {/* Confirmations */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#8b99b0]">Confirmations</p>
                    <Info className="w-3.5 h-3.5 text-[#c0cddf]" />
                  </div>
                  <p className={`text-sm font-semibold ${isClaimed ? "text-[#10b981]" : "text-[#ff7448]"}`}>
                    {isClaimed ? "6/6 Confirmed" : "Awaiting confirm."}
                  </p>
                </div>

                {/* Transaction Fee */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[#8b99b0]">Transaction Fee</p>
                    <Info className="w-3.5 h-3.5 text-[#c0cddf]" />
                  </div>
                  <p className="text-sm font-semibold text-[#132a52]">{feeBtc.toFixed(5)} BTC</p>
                </div>

                {/* Status – full width */}
                <div className="rounded-xl bg-[#f6f9fe] p-3 col-span-2">
                  <p className="text-xs text-[#8b99b0] mb-1">Status</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isClaimed ? "bg-[#10b981]" : "bg-[#ff7448]"}`} />
                    <p className="text-sm font-semibold text-[#132a52]">
                      {isClaimed ? "Claimed" : "Ready to Claim"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Withdrawal Methods */}
            <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-6">
              <p className="text-base font-semibold text-[#132a52] mb-4">Choose Withdrawal Method</p>
              <div className="space-y-3">
                {withdrawalMethods.map(({ method, icon, iconBg, title, subtitle, badge, badgeColor }) => (
                  <button
                    key={method}
                    onClick={() => setSelectedMethod(method)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all text-left ${
                      selectedMethod === method
                        ? "border-[#ff7448] bg-[#fff8f6]"
                        : "border-[#e1e8f3] hover:border-[#ff7448]/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#132a52]">{title}</p>
                        <p className="text-xs text-[#8b99b0]">{subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>
                      <ChevronRight className="w-4 h-4 text-[#8b99b0]" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Receives */}
            {recentReceives.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-6">
                <p className="text-base font-semibold text-[#132a52] mb-4">Recent Receives</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {recentReceives.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => fetchTransaction(r.id)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#f6f9fe] transition-colors text-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#132a52] to-[#2a4a82] flex items-center justify-center text-white text-sm font-bold">
                        {getInitials(r.counterpartyName ?? r.counterpartyWallet)}
                      </div>
                      <p className="text-xs font-semibold text-[#132a52] leading-tight line-clamp-1 w-full">
                        {r.counterpartyName ?? truncateAddress(r.counterpartyWallet)}
                      </p>
                      <p className="text-xs font-bold text-[#ff7448]">{formatBtc(r.amountUsd / btcUsdPrice)} BTC</p>
                      <p className="text-[10px] text-[#8b99b0]">{timeAgo(r.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-6 space-y-5">
              {/* Header */}
              <div>
                <h2 className="text-xl font-bold text-[#132a52]">Claim Summary</h2>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#10b981]" />
                  <span className="text-xs text-[#10b981] font-semibold">Blockchain Verified</span>
                </div>
              </div>

              {/* Available to claim */}
              <div className="rounded-xl bg-[#f6f9fe] p-4">
                <p className="text-xs text-[#8b99b0] mb-1">Available to Claim</p>
                <p className="text-3xl font-bold text-[#132a52]">
                  {formatBtc(btcAmount)}{" "}
                  <span className="text-lg font-semibold">BTC</span>
                </p>
                <p className="text-sm text-[#6f7d95] mt-1">
                  ${transaction.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </p>
                <p className="text-xs text-[#10b981] mt-1 font-semibold">▲ +2.3% (24h)</p>
              </div>

              <div className="h-px bg-[#f0f4fb]" />

              {/* Fee breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#8b99b0]">Original Amount</span>
                  <span className="font-semibold text-[#132a52]">{formatBtc(btcAmount)} BTC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#8b99b0]">Network Fee</span>
                  <span className="text-xs text-[#10b981] font-semibold">Paid by sender</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#8b99b0]">Processing Status</span>
                  <span className={`text-xs font-semibold ${isClaimed ? "text-[#10b981]" : "text-[#ff7448]"}`}>
                    {isClaimed ? "Complete" : "Ready"}
                  </span>
                </div>
              </div>

              <div className="h-px bg-[#f0f4fb]" />

              {/* You Receive */}
              <div>
                <p className="text-xs text-[#8b99b0] font-semibold uppercase tracking-wider mb-2">You Receive</p>
                <div className="flex items-start gap-2.5 bg-[#fff8f6] rounded-xl p-3 border border-[#ffe4d9]">
                  <div className="w-8 h-8 rounded-lg bg-[#ff7448] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-white" fill="white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#132a52]">Choose how to receive your funds</p>
                    <p className="text-xs text-[#6f7d95] mt-0.5">Mobile money arrives instantly</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {[
                    "Blockchain verified transaction",
                    "Funds held in secure escrow",
                    "Instant withdrawal available",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-[#4b5563]">
                      <Check className="w-3.5 h-3.5 text-[#10b981] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              {isClaimed ? (
                <div className="rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-[#10b981] mx-auto mb-2" />
                  <p className="font-semibold text-[#065f46]">Funds Claimed!</p>
                  {claimedAt && (
                    <p className="text-xs text-[#6f7d95] mt-1">{new Date(claimedAt).toLocaleString()}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {!address && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Connect your wallet to claim funds
                    </p>
                  )}
                  <Button
                    className="w-full h-11 text-base font-semibold"
                    onClick={claimFunds}
                    disabled={!address || isClaiming || transaction.status !== "pending"}
                  >
                    {isClaiming ? "Claiming…" : "Claim Funds"}
                  </Button>
                  <button
                    className="w-full border border-[#ff7448] text-[#ff7448] rounded-lg py-2.5 text-sm font-semibold hover:bg-[#fff8f6] transition-colors"
                    onClick={() => {
                      const txId = transaction.stacksTxId ?? transaction.id;
                      window.open(`https://explorer.stacks.co/txid/${txId}`, "_blank");
                    }}
                  >
                    View Transaction
                  </button>
                </div>
              )}

              {/* Help */}
              <div className="flex items-center gap-1.5 text-xs text-[#8b99b0]">
                <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Need help?{" "}
                  <button className="text-[#ff7448] font-semibold hover:underline">Contact support</button>
                </span>
              </div>
            </div>

            {/* Load another transfer */}
            <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-4">
              <p className="text-sm font-semibold text-[#132a52] mb-3">Load Another Transfer</p>
              <form onSubmit={loadTransaction} className="flex gap-2">
                <Input
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="Transfer ID"
                  className="text-sm"
                />
                <Button type="submit" variant="secondary" size="sm" disabled={isLoading}>
                  {isLoading ? "…" : "Load"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
