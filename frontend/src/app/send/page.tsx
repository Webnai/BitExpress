"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import CountryFlag from "@/components/CountryFlag";
import { useWallet } from "@/components/WalletProvider";
import {
  apiGetExchangeRates,
  apiGetSbtcBalance,
  apiGetWalletHistory,
  apiSend,
} from "@/lib/api";
import {
  createSendRemittanceTx,
  generateClaimSecretHex,
  getStacksTxExplorerUrl,
  waitForStacksTxSuccess,
  usdToSbtcSatoshis,
} from "@/lib/stacks";
import { logClientError, logClientInfo } from "@/lib/debug";
import { Copy, Check } from "lucide-react";

const COUNTRY_OPTIONS = [
  { code: "GHA", name: "Ghana" },
  { code: "NGA", name: "Nigeria" },
  { code: "KEN", name: "Kenya" },
  { code: "TGO", name: "Togo" },
  { code: "SEN", name: "Senegal" },
  { code: "TZA", name: "Tanzania" },
  { code: "UGA", name: "Uganda" },
] as const;

const FLAG_COUNTRY_BY_CODE: Partial<Record<(typeof COUNTRY_OPTIONS)[number]["code"], "Ghana" | "Nigeria" | "Kenya" | "Togo">> = {
  GHA: "Ghana",
  NGA: "Nigeria",
  KEN: "Kenya",
  TGO: "Togo",
};

function getFlagCountry(code: string) {
  return FLAG_COUNTRY_BY_CODE[code as keyof typeof FLAG_COUNTRY_BY_CODE];
}

const PAY_METHODS = [
  { key: "mobile_money", title: "Mobile Money", icon: "📱" },
  { key: "crypto_wallet", title: "Crypto Wallet", icon: "₿" },
] as const;

type PayoutMethod = (typeof PAY_METHODS)[number]["key"];
type AmountUnit = "usd" | "sbtc";

type WalletHistoryRecipient = {
  wallet: string;
  name?: string;
  countryCode: string;
  countryName: string;
};

type ExchangeRateMap = Record<
  string,
  {
    from: string;
    to: string;
    rate: number;
    btcUsdPrice: number;
    updatedAt: string;
  }
>;

type CountryMetaMap = Record<
  string,
  {
    code: string;
    name: string;
    currency: string;
    currencySymbol: string;
    mobileMoney: string;
    supportsMobileMoneyPayout: boolean;
    mobileMoneyProvider?: string;
    mobileMoneyOperators: Array<{
      code: string;
      label: string;
      provider: string;
    }>;
    flag: string;
  }
>;

