"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { logClientError, logClientInfo } from "@/lib/debug";
import {
  createClaimRemittanceTx,
  getStacksTxExplorerUrl,
  normalizeClaimSecretHex,
  waitForStacksTxSuccess,
} from "@/lib/stacks";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoadedTransaction {
  id: string;
  sender: string;
  receiver: string;
  onChainTransferId?: number;
  claimStacksTxId?: string;
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

function isStacksWalletAddress(value: string): boolean {
  return /^(SP|ST|SM|SN)[A-Z0-9]+$/.test(value);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReceivePage() {
  const { address } = useWallet();
  const searchParams = useSearchParams();
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
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [claimTxId, setClaimTxId] = useState<string | null>(null);

  // Fetch live BTC/USD price from backend exchange rate service
  useEffect(() => {
    apiGetExchangeRates()
      .then((data) => {
        const first = Object.values(data.rates)[0];
        if (first?.btcUsdPrice) setBtcUsdPrice(first.btcUsdPrice);
        logClientInfo("receive.exchange_rates.loaded", {
          rateCount: Object.keys(data.rates).length,
        });
      })
      .catch((error) => {
        logClientError("receive.exchange_rates.failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });
  }, []);

  // Load recent receives from wallet history
  useEffect(() => {
    if (!address) return;
    apiGetWalletHistory(address)
      .then((data) => {
        const received = data.received.slice(0, 4).map((r) => ({
            id: r.id,
            counterpartyWallet: r.counterpartyWallet ?? "",
            counterpartyName: r.counterpartyName,
            amountUsd: r.amountUsd,
            countryName: r.countryName,
            createdAt: r.createdAt,
          }));

        setRecentReceives(received);
        logClientInfo("receive.history.loaded", {
          address,
          count: received.length,
        });

        if (!hasAutoLoaded && !searchParams.get("id") && received.length > 0) {
          setTransferId(received[0].id);
          void fetchTransaction(received[0].id);
          setHasAutoLoaded(true);
        }
      })
      .catch((error) => {
        logClientError("receive.history.failed", {
          address,
          message: error instanceof Error ? error.message : "unknown",
        });
      });
  }, [address, hasAutoLoaded, searchParams]);

  // Load transfer from query string: /receive?id=TX-...
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || hasAutoLoaded) return;
    setTransferId(id);
    void fetchTransaction(id);
    setHasAutoLoaded(true);
  }, [searchParams, hasAutoLoaded]);

  async function fetchTransaction(id: string) {
    setIsLoading(true);
    try {
      logClientInfo("receive.transaction_fetch.started", { transferId: id.trim() });
      const data = await apiGetTransaction(id.trim());
      setTransaction(data.transaction);
      setSelectedMethod((data.transaction.payoutMethod as WithdrawalMethod) ?? "mobile_money");
      setClaimedAt(data.transaction.claimedAt ?? null);
      logClientInfo("receive.transaction_fetch.succeeded", {
        transferId: data.transaction.id,
        status: data.transaction.status,
      });
      toast.success("Transaction loaded.");
    } catch (err) {
      logClientError("receive.transaction_fetch.failed", {
        transferId: id.trim(),
        message: err instanceof Error ? err.message : "unknown",
      });
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
    if (!transaction) {
      toast.error("Load a transfer first, then paste the claim secret.");
      return;
    }

    const transactionStatus = String(transaction.status ?? "").toLowerCase();
    if (transactionStatus !== "pending" && transactionStatus !== "ready") {
      toast.error(`This transfer cannot be claimed yet (status: ${transaction.status}).`);
      return;
    }

    if (transaction.onChainTransferId === undefined) {
      toast.error("Missing on-chain transfer id. Reload transfer details and try again.");
      return;
    }

    const claimSecretInput = claimCode.trim();
    if (!claimSecretInput) {
      toast.error("Enter the 32-byte claim secret to unlock escrow.");
      return;
    }

    setIsClaiming(true);
    try {
      const normalizedClaimSecret = normalizeClaimSecretHex(claimSecretInput);
      logClientInfo("receive.claim.started", {
        transferId: transaction.id,
        onChainTransferId: transaction.onChainTransferId,
      });
      const claimTx = await createClaimRemittanceTx({
        transferId: transaction.onChainTransferId,
        claimSecretHex: normalizedClaimSecret,
      });

      setClaimTxId(claimTx.txid);
      logClientInfo("receive.claim.broadcasted", {
        transferId: transaction.id,
        claimTxId: claimTx.txid,
      });
      toast.success("On-chain claim transaction broadcast.");

      logClientInfo("receive.claim_confirmation_wait.started", {
        transferId: transaction.id,
        claimTxId: claimTx.txid,
      });
      await waitForStacksTxSuccess(claimTx.txid);
      logClientInfo("receive.claim_confirmation_wait.succeeded", {
        transferId: transaction.id,
        claimTxId: claimTx.txid,
      });

      const res = await apiClaim({
        transferId: transaction.id,
        claimCode: normalizedClaimSecret,
        claimStacksTxId: claimTx.txid,
      });
      logClientInfo("receive.claim.succeeded", {
        transferId: transaction.id,
        claimTxId: claimTx.txid,
        status: res.transfer.status,
      });
      setClaimedAt(res.transfer.claimedAt ?? new Date().toISOString());
      setTransaction((prev) => (prev ? { ...prev, status: "claimed" } : prev));
      toast.success("Funds claimed successfully!");
    } catch (err) {
      logClientError("receive.claim.failed", {
        transferId: transaction.id,
        message: err instanceof Error ? err.message : "unknown",
      });
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
  const normalizedTransactionStatus = String(transaction?.status ?? "").toLowerCase();
  const isClaimableTransaction = normalizedTransactionStatus === "pending" || normalizedTransactionStatus === "ready";
  const flagCountry = toFlagCountry(transaction?.sourceCountry.name);
  const senderLabel = transaction
    ? transaction.recipientName ?? truncateAddress(transaction.sender)
    : "No transfer loaded";
  const sourceCountryLabel =
    transaction?.sourceCountry.name ?? transaction?.sourceCountry.code ?? "Unknown";
  const createdDate = transaction
    ? new Date(transaction.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "--";
  const createdTime = transaction
    ? `${new Date(transaction.createdAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })} GMT`
    : "--";
  const statusLabel = !transaction ? "Not loaded" : isClaimed ? "Claimed" : "Ready to Claim";
  const isReceiverStacksReady = Boolean(address && isStacksWalletAddress(address));

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
      subtitle: "Paystack for Ghana/Kenya, CinetPay for supported West African rails",
      badge: "Instant",
      badgeColor: "bg-[#ecfdf5] text-[#059669]",
    },
    {
      method: "bank_transfer",
      icon: <Building2 className="w-5 h-5 text-[#3b82f6]" />,
      iconBg: "bg-[#eff6ff]",
      title: "Bank Payout",
      subtitle: "Disabled until a live bank disbursement rail is integrated",
      badge: "Offline",
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

  if (address && !isReceiverStacksReady) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <div className="mx-auto max-w-[860px] px-4 py-10 md:px-6">
          <div className="rounded-2xl border border-[var(--color-danger-500)] bg-[var(--color-danger-soft)] p-6 shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
            <h1 className="text-2xl font-bold text-[var(--color-heading)]">Wallet Setup Needed</h1>
            <p className="mt-2 text-sm text-[var(--color-text)]">
              Your current wallet is not ready for claim yet. Connect a supported wallet, then return to this page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/fund"
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[#0f0f0f]"
              >
                Open Funding Help
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                Back To Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main loaded UI ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-[var(--color-heading)]">Receive Money</h1>
          <p className="text-[var(--color-text-muted)] mt-1 text-sm">Claim your incoming Stacks-secured transfer and trigger the mobile-money payout</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* ── Left column ── */}
          <div className="space-y-4">
            {/* Status banner */}
            {isClaimed ? (
              <div className="flex items-center justify-between bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 text-[var(--color-primary)] font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)]" />
                  Payment Received Successfully
                </div>
                <span className="text-xs bg-[var(--color-primary)] text-[#0f0f0f] px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Verified
                </span>
              </div>
            ) : transaction ? (
              <div className="flex items-center justify-between bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 text-[var(--color-primary)] font-semibold text-sm">
                  <Clock className="w-5 h-5 text-[var(--color-primary)]" />
                  Transfer Ready to Claim
                </div>
                <span className="text-xs bg-[var(--color-primary)] text-[#0f0f0f] px-2.5 py-0.5 rounded-full font-semibold">
                  Pending
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 text-[var(--color-text)] font-semibold text-sm">
                  <Clock className="w-5 h-5 text-[var(--color-text)]" />
                  Load a transfer to view claim details
                </div>
                <span className="text-xs bg-[var(--color-border)] text-[var(--color-text)] px-2.5 py-0.5 rounded-full font-semibold">
                  Waiting
                </span>
              </div>
            )}

            {/* Main transaction card */}
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_4px_18px_rgba(0,0,0,0.2)] p-6 space-y-5">
              {/* From */}
              <div>
                <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-3">From</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[#0088cc] flex items-center justify-center text-[#0f0f0f] text-sm font-bold flex-shrink-0">
                    {getInitials(senderLabel)}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-heading)]">{senderLabel}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {transaction && flagCountry ? (
                        <CountryFlag country={flagCountry} size={16} />
                      ) : (
                        <span className="text-base">{sourceCountryLabel}</span>
                      )}
                      <span className="text-sm text-[var(--color-text-muted)]">{sourceCountryLabel}</span>
                      {transaction && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] ml-0.5" title="verified" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[var(--color-border)]" />

              {/* Amount Received */}
              <div>
                <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-3">Amount Received</p>
                <div className="rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-[var(--color-heading)] tracking-tight">{formatBtc(btcAmount)}</p>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">
                      ≈ ${transaction?.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"} USD
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className="px-3 py-1.5 rounded-full bg-[var(--color-primary)] text-[#0f0f0f] text-sm font-semibold">BTC</span>
                    <span className="px-3 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] text-sm font-semibold">sBTC</span>
                  </div>
                </div>
              </div>

              {/* Transaction metadata grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Transaction ID – full width */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 col-span-2 relative">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">Transaction ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-semibold text-[var(--color-heading)] break-all flex-1">{transaction?.id ?? "--"}</p>
                    <button
                      onClick={copyTxId}
                      className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors p-1"
                      title="Copy ID"
                    >
                      {copiedId ? <Check className="w-4 h-4 text-[var(--color-primary)]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[var(--color-text-muted)]">Date &amp; Time</p>
                    <Clock className="w-3.5 h-3.5 text-[var(--color-border)]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">{createdDate}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{createdTime}</p>
                </div>

                {/* Network */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[var(--color-text-muted)]">Network</p>
                    <Info className="w-3.5 h-3.5 text-[var(--color-border)]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">Bitcoin Mainnet</p>
                </div>

                {/* Confirmations */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[var(--color-text-muted)]">Confirmations</p>
                    <Info className="w-3.5 h-3.5 text-[var(--color-border)]" />
                  </div>
                  <p className={`text-sm font-semibold ${isClaimed ? "text-[var(--color-primary)]" : "text-[var(--color-danger-500)]"}`}>
                    {isClaimed ? "6/6 Confirmed" : "Awaiting confirm."}
                  </p>
                </div>

                {/* Transaction Fee */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-[var(--color-text-muted)]">Transaction Fee</p>
                    <Info className="w-3.5 h-3.5 text-[var(--color-border)]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">{feeBtc.toFixed(5)} BTC</p>
                </div>

                {/* Status – full width */}
                <div className="rounded-xl bg-[var(--color-surface-muted)] p-3 col-span-2">
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">Status</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isClaimed ? "bg-[var(--color-primary)]" : "bg-[var(--color-danger-500)]"}`} />
                    <p className="text-sm font-semibold text-[var(--color-heading)]">
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Withdrawal Methods */}
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_4px_18px_rgba(0,0,0,0.2)] p-6">
              <p className="text-base font-semibold text-[var(--color-heading)] mb-4">Choose Withdrawal Method</p>
              <div className="space-y-3">
                {withdrawalMethods.map(({ method, icon, iconBg, title, subtitle, badge, badgeColor }) => (
                  <button
                    key={method}
                    onClick={() => setSelectedMethod(method)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all text-left ${
                      selectedMethod === method
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-heading)]">{title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>
                      <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Receives */}
            {recentReceives.length > 0 && (
              <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_4px_18px_rgba(0,0,0,0.2)] p-6">
                <p className="text-base font-semibold text-[var(--color-heading)] mb-4">Recent Receives</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {recentReceives.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => fetchTransaction(r.id)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[var(--color-surface-muted)] transition-colors text-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[#0088cc] flex items-center justify-center text-[#0f0f0f] text-sm font-bold">
                        {getInitials(r.counterpartyName ?? r.counterpartyWallet)}
                      </div>
                      <p className="text-xs font-semibold text-[var(--color-heading)] leading-tight line-clamp-1 w-full">
                        {r.counterpartyName ?? truncateAddress(r.counterpartyWallet)}
                      </p>
                      <p className="text-xs font-bold text-[var(--color-primary)]">{formatBtc(r.amountUsd / btcUsdPrice)} BTC</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{timeAgo(r.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_4px_18px_rgba(0,0,0,0.2)] p-6 space-y-5">
              {/* Header */}
              <div>
                <h2 className="text-xl font-bold text-[var(--color-heading)]">Claim Summary</h2>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-xs text-[var(--color-primary)] font-semibold">Blockchain Verified</span>
                </div>
              </div>

              {/* Available to claim */}
              <div className="rounded-xl bg-[var(--color-surface-muted)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Available to Claim</p>
                <p className="text-3xl font-bold text-[var(--color-heading)]">
                  {formatBtc(btcAmount)}{" "}
                  <span className="text-lg font-semibold">BTC</span>
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  ${transaction?.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"} USD
                </p>
                <p className="text-xs text-[var(--color-primary)] mt-1 font-semibold">▲ +2.3% (24h)</p>
              </div>

              <div className="h-px bg-[var(--color-border)]" />

              {/* Fee breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Original Amount</span>
                  <span className="font-semibold text-[var(--color-heading)]">{formatBtc(btcAmount)} BTC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Network Fee</span>
                  <span className="text-xs text-[var(--color-primary)] font-semibold">Paid by sender</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-muted)]">Processing Status</span>
                  <span className={`text-xs font-semibold ${isClaimed ? "text-[var(--color-primary)]" : "text-[var(--color-danger-500)]"}`}>
                    {isClaimed ? "Complete" : "Ready"}
                  </span>
                </div>
              </div>

              <div className="h-px bg-[var(--color-border)]" />

              {/* You Receive */}
              <div>
                <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-2">You Receive</p>
                <div className="flex items-start gap-2.5 bg-[var(--color-primary-soft)] rounded-xl p-3 border border-[var(--color-primary)]">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-[#0f0f0f]" fill="#0f0f0f" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Choose how to receive your funds</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Mobile money arrives instantly</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {[
                    "Blockchain verified transaction",
                    "Funds held in secure escrow",
                    "Instant withdrawal available",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-[var(--color-text)]">
                      <Check className="w-3.5 h-3.5 text-[var(--color-primary)] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              {isClaimed ? (
                <div className="rounded-xl bg-[var(--color-primary-soft)] border border-[var(--color-primary)] p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-[var(--color-primary)] mx-auto mb-2" />
                  <p className="font-semibold text-[var(--color-heading)]">Funds Claimed!</p>
                  {claimedAt && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">{new Date(claimedAt).toLocaleString()}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-secret-input">Claim Secret (32-byte hex)</Label>
                    <Input
                      id="claim-secret-input"
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value)}
                      placeholder="Paste the 64-char claim secret"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      This secret is required to execute <span className="font-mono">claim-remittance</span> on-chain.
                    </p>
                  </div>

                  {claimTxId ? (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text)]">
                      <p className="font-semibold text-[var(--color-heading)]">Latest Claim Tx</p>
                      <p className="mt-1 break-all">{claimTxId}</p>
                      <a
                        href={getStacksTxExplorerUrl(claimTxId)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-[var(--color-primary)] hover:underline"
                      >
                        View in explorer
                      </a>
                    </div>
                  ) : null}

                  {!address && (
                    <p className="text-xs text-[var(--color-danger-500)] bg-[var(--color-danger-soft)] border border-[var(--color-danger-500)] rounded-lg px-3 py-2">
                      Connect your wallet to claim funds
                    </p>
                  )}
                  <Button
                    className="w-full h-11 text-base font-semibold"
                    onClick={claimFunds}
                    disabled={isClaiming || isClaimed || !isClaimableTransaction}
                  >
                    {isClaiming ? "Claiming…" : "Claim Funds"}
                  </Button>
                  <button
                    className="w-full border border-[var(--color-primary)] text-[var(--color-primary)] rounded-lg py-2.5 text-sm font-semibold hover:bg-[var(--color-primary-soft)] transition-colors"
                    onClick={() => {
                      if (!transaction) return;
                      const txId = claimTxId ?? transaction.stacksTxId ?? transaction.id;
                      window.open(getStacksTxExplorerUrl(txId), "_blank");
                    }}
                    disabled={!transaction}
                  >
                    View Transaction
                  </button>
                </div>
              )}

              {/* Help */}
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Need help?{" "}
                  <button className="text-[var(--color-primary)] font-semibold hover:underline">Contact support</button>
                </span>
              </div>
            </div>

            {/* Load another transfer */}
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-[0_4px_18px_rgba(0,0,0,0.2)] p-4">
              <p className="text-sm font-semibold text-[var(--color-heading)] mb-3">Load Another Transfer</p>
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
