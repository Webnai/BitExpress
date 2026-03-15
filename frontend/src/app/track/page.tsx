"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle, Search, ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetTransaction } from "@/lib/api";
import { getStacksTxExplorerUrl } from "@/lib/stacks";

interface TrackedTransaction {
  id: string;
  status: string;
  sender: string;
  receiver: string;
  amountUsd: number;
  fee: number;
  sourceCountry: { code: string; name?: string };
  destCountry: { code: string; name?: string };
  recipientName?: string;
  recipientPhone?: string;
  payoutMethod?: string;
  stacksTxId?: string;
  onChainTransferId?: number;
  claimStacksTxId?: string;
  refundStacksTxId?: string;
  createdAt: string;
  claimedAt?: string;
  refundedAt?: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "claimed")
    return <CheckCircle2 className="w-6 h-6 text-[#10b981]" />;
  if (status === "pending")
    return <Clock className="w-6 h-6 text-[#f59e0b]" />;
  return <XCircle className="w-6 h-6 text-[#ef4444]" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    claimed: { label: "Claimed", cls: "bg-[#ecfdf5] text-[#059669]" },
    pending: { label: "Pending", cls: "bg-[#fff7ed] text-[#d97706]" },
    refunded: { label: "Refunded", cls: "bg-[#fef2f2] text-[#dc2626]" },
  };
  const s = map[status] ?? { label: status, cls: "bg-[#f3f4f6] text-[#6b7280]" };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${s.cls}`}>{s.label}</span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#f0f4fb] last:border-0">
      <span className="text-sm text-[#8b99b0]">{label}</span>
      <span className="text-sm font-semibold text-[#132a52] text-right break-all max-w-[60%]">{value}</span>
    </div>
  );
}

export default function TrackPage() {
  const router = useRouter();
  const [transferId, setTransferId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [transaction, setTransaction] = useState<TrackedTransaction | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!transferId.trim()) {
      toast.error("Enter a transfer ID.");
      return;
    }
    setIsLoading(true);
    try {
      const data = await apiGetTransaction(transferId.trim());
      setTransaction(data.transaction);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer not found.");
      setTransaction(null);
    } finally {
      setIsLoading(false);
    }
  }

  function copyId() {
    if (!transaction) return;
    navigator.clipboard.writeText(transaction.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="mx-auto max-w-[640px] px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#132a52]">Track Transfer</h1>
          <p className="text-[#6f7d95] mt-1 text-sm">
            Enter a transfer ID to check the status of your transaction
          </p>
        </div>

        {/* Search card */}
        <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.06)] p-6 mb-5">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="transferId">Transfer ID</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b99b0]" />
                <Input
                  id="transferId"
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="e.g. TX-BTC-458932"
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Searching…" : "Track Transfer"}
            </Button>
          </form>
        </div>

        {/* Result card */}
        {transaction && (
          <div className="bg-white rounded-2xl border border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.06)] p-6 space-y-5">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <StatusIcon status={transaction.status} />
                <div>
                  <p className="text-base font-bold text-[#132a52]">Transfer Found</p>
                  <p className="text-xs text-[#8b99b0]">
                    Created {new Date(transaction.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <StatusBadge status={transaction.status} />
            </div>

            <div className="h-px bg-[#f0f4fb]" />

            {/* Details */}
            <div>
              <div className="flex items-center justify-between mb-1 py-3 border-b border-[#f0f4fb]">
                <span className="text-sm text-[#8b99b0]">Transfer ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono font-semibold text-[#132a52]">{transaction.id}</span>
                  <button
                    onClick={copyId}
                    className="text-[#8b99b0] hover:text-[#ff7448] transition-colors p-0.5"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <Row label="Amount" value={`$${transaction.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`} />
              <Row
                label="From"
                value={`${transaction.sourceCountry.name ?? transaction.sourceCountry.code}`}
              />
              <Row
                label="To"
                value={`${transaction.recipientName ?? transaction.receiver} • ${transaction.destCountry.name ?? transaction.destCountry.code}`}
              />
              {transaction.payoutMethod && (
                <Row label="Payout Method" value={transaction.payoutMethod.replace(/_/g, " ")} />
              )}
              {transaction.claimedAt && (
                <Row
                  label="Claimed At"
                  value={new Date(transaction.claimedAt).toLocaleString("en-GB")}
                />
              )}
              {transaction.refundedAt && (
                <Row
                  label="Refunded At"
                  value={new Date(transaction.refundedAt).toLocaleString("en-GB")}
                />
              )}
            </div>

            <div className="h-px bg-[#f0f4fb]" />

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {transaction.status === "pending" && (
                <Button
                  className="w-full"
                  onClick={() => router.push(`/receive?id=${transaction.id}`)}
                >
                  Claim Funds
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
              {transaction.stacksTxId && (
                <a
                  href={getStacksTxExplorerUrl(transaction.stacksTxId)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center border border-[#ff7448] text-[#ff7448] rounded-lg py-2.5 text-sm font-semibold hover:bg-[#fff8f6] transition-colors"
                >
                  Send Tx on Explorer ↗
                </a>
              )}
              {transaction.claimStacksTxId && (
                <a
                  href={getStacksTxExplorerUrl(transaction.claimStacksTxId)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center border border-[#22c55e] text-[#16a34a] rounded-lg py-2.5 text-sm font-semibold hover:bg-[#f0fdf4] transition-colors"
                >
                  Claim Tx on Explorer ↗
                </a>
              )}
              {transaction.refundStacksTxId && (
                <a
                  href={getStacksTxExplorerUrl(transaction.refundStacksTxId)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center border border-[#94a3b8] text-[#64748b] rounded-lg py-2.5 text-sm font-semibold hover:bg-[#f8fafc] transition-colors"
                >
                  Refund Tx on Explorer ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
