// Supported countries and their mobile money systems
export const SUPPORTED_COUNTRIES: Record<string, CountryConfig> = {
  GHA: {
    name: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    mobileMoney: "MTN MoMo",
    mobileMoneyCode: "MTN_MOMO",
    flag: "🇬🇭",
  },
  NGA: {
    name: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    mobileMoney: "Flutterwave",
    mobileMoneyCode: "FLUTTERWAVE",
    flag: "🇳🇬",
  },
  KEN: {
    name: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    mobileMoney: "M-Pesa",
    mobileMoneyCode: "MPESA",
    flag: "🇰🇪",
  },
  TGO: {
    name: "Togo",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "Moov Money",
    mobileMoneyCode: "MOOV_MONEY",
    flag: "🇹🇬",
  },
  SEN: {
    name: "Senegal",
    currency: "XOF",
    currencySymbol: "CFA",
    mobileMoney: "Orange Money",
    mobileMoneyCode: "ORANGE_MONEY",
    flag: "🇸🇳",
  },
  TZA: {
    name: "Tanzania",
    currency: "TZS",
    currencySymbol: "TSh",
    mobileMoney: "Vodacom M-Pesa",
    mobileMoneyCode: "VODACOM_MPESA",
    flag: "🇹🇿",
  },
  UGA: {
    name: "Uganda",
    currency: "UGX",
    currencySymbol: "USh",
    mobileMoney: "MTN MoMo",
    mobileMoneyCode: "MTN_MOMO_UG",
    flag: "🇺🇬",
  },
};

export interface CountryConfig {
  name: string;
  currency: string;
  currencySymbol: string;
  mobileMoney: string;
  mobileMoneyCode: string;
  flag: string;
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