function shortWallet(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function initialsFromName(value?: string) {
  if (!value) return "RW";
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isLikelyStacksAddress(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^S[PTMN][A-Z0-9]{20,60}$/.test(normalized);
}

function formatSbtcFromSats(sats: number): string {
  const normalized = Math.max(0, sats);
  return (normalized / 100_000_000).toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export default function SendPage() {
  const { address } = useWallet();
  const [sourceCountry, setSourceCountry] = useState("GHA");
  const [destCountry, setDestCountry] = useState("KEN");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientMobileProvider, setRecipientMobileProvider] = useState("");
  const [receiverWallet, setReceiverWallet] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("usd");
  const [amountUsdInput, setAmountUsdInput] = useState("20.00");
  const [amountSbtcInput, setAmountSbtcInput] = useState("0.00030769");
  const [method, setMethod] = useState<PayoutMethod>("mobile_money");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStacksTxId, setPendingStacksTxId] = useState<string | null>(null);
  const [pendingClaimSecret, setPendingClaimSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [rates, setRates] = useState<ExchangeRateMap>({});
  const [countryMeta, setCountryMeta] = useState<CountryMetaMap>({});
  const [sbtcBalance, setSbtcBalance] = useState<string | null>(null);
  const [sbtcAssetIdentifier, setSbtcAssetIdentifier] = useState<string | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<WalletHistoryRecipient[]>([]);
  const [transferResult, setTransferResult] = useState<{
    id: string;
    status: string;
    fee: number;
    netAmount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      try {
        const response = await apiGetExchangeRates();
        if (cancelled) return;
        setRates(response.rates as ExchangeRateMap);
        setCountryMeta(
          Object.fromEntries(response.supportedCountries.map((entry) => [entry.code, entry])) as CountryMetaMap,
        );
        logClientInfo("send.exchange_rates.loaded", {
          countries: response.supportedCountries.map((entry) => entry.code),
        });
      } catch (error) {
        if (!cancelled) {
          logClientError("send.exchange_rates.failed", {
            message: error instanceof Error ? error.message : "unknown",
          });
          toast.error(error instanceof Error ? error.message : "Failed to load exchange rates.");
        }
      }
    }

    void loadRates();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWalletData() {
      if (!address) {
        setSbtcBalance(null);
        setSbtcAssetIdentifier(null);
        setRecentRecipients([]);
        return;
      }

      const [balanceResult, historyResult] = await Promise.allSettled([
        apiGetSbtcBalance(address),
        apiGetWalletHistory(address),
      ]);

      if (cancelled) return;

      if (balanceResult.status === "fulfilled") {
        setSbtcBalance(balanceResult.value.balance);
        setSbtcAssetIdentifier(balanceResult.value.assetIdentifier);
        logClientInfo("send.wallet_balance.loaded", {
          address,
          assetIdentifier: balanceResult.value.assetIdentifier,
          balance: balanceResult.value.balance,
        });
      } else {
        setSbtcAssetIdentifier(null);
        logClientError("send.wallet_balance.failed", {
          address,
          message: balanceResult.reason instanceof Error ? balanceResult.reason.message : "unknown",
        });
      }

      if (historyResult.status === "fulfilled") {
        const recipients = historyResult.value.sent
          .map((entry) => ({
            wallet: entry.counterpartyWallet,
            name: entry.counterpartyName,
            countryCode: entry.countryCode,
            countryName: entry.countryName || entry.countryCode,
          }))
          .filter((entry, index, array) => {
            return array.findIndex((candidate) => candidate.wallet === entry.wallet) === index;
          })
          .slice(0, 4);
        setRecentRecipients(recipients);
        logClientInfo("send.recipients.loaded", {
          address,
          recipients: recipients.length,
        });
      } else {
        logClientError("send.recipients.failed", {
          address,
          message: historyResult.reason instanceof Error ? historyResult.reason.message : "unknown",
        });
      }
    }

    void loadWalletData();

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (method !== "mobile_money") {
      setRecipientMobileProvider("");
      return;
    }

    const operators = countryMeta[destCountry]?.mobileMoneyOperators ?? [];
    if (!operators.length) {
      setRecipientMobileProvider("");
      return;
    }

    if (!operators.some((operator) => operator.code === recipientMobileProvider)) {
      setRecipientMobileProvider(operators[0].code);
    }
  }, [countryMeta, destCountry, method, recipientMobileProvider]);

  const selectedRate = rates[destCountry];
  const selectedCountryMeta = countryMeta[destCountry];
  const selectedMobileMoneyOperators = selectedCountryMeta?.mobileMoneyOperators ?? [];
  const selectedOperator = selectedMobileMoneyOperators.find(
    (operator) => operator.code === recipientMobileProvider
  );
  const btcUsdPrice = selectedRate?.btcUsdPrice ?? 65000;
  const amountUsd =
    amountUnit === "usd"
      ? Number.parseFloat(amountUsdInput) || 0
      : (Number.parseFloat(amountSbtcInput) || 0) * btcUsdPrice;
  const amountSatoshis =
    amountUnit === "usd"
      ? usdToSbtcSatoshis(amountUsd, btcUsdPrice)
      : Math.max(0, Math.round((Number.parseFloat(amountSbtcInput) || 0) * 100_000_000));
  const feeUsd = amountUsd * 0.01;
  const networkFeeUsd = 0;
  const totalUsd = amountUsd + feeUsd + networkFeeUsd;
  const recipientGetsUsd = Math.max(amountUsd - feeUsd, 0);
  const localPerUsd = selectedRate ? selectedRate.rate / Math.max(selectedRate.btcUsdPrice, 1) : 0;
  const recipientGetsLocal = recipientGetsUsd * localPerUsd;
  const connectedBalanceSats = sbtcBalance === null ? null : Number(sbtcBalance);
  const hasValidSbtcBalance = connectedBalanceSats !== null && Number.isFinite(connectedBalanceSats);
  const connectedBalanceSbtc = hasValidSbtcBalance ? connectedBalanceSats / 100_000_000 : null;
  const hasLoadedSbtcBalance = connectedBalanceSats !== null;
  const selectedFlagCountry = getFlagCountry(destCountry);
  const receiverWalletNormalized = receiverWallet.trim();
  const recipientNameNormalized = recipientName.trim();
  const phoneNormalized = phone.trim();
  const isAmountValid = Number.isFinite(amountUsd) && amountUsd >= 1 && amountUsd <= 10000;
  const isRecipientWalletValid = isLikelyStacksAddress(receiverWalletNormalized);
  const requiresPhone = method === "mobile_money";
  const requiresMobileOperator = method === "mobile_money";
  const isPhoneValid = !requiresPhone || phoneNormalized.length >= 8;
  const isLiveMobileMoneyAvailable =
    method !== "mobile_money" || Boolean(selectedCountryMeta?.supportsMobileMoneyPayout);
  const isMobileOperatorValid =
    !requiresMobileOperator || selectedMobileMoneyOperators.some((operator) => operator.code === recipientMobileProvider);
  const isRecipientNameValid = recipientNameNormalized.length > 1;
  const hasEnoughSbtcBalance = hasValidSbtcBalance && amountSatoshis <= connectedBalanceSats;
  const canSubmitForm =
    Boolean(address) &&
    isAmountValid &&
    isRecipientWalletValid &&
    isPhoneValid &&
    isLiveMobileMoneyAvailable &&
    isMobileOperatorValid &&
    isRecipientNameValid &&
    hasEnoughSbtcBalance;

  const sendMaxLabel = useMemo(() => {
    if (connectedBalanceSbtc === null) return null;
    return `${connectedBalanceSbtc.toLocaleString(undefined, { maximumFractionDigits: 6 })} sBTC connected`;
  }, [connectedBalanceSbtc]);

  function handleAmountInputChange(nextValue: string) {
    if (amountUnit === "usd") {
      setAmountUsdInput(nextValue);
      const parsedUsd = Number.parseFloat(nextValue);
      if (Number.isFinite(parsedUsd) && parsedUsd >= 0) {
        setAmountSbtcInput(formatSbtcFromSats(usdToSbtcSatoshis(parsedUsd, btcUsdPrice)));
      }
      return;
    }

    setAmountSbtcInput(nextValue);
    const parsedSbtc = Number.parseFloat(nextValue);
    if (Number.isFinite(parsedSbtc) && parsedSbtc >= 0) {
      setAmountUsdInput((parsedSbtc * btcUsdPrice).toFixed(2));
    }
  }

  function handleAmountUnitChange(nextUnit: AmountUnit) {
    if (nextUnit === amountUnit) {
      return;
    }

    if (nextUnit === "usd") {
      const parsedSbtc = Number.parseFloat(amountSbtcInput) || 0;
      setAmountUsdInput((parsedSbtc * btcUsdPrice).toFixed(2));
    } else {
      const parsedUsd = Number.parseFloat(amountUsdInput) || 0;
      setAmountSbtcInput(formatSbtcFromSats(usdToSbtcSatoshis(parsedUsd, btcUsdPrice)));
    }

    setAmountUnit(nextUnit);
  }

  function createIdempotencyKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function finalizeBackendTransfer(txid: string, idempotencyKey: string) {
    logClientInfo("send.backend_finalize.started", {
      txid,
      idempotencyKey,
      amountUsd,
      payoutMethod: method,
    });

    const response = await apiSend({
      receiverWallet: receiverWalletNormalized,
      amountUsd,
      sourceCountry,
      destCountry,
      recipientPhone: phoneNormalized || undefined,
      recipientName: recipientNameNormalized || undefined,
      recipientMobileProvider: method === "mobile_money" ? recipientMobileProvider : undefined,
      payoutMethod: method,
      stacksTxId: txid,
      idempotencyKey,
    });

    setTransferResult({
      id: response.transfer.id,
      status: response.transfer.status,
      fee: response.transfer.fee,
      netAmount: response.transfer.netAmount,
    });

    logClientInfo("send.backend_finalize.succeeded", {
      txid,
      transferId: response.transfer.id,
      status: response.transfer.status,
    });

    return response;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    if (!isRecipientWalletValid) {
      toast.error("Enter a valid recipient Stacks wallet address.");
      return;
    }

    if (!isAmountValid) {
      toast.error("Enter an amount between $1 and $10,000 USD equivalent.");
      return;
    }

    if (!hasEnoughSbtcBalance) {
      toast.error("Insufficient sBTC balance for this transfer amount.");
      return;
    }

    if (!isRecipientNameValid) {
      toast.error("Recipient name is required.");
      return;
    }

    if (!isPhoneValid) {
      toast.error("Recipient phone is required for mobile money payout.");
      return;
    }

    if (!isLiveMobileMoneyAvailable) {
      toast.error("This corridor is not available for live mobile-money payout yet.");
      return;
    }

    if (!isMobileOperatorValid) {
      toast.error("Select the recipient's mobile-money operator.");
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = submissionKey ?? createIdempotencyKey();
      let txid = pendingStacksTxId;

      logClientInfo("send.submit.started", {
        senderWallet: address,
        receiverWallet: receiverWalletNormalized,
        amountUsd,
        sourceCountry,
        destCountry,
        payoutMethod: method,
        pendingStacksTxId: txid,
      });

      if (!txid) {
        const claimSecretHex = generateClaimSecretHex();

        // This token contract uses direct transfer (no approve/allowance flow).
        toast.info("Sending remittance transaction...");
        const contractCall = await createSendRemittanceTx({
          receiverWallet: receiverWalletNormalized,
          amountSatoshis,
          sourceCountry,
          destCountry,
          claimSecretHex,
        });

        txid = contractCall.txid;
        logClientInfo("send.contract_broadcasted", {
          txid,
          receiverWallet: receiverWalletNormalized,
        });
        setPendingStacksTxId(txid);
        setPendingClaimSecret(claimSecretHex);
        setSubmissionKey(idempotencyKey);
        toast.success("On-chain escrow transaction broadcast successfully.");
      }

      logClientInfo("send.tx_confirmation_wait.started", { txid });
      await waitForStacksTxSuccess(txid);
      logClientInfo("send.tx_confirmation_wait.succeeded", { txid });

      const backendResponse = await finalizeBackendTransfer(txid, idempotencyKey);
      setSubmissionKey(null);

      logClientInfo("send.submit.succeeded", {
        txid,
        transferId: backendResponse.transfer.id,
        status: backendResponse.transfer.status,
      });

      toast.success("Transfer created successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";

      // Clear cached tx state when the on-chain tx is terminally failed, so next submit creates a new tx.
      if (
        message.includes("failed on-chain") ||
        message.includes("On-chain transaction failed") ||
        message.includes("abort_by_response") ||
        message.includes("abort_by_post_condition") ||
        message.includes("Transaction failed on-chain")
      ) {
        setPendingStacksTxId(null);
        setPendingClaimSecret(null);
        setSubmissionKey(null);
        logClientInfo("send.pending_tx_cleared", {
          reason: "terminal_on_chain_failure",
          message,
        });
      }

      logClientError("send.submit.failed", {
        message,
        pendingStacksTxId,
      });
      toast.error(error instanceof Error ? error.message : "Failed to send transfer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-[1180px] mx-auto px-4 py-8 md:px-6">
        <form className="grid gap-5 xl:grid-cols-[2fr_1fr]" onSubmit={handleSubmit}>
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_6px_20px_rgba(0,0,0,0.3)] md:p-7">
            <h1 className="text-4xl font-bold text-[var(--color-heading)]">Send Money</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Transfer funds securely across Africa</p>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Recipient Information</p>

              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Sender Country</label>
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={sourceCountry}
                    onChange={(e) => setSourceCountry(e.target.value)}
                    className="w-full appearance-none bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                  >
                    {COUNTRY_OPTIONS.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[var(--color-text-muted)]">▾</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Recipient Country</label>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {selectedFlagCountry ? (
                      <CountryFlag country={selectedFlagCountry} variant={1} size={20} className="h-5 w-5 rounded-sm object-cover" />
                    ) : null}
                  </div>
                  <select
                    value={destCountry}
                    onChange={(e) => setDestCountry(e.target.value)}
                    className="w-full appearance-none bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                  >
                    {COUNTRY_OPTIONS.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[var(--color-text-muted)]">▾</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Phone Number</label>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                    placeholder="+233 24 123 4567"
                    required={requiresPhone}
                  />
                  <span className="text-[var(--color-text-muted)]">ⓘ</span>
                </div>
                {requiresPhone ? (
                  <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Required for mobile money payout.</p>
                ) : null}
              </div>

              {requiresMobileOperator ? (
                <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                  <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Mobile Money Operator</label>
                  {selectedMobileMoneyOperators.length ? (
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={recipientMobileProvider}
                        onChange={(e) => setRecipientMobileProvider(e.target.value)}
                        className="w-full appearance-none bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                      >
                        {selectedMobileMoneyOperators.map((operator) => (
                          <option key={operator.code} value={operator.code}>
                            {operator.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-[var(--color-text-muted)]">▾</span>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-[var(--color-danger-500)]">
                      Live mobile-money payout is not available for this country via Paystack or CinetPay.
                    </p>
                  )}
                  {selectedOperator ? (
                    <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                      Routed through {selectedOperator.provider === "paystack" ? "Paystack" : "CinetPay"}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Recipient Name</label>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                  placeholder="Kwame Mensah"
                  required
                />
              </div>

              <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">Recipient Wallet</label>
                <input
                  value={receiverWallet}
                  onChange={(e) => setReceiverWallet(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[var(--color-text)] outline-none"
                  placeholder="SP..."
                  required
                />
                <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Use recipient STX address (starts with SP, ST, SM, or SN).</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">You Send</p>

              <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <input
                    value={amountUnit === "usd" ? amountUsdInput : amountSbtcInput}
                    onChange={(e) => handleAmountInputChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-4xl font-bold text-[var(--color-heading)] outline-none"
                    inputMode="decimal"
                  />
                  <div className="h-fit rounded-full bg-[var(--color-border)] p-1 text-[10px] font-semibold text-[var(--color-text-muted)]">
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 ${amountUnit === "usd" ? "bg-[var(--color-primary)] text-[#0f0f0f]" : "text-[var(--color-text-muted)]"}`}
                      onClick={() => handleAmountUnitChange("usd")}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 ${amountUnit === "sbtc" ? "bg-[var(--color-primary)] text-[#0f0f0f]" : "text-[var(--color-text-muted)]"}`}
                      onClick={() => handleAmountUnitChange("sbtc")}
                    >
                      sBTC
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[var(--color-primary)]">
                {sendMaxLabel ? `Connected balance: ${sendMaxLabel}` : "Connect wallet to load balance"}
              </p>
              {hasLoadedSbtcBalance && connectedBalanceSats === 0 ? (
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Connected wallet has 0 sBTC for {sbtcAssetIdentifier ?? "the configured asset"}. Fund this wallet or verify the configured token contract and network before retrying.
                </p>
              ) : null}
              {!hasEnoughSbtcBalance ? (
                <p className="mt-1 text-[11px] font-medium text-[var(--color-danger-500)]">
                  Amount exceeds connected sBTC balance.
                </p>
              ) : null}
            </div>

            <div className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Payment Method</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {PAY_METHODS.map((item) => {
                  const active = method === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMethod(item.key)}
                      className={`rounded-xl border px-4 py-4 text-center transition-colors ${
                        active
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface)]"
                      }`}
                    >
                      <p className="mb-1 text-lg">{item.icon}</p>
                      <p className={`text-sm font-semibold ${active ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
                        {item.title}
                      </p>
                      {active && <p className="mt-1 text-[10px] text-[var(--color-primary)]">✓</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
              <label className="mb-1 block text-[11px] text-[var(--color-text-muted)]">On-Chain Escrow</label>
              <p className="text-sm font-medium text-[var(--color-text)]">
                BitExpress will open your connected wallet and call the remittance contract automatically.
              </p>
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                The backend finalizes the transfer after the wallet returns the broadcast transaction ID.
              </p>
            </div>

            {method === "mobile_money" && selectedCountryMeta ? (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 text-xs text-[var(--color-text)]">
                <p className="font-semibold text-[var(--color-heading)]">Live Payout Rail</p>
                {selectedCountryMeta.supportsMobileMoneyPayout ? (
                  <p className="mt-1">
                    {selectedCountryMeta.mobileMoneyProvider === "paystack" ? "Paystack" : "CinetPay"} will handle the mobile-money payout in {selectedCountryMeta.name}.
                  </p>
                ) : (
                  <p className="mt-1 text-[var(--color-danger-500)]">
                    This corridor cannot be paid out to mobile money with the providers currently integrated into the app.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-7">
              <h2 className="text-sm font-semibold text-[var(--color-heading)]">Recent Recipients</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {recentRecipients.length ? (
                  recentRecipients.map((entry) => {
                    const flagCountry = getFlagCountry(entry.countryCode);
                    return (
                      <button
                        key={entry.wallet}
                        type="button"
                        onClick={() => {
                          setReceiverWallet(entry.wallet);
                          setRecipientName(entry.name ?? "");
                          setDestCountry(entry.countryCode);
                        }}
                        className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-3 text-left hover:bg-[var(--color-surface)]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[#0088cc] text-[11px] font-bold text-[#0f0f0f]">
                            {initialsFromName(entry.name)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[var(--color-heading)]">{entry.name || shortWallet(entry.wallet)}</p>
                            <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                              {flagCountry ? (
                                <CountryFlag country={flagCountry} variant={1} size={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
                              ) : null}
                              <span>{entry.countryName}</span>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--color-primary)]">{shortWallet(entry.wallet)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-4 text-xs text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-4">
                    No recent recipients from your wallet history yet.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
            <h2 className="text-[1.8rem] font-bold text-[var(--color-heading)]">Transaction Summary</h2>

            <div className="mt-6 rounded-xl bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Current Rate</p>
              <p className="mt-1 text-3xl font-bold text-[var(--color-heading)]">
                {selectedRate && selectedCountryMeta
                  ? `1 USD = ${selectedCountryMeta.currencySymbol}${localPerUsd.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`
                  : "Loading rates..."}
              </p>
              <p className="mt-2 inline-flex rounded-full bg-[var(--color-primary-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                Trusted rate feed via backend
              </p>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">You send</span>
                <span className="font-semibold text-[var(--color-text)]">
                    ${amountUsd.toFixed(2)} /{" "}
                    {amountSatoshis.toLocaleString()} sats
                  </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Recipient gets</span>
                <span className="font-semibold text-[var(--color-text)]">
                  ${recipientGetsUsd.toFixed(2)} USDCx
                  {selectedCountryMeta ? ` / ${recipientGetsLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${selectedCountryMeta.currency}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Transaction fee (~1%)</span>
                <span className="font-semibold text-[var(--color-text)]">${feeUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Network fee</span>
                <span className="font-semibold text-[var(--color-text)]">${networkFeeUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="font-semibold text-[var(--color-heading)]">Total cost</span>
                <span className="font-bold text-[var(--color-heading)]">${totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Backend USD amount</span>
                <span className="font-semibold text-[var(--color-text)]">${amountUsd.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[var(--color-primary-soft)] p-3 text-xs text-[var(--color-primary)]">⚡ Arrives in 5-15 minutes</div>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">🛡️ Rate from live external APIs, with mobile-money payouts routed through Paystack or CinetPay where available</p>

            <div className="mt-5 space-y-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[#0f0f0f] hover:opacity-95 disabled:opacity-60"
                disabled={isSubmitting || !canSubmitForm}
              >
                {isSubmitting
                  ? pendingStacksTxId
                    ? "Finalizing transfer..."
                    : "Opening wallet..."
                  : pendingStacksTxId && !transferResult
                    ? "Finalize Transfer"
                    : "Send Money"}
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-[var(--color-primary)] bg-transparent px-4 py-3 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                onClick={() => {
                  setReceiverWallet("");
                  setRecipientName("");
                  setPhone("");
                  setRecipientMobileProvider("");
                  setPendingStacksTxId(null);
                  setPendingClaimSecret(null);
                  setSubmissionKey(null);
                  setTransferResult(null);
                }}
              >
                Clear Form
              </button>
            </div>

            {pendingStacksTxId ? (
              <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-xs text-[var(--color-text)]">
                <p className="font-semibold text-[var(--color-heading)]">On-Chain Transaction</p>
                <p className="mt-2 break-all">Tx ID: {pendingStacksTxId}</p>
                <a
                  href={getStacksTxExplorerUrl(pendingStacksTxId)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[var(--color-primary)] hover:underline"
                >
                  View in explorer
                </a>
                {pendingClaimSecret ? (
                  <>
                    <p className="mt-3 font-semibold text-[var(--color-heading)]">Claim Secret</p>
                    <div className="mt-1 flex items-start gap-2">
                      <p className="break-all font-mono text-[11px] flex-1">{pendingClaimSecret}</p>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(pendingClaimSecret);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        className="shrink-0 rounded p-1 hover:bg-[var(--color-border)] transition-colors"
                        title="Copy claim secret"
                      >
                        {copiedSecret ? (
                          <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--color-danger-500)] font-medium">
                      ⚠ Share this secret with the receiver — they need it to claim on-chain.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {transferResult ? (
              <div className="mt-5 rounded-xl bg-[var(--color-surface-muted)] p-4 text-xs text-[var(--color-text)]">
                <p className="font-semibold text-[var(--color-heading)]">Latest Transfer</p>
                <p className="mt-2 break-all">ID: {transferResult.id}</p>
                <p>Status: {transferResult.status}</p>
                <p>Fee: ${transferResult.fee.toFixed(2)}</p>
                <p>Net Amount: ${transferResult.netAmount.toFixed(2)}</p>
                {pendingStacksTxId ? <p className="break-all">Stacks Tx: {pendingStacksTxId}</p> : null}
              </div>
            ) : null}
          </aside>
        </form>
      </div>

    </div>
  );
}
