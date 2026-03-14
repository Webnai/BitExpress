"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useWallet } from "@/components/WalletProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClaim, apiGetTransaction } from "@/lib/api";

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
  createdAt: string;
}

export default function ReceivePage() {
  const { address } = useWallet();
  const [transferId, setTransferId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [transaction, setTransaction] = useState<LoadedTransaction | null>(null);
  const [claimResult, setClaimResult] = useState<{
    claimedAt?: string;
    reference?: string;
    localAmount?: number;
    localCurrency?: string;
    message?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  async function loadTransaction(event: React.FormEvent) {
    event.preventDefault();
    if (!transferId.trim()) {
      toast.error("Enter a transfer ID.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiGetTransaction(transferId.trim());
      setTransaction(response.transaction);
      setClaimResult(null);
      toast.success("Transaction loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load transaction.";
      toast.error(message);
      setTransaction(null);
      setClaimResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function claimFunds() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!transaction) {
      toast.error("Load a transaction first.");
      return;
    }

    setIsClaiming(true);
    try {
      const response = await apiClaim({
        transferId: transaction.id,
        receiverWallet: address,
        claimCode: claimCode.trim() || undefined,
      });

      setClaimResult({
        claimedAt: response.transfer.claimedAt,
        reference: response.transfer.payout?.reference,
        localAmount: response.transfer.payout?.localAmount,
        localCurrency: response.transfer.payout?.localCurrency,
        message: response.transfer.payout?.message,
      });

      setTransaction((prev) => (prev ? { ...prev, status: "claimed" } : prev));
      toast.success("Funds claimed successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claim failed.";
      toast.error(message);
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="mx-auto max-w-[1080px] px-4 py-8 md:px-6 md:py-10">
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <CardTitle className="text-3xl text-[#132a52]">Receive Money</CardTitle>
              <CardDescription className="text-[#6f7d95]">
                Load a transfer and claim it to your connected wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-4" onSubmit={loadTransaction}>
                <div className="space-y-2">
                  <Label htmlFor="transferId">Transfer ID</Label>
                  <Input
                    id="transferId"
                    value={transferId}
                    onChange={(e) => setTransferId(e.target.value)}
                    placeholder="Paste transfer ID from sender"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimCode">Claim code (optional)</Label>
                  <Input
                    id="claimCode"
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value)}
                    placeholder="Optional claim code"
                  />
                </div>
                <Button type="submit" variant="secondary" className="w-full" disabled={isLoading}>
                  {isLoading ? "Loading..." : "Load Transaction"}
                </Button>
              </form>

              {transaction ? (
                <div className="rounded-xl bg-[#f6f9fe] p-4 text-sm text-[#42526b] space-y-2">
                  <p className="font-semibold text-[#132a52]">Transaction Details</p>
                  <p>Transfer ID: <span className="font-mono break-all">{transaction.id}</span></p>
                  <p>Status: <span className="font-semibold">{transaction.status}</span></p>
                  <p>Amount: ${transaction.amountUsd.toFixed(2)}</p>
                  <p>Net Amount: ${transaction.netAmount.toFixed(2)}</p>
                  <p>From: {transaction.sourceCountry.name ?? transaction.sourceCountry.code}</p>
                  <p>To: {transaction.destCountry.name ?? transaction.destCountry.code}</p>
                  <p>Recipient: {transaction.recipientName || "Not provided"}</p>
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                onClick={claimFunds}
                disabled={!transaction || !address || isClaiming || transaction?.status !== "pending"}
              >
                {isClaiming ? "Claiming..." : "Claim Funds"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] h-fit">
            <CardHeader>
              <CardTitle className="text-2xl text-[#132a52]">Claim Status</CardTitle>
              <CardDescription className="text-[#6f7d95]">
                Payout reference and delivery details appear here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {claimResult ? (
                <div className="space-y-2 text-sm text-[#42526b]">
                  <p>Claimed at: {claimResult.claimedAt ? new Date(claimResult.claimedAt).toLocaleString() : "--"}</p>
                  <p>Payout reference: {claimResult.reference ?? "--"}</p>
                  <p>
                    Local payout: {claimResult.localAmount?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "--"}{" "}
                    {claimResult.localCurrency ?? ""}
                  </p>
                  <p>Message: {claimResult.message ?? "--"}</p>
                </div>
              ) : (
                <p className="text-sm text-[#8b99b0]">No claim yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
