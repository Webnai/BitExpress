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
  usdToSbtcSatoshis,
} from "@/lib/stacks";
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

export default function SendPage() {
  const { address } = useWallet();
  const [sourceCountry, setSourceCountry] = useState("GHA");
  const [destCountry, setDestCountry] = useState("KEN");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientMobileProvider, setRecipientMobileProvider] = useState("");
  const [receiverWallet, setReceiverWallet] = useState("");
  const [amountUsdInput, setAmountUsdInput] = useState("20.00");
  const [method, setMethod] = useState<PayoutMethod>("mobile_money");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStacksTxId, setPendingStacksTxId] = useState<string | null>(null);
  const [pendingClaimSecret, setPendingClaimSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [rates, setRates] = useState<ExchangeRateMap>({});
  const [countryMeta, setCountryMeta] = useState<CountryMetaMap>({});
  const [sbtcBalance, setSbtcBalance] = useState<string | null>(null);
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
      } catch (error) {
        if (!cancelled) {
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
  const amountUsd = Number.parseFloat(amountUsdInput) || 0;
  const feeUsd = amountUsd * 0.01;
  const networkFeeUsd = 0;
  const totalUsd = amountUsd + feeUsd + networkFeeUsd;
  const recipientGetsUsd = Math.max(amountUsd - feeUsd, 0);
  const localPerUsd = selectedRate ? selectedRate.rate / Math.max(selectedRate.btcUsdPrice, 1) : 0;
  const recipientGetsLocal = recipientGetsUsd * localPerUsd;
  const btcUsdPrice = selectedRate?.btcUsdPrice ?? 65000;
  const connectedBalanceSbtc = sbtcBalance ? Number(sbtcBalance) / 100_000_000 : null;
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
  const canSubmitForm =
    Boolean(address) &&
    isAmountValid &&
    isRecipientWalletValid &&
    isPhoneValid &&
    isLiveMobileMoneyAvailable &&
    isMobileOperatorValid &&
    isRecipientNameValid;

  const sendMaxLabel = useMemo(() => {
    if (connectedBalanceSbtc === null) return null;
    return `${connectedBalanceSbtc.toLocaleString(undefined, { maximumFractionDigits: 6 })} sBTC connected`;
  }, [connectedBalanceSbtc]);

  function createIdempotencyKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function finalizeBackendTransfer(txid: string, idempotencyKey: string) {
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
      toast.error("Enter an amount between $1 and $10,000.");
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

      if (!txid) {
        const claimSecretHex = generateClaimSecretHex();
        const contractCall = await createSendRemittanceTx({
          receiverWallet: receiverWalletNormalized,
          amountSatoshis: usdToSbtcSatoshis(amountUsd, btcUsdPrice),
          sourceCountry,
          destCountry,
          claimSecretHex,
        });

        txid = contractCall.txid;
        setPendingStacksTxId(txid);
        setPendingClaimSecret(claimSecretHex);
        setSubmissionKey(idempotencyKey);
        toast.success("On-chain escrow transaction broadcast successfully.");
      }

      await finalizeBackendTransfer(txid, idempotencyKey);
      setSubmissionKey(null);

      toast.success("Transfer created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send transfer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="max-w-[1180px] mx-auto px-4 py-8 md:px-6">
        <form className="grid gap-5 xl:grid-cols-[2fr_1fr]" onSubmit={handleSubmit}>
          <section className="rounded-2xl border border-[#e1e8f3] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.05)] md:p-7">
            <h1 className="text-4xl font-bold text-[#132a52]">Send Money</h1>
            <p className="mt-2 text-sm text-[#7f8ea9]">Transfer funds securely across Africa</p>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">Recipient Information</p>

              <div className="mt-3 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[#7f8ea9]">Sender Country</label>
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={sourceCountry}
                    onChange={(e) => setSourceCountry(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  >
                    {COUNTRY_OPTIONS.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[#8b99b0]">▾</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[#7f8ea9]">Recipient Country</label>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {selectedFlagCountry ? (
                      <CountryFlag country={selectedFlagCountry} variant={1} size={20} className="h-5 w-5 rounded-sm object-cover" />
                    ) : null}
                  </div>
                  <select
                    value={destCountry}
                    onChange={(e) => setDestCountry(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  >
                    {COUNTRY_OPTIONS.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[#8b99b0]">▾</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[#7f8ea9]">Phone Number</label>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                    placeholder="+233 24 123 4567"
                    required={requiresPhone}
                  />
                  <span className="text-[#8b99b0]">ⓘ</span>
                </div>
                {requiresPhone ? (
                  <p className="mt-1 text-[10px] text-[#7f8ea9]">Required for mobile money payout.</p>
                ) : null}
              </div>

              {requiresMobileOperator ? (
                <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                  <label className="mb-1 block text-[11px] text-[#7f8ea9]">Mobile Money Operator</label>
                  {selectedMobileMoneyOperators.length ? (
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={recipientMobileProvider}
                        onChange={(e) => setRecipientMobileProvider(e.target.value)}
                        className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                      >
                        {selectedMobileMoneyOperators.map((operator) => (
                          <option key={operator.code} value={operator.code}>
                            {operator.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-[#8b99b0]">▾</span>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-[#b45309]">
                      Live mobile-money payout is not available for this country via Paystack or CinetPay.
                    </p>
                  )}
                  {selectedOperator ? (
                    <p className="mt-1 text-[10px] text-[#7f8ea9]">
                      Routed through {selectedOperator.provider === "paystack" ? "Paystack" : "CinetPay"}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[#7f8ea9]">Recipient Name</label>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  placeholder="Kwame Mensah"
                  required
                />
              </div>

              <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="mb-1 block text-[11px] text-[#7f8ea9]">Recipient Wallet</label>
                <input
                  value={receiverWallet}
                  onChange={(e) => setReceiverWallet(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  placeholder="SP..."
                  required
                />
                <p className="mt-1 text-[10px] text-[#7f8ea9]">Use recipient STX address (starts with SP, ST, SM, or SN).</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">You Send</p>

              <div className="mt-3 rounded-xl border border-[#dbe4f0] bg-[#fbfcff] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <input
                    value={amountUsdInput}
                    onChange={(e) => setAmountUsdInput(e.target.value)}
                    className="w-36 bg-transparent text-4xl font-bold text-[#132a52] outline-none"
                    inputMode="decimal"
                  />
                  <div className="h-fit rounded-full bg-[#eef2f8] p-1 text-[10px] font-semibold text-[#5f6f88]">
                    <span className="rounded-full bg-[#ff7448] px-3 py-1 text-white">USD</span>
                    <span className="px-3 py-1">sBTC</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#ff7448]">
                {sendMaxLabel ? `Connected balance: ${sendMaxLabel}` : "Connect wallet to load balance"}
              </p>
            </div>

            <div className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">Payment Method</p>
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
                          ? "border-[#ff7448] bg-[#fff6f2]"
                          : "border-[#dfe6f2] bg-white hover:bg-[#fbfcff]"
                      }`}
                    >
                      <p className="mb-1 text-lg">{item.icon}</p>
                      <p className={`text-sm font-semibold ${active ? "text-[#ff7448]" : "text-[#42526b]"}`}>
                        {item.title}
                      </p>
                      {active && <p className="mt-1 text-[10px] text-[#ff7448]">✓</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
              <label className="mb-1 block text-[11px] text-[#7f8ea9]">On-Chain Escrow</label>
              <p className="text-sm font-medium text-[#42526b]">
                BitExpress will open your connected wallet and call the remittance contract automatically.
              </p>
              <p className="mt-1 text-[10px] text-[#7f8ea9]">
                The backend finalizes the transfer after the wallet returns the broadcast transaction ID.
              </p>
            </div>

            {method === "mobile_money" && selectedCountryMeta ? (
              <div className="mt-3 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3 text-xs text-[#42526b]">
                <p className="font-semibold text-[#132a52]">Live Payout Rail</p>
                {selectedCountryMeta.supportsMobileMoneyPayout ? (
                  <p className="mt-1">
                    {selectedCountryMeta.mobileMoneyProvider === "paystack" ? "Paystack" : "CinetPay"} will handle the mobile-money payout in {selectedCountryMeta.name}.
                  </p>
                ) : (
                  <p className="mt-1 text-[#b45309]">
                    This corridor cannot be paid out to mobile money with the providers currently integrated into the app.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-7">
              <h2 className="text-sm font-semibold text-[#132a52]">Recent Recipients</h2>
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
                        className="rounded-xl bg-[#f6f9fe] px-3 py-3 text-left hover:bg-[#edf3fd]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#8aa4d3] to-[#4d78d0] text-[11px] font-bold text-white">
                            {initialsFromName(entry.name)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#132a52]">{entry.name || shortWallet(entry.wallet)}</p>
                            <div className="flex items-center gap-1 text-[11px] text-[#8b99b0]">
                              {flagCountry ? (
                                <CountryFlag country={flagCountry} variant={1} size={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
                              ) : null}
                              <span>{entry.countryName}</span>
                            </div>
                            <p className="text-[11px] font-semibold text-[#ff7448]">{shortWallet(entry.wallet)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl bg-[#f6f9fe] px-3 py-4 text-xs text-[#8b99b0] sm:col-span-2 lg:col-span-4">
                    No recent recipients from your wallet history yet.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-[#e1e8f3] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
            <h2 className="text-[1.8rem] font-bold text-[#132a52]">Transaction Summary</h2>

            <div className="mt-6 rounded-xl bg-[#f6f9fe] p-4">
              <p className="text-xs text-[#7f8ea9]">Current Rate</p>
              <p className="mt-1 text-3xl font-bold text-[#132a52]">
                {selectedRate && selectedCountryMeta
                  ? `1 USD = ${selectedCountryMeta.currencySymbol}${localPerUsd.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`
                  : "Loading rates..."}
              </p>
              <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                Trusted rate feed via backend
              </p>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">You send</span>
                <span className="font-semibold text-[#42526b]">
                    ${amountUsd.toFixed(2)} /{" "}
                    {usdToSbtcSatoshis(amountUsd, btcUsdPrice).toLocaleString()} sats
                  </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Recipient gets</span>
                <span className="font-semibold text-[#42526b]">
                  ${recipientGetsUsd.toFixed(2)} USDCx
                  {selectedCountryMeta ? ` / ${recipientGetsLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${selectedCountryMeta.currency}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Transaction fee (~1%)</span>
                <span className="font-semibold text-[#42526b]">${feeUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Network fee</span>
                <span className="font-semibold text-[#42526b]">${networkFeeUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#edf2f8] pt-3">
                <span className="font-semibold text-[#132a52]">Total cost</span>
                <span className="font-bold text-[#132a52]">${totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Backend USD amount</span>
                <span className="font-semibold text-[#42526b]">${amountUsd.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[#eef7ff] p-3 text-xs text-[#42526b]">⚡ Arrives in 5-15 minutes</div>
            <p className="mt-3 text-xs text-[#7f8ea9]">🛡️ Rate from live external APIs, with mobile-money payouts routed through Paystack or CinetPay where available</p>

            <div className="mt-5 space-y-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#ff7448] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                className="w-full rounded-xl border border-[#ff9c7f] bg-white px-4 py-3 text-sm font-semibold text-[#ff7448]"
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
              <div className="mt-5 rounded-xl border border-[#dbe4f0] bg-[#fbfcff] p-4 text-xs text-[#42526b]">
                <p className="font-semibold text-[#132a52]">On-Chain Transaction</p>
                <p className="mt-2 break-all">Tx ID: {pendingStacksTxId}</p>
                <a
                  href={getStacksTxExplorerUrl(pendingStacksTxId)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[#ff7448] hover:underline"
                >
                  View in explorer
                </a>
                {pendingClaimSecret ? (
                  <>
                    <p className="mt-3 font-semibold text-[#132a52]">Claim Secret</p>
                    <div className="mt-1 flex items-start gap-2">
                      <p className="break-all font-mono text-[11px] flex-1">{pendingClaimSecret}</p>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(pendingClaimSecret);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        className="shrink-0 rounded p-1 hover:bg-[#e8eef8] transition-colors"
                        title="Copy claim secret"
                      >
                        {copiedSecret ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#8b99b0]" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-[#d97706] font-medium">
                      ⚠ Share this secret with the receiver — they need it to claim on-chain.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {transferResult ? (
              <div className="mt-5 rounded-xl bg-[#f6f9fe] p-4 text-xs text-[#42526b]">
                <p className="font-semibold text-[#132a52]">Latest Transfer</p>
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

      <footer className="bg-[#0f2b57] px-4 py-12 text-white">
        <div className="mx-auto grid max-w-[1180px] gap-8 text-sm md:grid-cols-4">
          <div>
            <p className="mb-3 text-2xl font-bold">₿ BitExpress</p>
            <p className="text-white/80">Send money across Africa instantly with Bitcoin-powered remittance.</p>
          </div>
          <div>
            <p className="mb-3 font-semibold">Product</p>
            <p className="mb-2 text-white/80">How it Works</p>
            <p className="mb-2 text-white/80">Pricing</p>
            <p className="text-white/80">Countries</p>
          </div>
          <div>
            <p className="mb-3 font-semibold">Company</p>
            <p className="mb-2 text-white/80">About</p>
            <p className="mb-2 text-white/80">Blog</p>
            <p className="text-white/80">Careers</p>
          </div>
          <div>
            <p className="mb-3 font-semibold">Support</p>
            <p className="mb-2 text-white/80">Help Center</p>
            <p className="mb-2 text-white/80">Contact</p>
            <p className="text-white/80">FAQ</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
