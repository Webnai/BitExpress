export interface Country {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  mobileMoney: string;
  flag: string;
}

export interface Transfer {
  id: string;
  sender: string;
  receiver: string;
  amountUsd: number;
  fee: number;
  netAmount: number;
  currency: string;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  payoutMethod: "mobile_money" | "bank_transfer" | "crypto_wallet";
  stacksTxId?: string;
  status: "pending" | "claimed" | "refunded" | "failed";
  createdAt: string;
  claimedAt?: string;
  refundedAt?: string;
  mobileMoneyRef?: string;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number | null;
}

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  btcUsdPrice: number;
  updatedAt: string;
}

export const SUPPORTED_COUNTRIES: Country[] = [
  {
    code: "GHA",
    name: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    mobileMoney: "MTN MoMo",
    flag: "🇬🇭",
  },
  {
    code: "NGA",
    name: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    mobileMoney: "MTN, Airtel, Glo, 9mobile",
    flag: "🇳🇬",
  },
  {
    code: "KEN",
    name: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    mobileMoney: "M-Pesa",
    flag: "🇰🇪",
  },
  {
    code: "TGO",
    name: "Togo",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "Moov Money",
    flag: "🇹🇬",
  },
  {
    code: "SEN",
    name: "Senegal",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "Orange Money",
    flag: "🇸🇳",
  },
  {
    code: "TZA",
    name: "Tanzania",
    currency: "TZS",
    currencySymbol: "TSh",
    mobileMoney: "Vodacom M-Pesa",
    flag: "🇹🇿",
  },
  {
    code: "UGA",
    name: "Uganda",
    currency: "UGX",
    currencySymbol: "USh",
    mobileMoney: "MTN MoMo",
    flag: "🇺🇬",
  },
];

export const PLATFORM_FEE_PERCENT = 1; // 1%

export function calculateFee(amountUsd: number): number {
  return (amountUsd * PLATFORM_FEE_PERCENT) / 100;
}

export function getCountry(code: string): Country | undefined {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code);
}

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const IS_LOCAL_DEV =
  process.env.NODE_ENV !== "production" ||
  (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));

export const API_BASE_URL = CONFIGURED_API_BASE_URL || (IS_LOCAL_DEV ? "http://localhost:4000" : "");

export const API_BASE_URL_NORMALIZED = API_BASE_URL.replace(/\/$/, "");
