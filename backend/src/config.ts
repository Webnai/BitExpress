import dotenv from "dotenv";

dotenv.config();

export type PayoutProvider = "paystack" | "stacks";

export interface MobileMoneyOperator {
  code: string;
  label: string;
}

export interface CountryConfig {
  name: string;
  currency: string;
  currencySymbol: string;
  mobileMoney: string;
  flag: string;
  dialCode: string;
  nationalNumberLength: number;
  nationalPrefix?: string;
  supportsMobileMoneyPayout: boolean;
  mobileMoneyProvider?: "paystack";
  mobileMoneyOperators: MobileMoneyOperator[];
}

// Supported countries: Ghana and Kenya with Paystack mobile money
export const SUPPORTED_COUNTRIES: Record<string, CountryConfig> = {
  GHA: {
    name: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    mobileMoney: "Mobile Money",
    flag: "🇬🇭",
    dialCode: "233",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "paystack",
    mobileMoneyOperators: [
      { code: "MTN", label: "MTN" },
      { code: "VOD", label: "Vodafone" },
      { code: "ATL", label: "AirtelTigo" },
    ],
  },
  KEN: {
    name: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    mobileMoney: "M-Pesa",
    flag: "🇰🇪",
    dialCode: "254",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "paystack",
    mobileMoneyOperators: [
      { code: "MPESA", label: "M-Pesa" },
    ],
  },
};

export function getMobileMoneyOperator(countryCode: string) {
  // Return the default operator (Paystack handles all mobile money for supported countries)
  return SUPPORTED_COUNTRIES[countryCode]?.mobileMoneyOperators[0];
}

// Platform fee configuration
export const PLATFORM_FEE_BASIS_POINTS = 100; // 1%
export const BASIS_POINTS_DENOMINATOR = 10000;

// Transfer limits (in USD)
export const MIN_TRANSFER_USD = 1;
export const MAX_TRANSFER_USD = 10000;

// Transfer timeout: must match the Clarity contract's TRANSFER-TIMEOUT-BLOCKS (~144 blocks ≈ 24 hours on Stacks)
export const TRANSFER_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const STACKS_NETWORK = process.env.STACKS_NETWORK || "testnet";
export const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS || "ST000000000000000000002AMW42H";
export const CONTRACT_NAME = process.env.CONTRACT_NAME || "remittance-v4";

function isValidStacksAddress(address: string): boolean {
  return /^S[PTMN][A-Z0-9]{38,42}$/.test(address.trim().toUpperCase());
}

export function getDeployerWallet(): string {
  const configured =
    process.env.DEPLOYER_WALLET || process.env.CONTRACT_OWNER_WALLET || CONTRACT_ADDRESS;
  const normalized = configured.trim().toUpperCase();

  if (!isValidStacksAddress(normalized)) {
    throw new Error(
      "Invalid DEPLOYER_WALLET (or CONTRACT_OWNER_WALLET). It must be a valid Stacks wallet address."
    );
  }

  return normalized;
}

// API configuration
export const PORT = parseInt(process.env.PORT || "4000", 10);
export const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/^['\"]|['\"]$/g, "").replace(/\/$/, ""))
  .filter(Boolean);
export const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4000";

export const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
export const PAYSTACK_WEBHOOK_SECRET =
  process.env.PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY;

// Secret for validating BTC deposit lifecycle webhooks from your deposit processor.
export const BTC_DEPOSIT_WEBHOOK_SECRET = process.env.BTC_DEPOSIT_WEBHOOK_SECRET || "";

// Firestore configuration
// Set USE_FIRESTORE=true to force Firestore mode.
// Provide either GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.
export const USE_FIRESTORE = process.env.USE_FIRESTORE === "true";
