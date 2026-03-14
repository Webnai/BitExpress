"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWallet } from "@/components/WalletProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetEstimate, apiSend } from "@/lib/api";

const COUNTRIES = [
  { code: "GHA", name: "Ghana" },
  { code: "NGA", name: "Nigeria" },
  { code: "KEN", name: "Kenya" },
  { code: "TGO", name: "Togo" },
  { code: "SEN", name: "Senegal" },
  { code: "TZA", name: "Tanzania" },
  { code: "UGA", name: "Uganda" },
];

const PAYOUT_METHODS = [
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "crypto_wallet", label: "Crypto Wallet" },
] as const;

type PayoutMethod = (typeof PAYOUT_METHODS)[number]["value"];

export default function SendPage() {
  const { address } = useWallet();
  const [receiverWallet, setReceiverWallet] = useState("");
  const [amountUsd, setAmountUsd] = useState("20");
  const [sourceCountry, setSourceCountry] = useState("GHA");
  const [destCountry, setDestCountry] = useState("NGA");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [stacksTxId, setStacksTxId] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("mobile_money");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimateText, setEstimateText] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<{
    id: string;
    status: string;
    fee: number;
    netAmount: number;
  } | null>(null);

  const parsedAmount = Number.parseFloat(amountUsd) || 0;
  const feeUsd = useMemo(() => (parsedAmount * 1) / 100, [parsedAmount]);
  const totalUsd = useMemo(() => parsedAmount + feeUsd, [parsedAmount, feeUsd]);

  useEffect(() => {
    let cancelled = false;

    async function fetchEstimate() {
      if (parsedAmount <= 0) {
        setEstimateText(null);
        return;
      }
      try {
        const data = await apiGetEstimate(parsedAmount);
        const estimate = data.estimates[destCountry];
        if (!cancelled && estimate) {
          const rounded = estimate.localAmount.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          });
          setEstimateText(`Recipient estimate: ${rounded} ${estimate.currency}`);
        }
      } catch {
        if (!cancelled) setEstimateText(null);
      }
    }

    void fetchEstimate();

    return () => {
      cancelled = true;
    };
  }, [parsedAmount, destCountry]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    if (!receiverWallet.trim()) {
      toast.error("Receiver wallet is required.");
      return;
    }

    if (parsedAmount < 1) {
      toast.error("Amount must be at least $1.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiSend({
        senderWallet: address,
        receiverWallet: receiverWallet.trim(),
        amountUsd: parsedAmount,
        sourceCountry,
        destCountry,
        recipientPhone: recipientPhone.trim() || undefined,
        recipientName: recipientName.trim() || undefined,
        payoutMethod,
        stacksTxId: stacksTxId.trim() || undefined,
      });

      setTransferResult({
        id: response.transfer.id,
        status: response.transfer.status,
        fee: response.transfer.fee,
        netAmount: response.transfer.netAmount,
      });

      toast.success("Transfer created successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send transfer.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="mx-auto max-w-[1080px] px-4 py-8 md:px-6 md:py-10">
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <CardTitle className="text-3xl text-[#132a52]">Send Money</CardTitle>
              <CardDescription className="text-[#6f7d95]">
                Create a remittance transfer with on-chain compatible metadata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="senderWallet">Sender wallet</Label>
                    <Input id="senderWallet" value={address ?? "Not connected"} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiverWallet">Receiver wallet</Label>
                    <Input
                      id="receiverWallet"
                      value={receiverWallet}
                      onChange={(e) => setReceiverWallet(e.target.value)}
                      placeholder="SP..."
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amountUsd">Amount (USD)</Label>
                    <Input
                      id="amountUsd"
                      type="number"
                      min="1"
                      max="10000"
                      step="0.01"
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payoutMethod">Payout method</Label>
                    <select
                      id="payoutMethod"
                      className="flex h-10 w-full rounded-md border border-[#dbe4f0] bg-white px-3 py-2 text-sm text-[#132a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7448]"
                      value={payoutMethod}
                      onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
                    >
                      {PAYOUT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sourceCountry">Source country</Label>
                    <select
                      id="sourceCountry"
                      className="flex h-10 w-full rounded-md border border-[#dbe4f0] bg-white px-3 py-2 text-sm text-[#132a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7448]"
                      value={sourceCountry}
                      onChange={(e) => setSourceCountry(e.target.value)}
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destCountry">Destination country</Label>
                    <select
                      id="destCountry"
                      className="flex h-10 w-full rounded-md border border-[#dbe4f0] bg-white px-3 py-2 text-sm text-[#132a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7448]"
                      value={destCountry}
                      onChange={(e) => setDestCountry(e.target.value)}
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Recipient name (optional)</Label>
                    <Input
                      id="recipientName"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Kwame Mensah"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientPhone">Recipient phone (optional)</Label>
                    <Input
                      id="recipientPhone"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+2348012345678"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stacksTxId">Stacks Contract Tx ID (optional)</Label>
                  <Input
                    id="stacksTxId"
                    value={stacksTxId}
                    onChange={(e) => setStacksTxId(e.target.value)}
                    placeholder="0x..."
                  />
                </div>

                <div className="rounded-xl bg-[#f6f9fe] p-4 text-sm text-[#42526b]">
                  <p>Platform fee (1%): ${feeUsd.toFixed(2)}</p>
                  <p>Total debit: ${totalUsd.toFixed(2)}</p>
                  {estimateText ? <p className="mt-1 text-[#ff7448]">{estimateText}</p> : null}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting || !address}>
                  {isSubmitting ? "Sending..." : "Send Money"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)] h-fit">
            <CardHeader>
              <CardTitle className="text-2xl text-[#132a52]">Transfer Result</CardTitle>
              <CardDescription className="text-[#6f7d95]">
                After submission, use this ID on the Receive page to claim funds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transferResult ? (
                <div className="space-y-3 text-sm">
                  <div className="rounded-md bg-[#f6f9fe] p-3">
                    <p className="text-[#6f7d95]">Transfer ID</p>
                    <p className="font-mono text-[#132a52] break-all">{transferResult.id}</p>
                  </div>
                  <p className="text-[#42526b]">Status: <span className="font-semibold">{transferResult.status}</span></p>
                  <p className="text-[#42526b]">Fee: ${transferResult.fee.toFixed(2)}</p>
                  <p className="text-[#42526b]">Net amount: ${transferResult.netAmount.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-sm text-[#8b99b0]">No transfer submitted yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
