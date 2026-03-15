export type PayoutProvider = "paystack" | "cinetpay" | "stacks";

export interface MobileMoneyOperator {
  code: string;
  label: string;
  provider: Exclude<PayoutProvider, "stacks">;
}

export interface CountryConfig {
  name: string;
  currency: string;
  currencySymbol: string;
  mobileMoney: string;
  mobileMoneyCode: string;
  flag: string;
  dialCode: string;
  nationalNumberLength: number;
  nationalPrefix?: string;
  supportsMobileMoneyPayout: boolean;
  mobileMoneyProvider?: Exclude<PayoutProvider, "stacks">;
  mobileMoneyOperators: MobileMoneyOperator[];
}

// Supported countries and their live mobile-money payout rails.
export const SUPPORTED_COUNTRIES: Record<string, CountryConfig> = {
  GHA: {
    name: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    mobileMoney: "MTN, Vodafone Cash, AirtelTigo",
    mobileMoneyCode: "PAYSTACK_GHS",
    flag: "🇬🇭",
    dialCode: "233",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "paystack",
    mobileMoneyOperators: [
      { code: "MTN", label: "MTN MoMo", provider: "paystack" },
      { code: "VOD", label: "Vodafone Cash", provider: "paystack" },
      { code: "ATL", label: "AirtelTigo Money", provider: "paystack" },
    ],
  },
  NGA: {
    name: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    mobileMoney: "No supported live mobile-money payout rail",
    mobileMoneyCode: "UNSUPPORTED",
    flag: "🇳🇬",
    dialCode: "234",
    nationalNumberLength: 11,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: false,
    mobileMoneyOperators: [],
  },
  KEN: {
    name: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    mobileMoney: "M-Pesa",
    mobileMoneyCode: "PAYSTACK_KES",
    flag: "🇰🇪",
    dialCode: "254",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "paystack",
    mobileMoneyOperators: [
      { code: "MPESA", label: "M-Pesa", provider: "paystack" },
    ],
  },
  TGO: {
    name: "Togo",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "TMoney, Flooz",
    mobileMoneyCode: "CINETPAY_TG",
    flag: "🇹🇬",
    dialCode: "228",
    nationalNumberLength: 8,
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "cinetpay",
    mobileMoneyOperators: [
      { code: "TMONEYTG", label: "TMoney", provider: "cinetpay" },
      { code: "FLOOZTG", label: "Flooz", provider: "cinetpay" },
    ],
  },
  SEN: {
    name: "Senegal",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "Orange Money, Free Money, Wave",
    mobileMoneyCode: "CINETPAY_SN",
    flag: "🇸🇳",
    dialCode: "221",
    nationalNumberLength: 9,
    supportsMobileMoneyPayout: true,
    mobileMoneyProvider: "cinetpay",
    mobileMoneyOperators: [
      { code: "OMSN", label: "Orange Money", provider: "cinetpay" },
      { code: "FREESN", label: "Free Money", provider: "cinetpay" },
      { code: "WAVESN", label: "Wave", provider: "cinetpay" },
    ],
  },
  TZA: {
    name: "Tanzania",
    currency: "TZS",
    currencySymbol: "TSh",
    mobileMoney: "No supported live mobile-money payout rail",
    mobileMoneyCode: "UNSUPPORTED",
    flag: "🇹🇿",
    dialCode: "255",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: false,
    mobileMoneyOperators: [],
  },
  UGA: {
    name: "Uganda",
    currency: "UGX",
    currencySymbol: "USh",
    mobileMoney: "No supported live mobile-money payout rail",
    mobileMoneyCode: "UNSUPPORTED",
    flag: "🇺🇬",
    dialCode: "256",
    nationalNumberLength: 10,
    nationalPrefix: "0",
    supportsMobileMoneyPayout: false,
    mobileMoneyOperators: [],
  },
};

export function getMobileMoneyOperator(countryCode: string, operatorCode?: string) {
  if (!operatorCode) {
    return undefined;
  }

  return SUPPORTED_COUNTRIES[countryCode]?.mobileMoneyOperators.find(
    (operator) => operator.code === operatorCode
  );
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
export const CONTRACT_NAME = "remittance";

// API configuration
export const PORT = parseInt(process.env.PORT || "4000", 10);
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
export const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4000";

export const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

export const CINETPAY_BASE_URL = process.env.CINETPAY_BASE_URL || "https://client.cinetpay.com";
export const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY || "";
export const CINETPAY_TRANSFER_PASSWORD = process.env.CINETPAY_TRANSFER_PASSWORD || "";
export const CINETPAY_NOTIFY_URL =
  process.env.CINETPAY_NOTIFY_URL || `${APP_BASE_URL}/api/webhooks/cinetpay/transfer`;
export const CINETPAY_LANG = process.env.CINETPAY_LANG || "en";

// Firestore configuration
// Set USE_FIRESTORE=true to force Firestore mode.
// Provide either GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.
export const USE_FIRESTORE = process.env.USE_FIRESTORE === "true";
