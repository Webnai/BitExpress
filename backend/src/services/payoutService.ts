import { randomUUID } from "crypto";

import axios from "axios";

import {
  PAYSTACK_BASE_URL,
  PAYSTACK_SECRET_KEY,
  SUPPORTED_COUNTRIES,
  type PayoutProvider,
} from "../config";

export interface PayoutRequest {
  transferId: string;
  countryCode: string;
  recipientPhone: string;
  recipientName: string;
  recipientMobileProvider?: string;
  amountUsd: number;
  payoutMethod: "mobile_money" | "crypto_wallet";
}

export interface PayoutResult {
  success: boolean;
  reference: string;
  message: string;
  localAmount: number;
  localCurrency: string;
  estimatedDelivery: string;
  provider: "paystack" | "stacks";
  payoutStatus: "processing" | "success" | "failed";
}

function buildTransferReference(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeLocalPhoneNumber(countryCode: string, rawPhone: string): string {
  const country = SUPPORTED_COUNTRIES[countryCode];
  if (!country) {
    throw new Error(`Unsupported country: ${countryCode}`);
  }

  // Remove all non-digit characters (spaces, hyphens, parentheses, +, etc)
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Recipient phone number is required for mobile-money payout.");
  }

  // If it's already the correct national length with 0 prefix, return as-is
  if (digits.length === country.nationalNumberLength && digits.startsWith(country.nationalPrefix || "0")) {
    return digits;
  }

  // If it has the country dial code at the start
  if (digits.startsWith(country.dialCode)) {
    const withoutDialCode = digits.slice(country.dialCode.length);
    
    // Correct length after removing dial code
    if (withoutDialCode.length === country.nationalNumberLength - (country.nationalPrefix?.length ?? 1)) {
      return (country.nationalPrefix || "0") + withoutDialCode;
    }
    
    // Already has the 0 prefix
    if (withoutDialCode.startsWith(country.nationalPrefix || "0")) {
      return withoutDialCode;
    }
  }

  // If it starts with the national prefix but missing dial code
  if (country.nationalPrefix && digits.startsWith(country.nationalPrefix)) {
    if (digits.length === country.nationalNumberLength) {
      return digits;
    }
  }

  // If it's just the local number without prefix
  if (digits.length === (country.nationalNumberLength - (country.nationalPrefix?.length ?? 1))) {
    return (country.nationalPrefix || "0") + digits;
  }

  // If starts with dial code without 0, add it
  if (digits.startsWith(country.dialCode) && digits.length === country.dialCode.length + (country.nationalNumberLength - (country.nationalPrefix?.length ?? 1))) {
    return (country.nationalPrefix || "0") + digits.slice(country.dialCode.length);
  }

  throw new Error(
    `Invalid phone number for ${country.name}. Expected ${country.nationalNumberLength} digits (with ${country.nationalPrefix || "0"} prefix), got: ${digits}`
  );
}

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function buildEstimatedDelivery(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function checkPaystackLiquidity(countryCode: string, localAmount: number): Promise<boolean> {
  if (!PAYSTACK_SECRET_KEY) return false;

  try {
    const paystack = axios.create({
      baseURL: PAYSTACK_BASE_URL,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const response = await paystack.get("/balance");
    const balance = response.data?.data?.available || 0;
    
    // Convert balance (in minor units) to actual amount
    const balanceInUnits = balance / 100;
    
    return balanceInUnits >= localAmount;
  } catch (error) {
    // If we can't check, assume false (safe behavior)
    return false;
  }
}

async function processPaystackMobileMoneyPayout(
  request: PayoutRequest,
  localAmount: number
): Promise<PayoutResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const country = SUPPORTED_COUNTRIES[request.countryCode];
  const operator = country.mobileMoneyOperators[0] || { code: "MOMO", label: "Mobile Money" };
  const phone = normalizeLocalPhoneNumber(request.countryCode, request.recipientPhone);
  const reference = buildTransferReference("bxps");

  const paystack = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  let bankCode = operator.code;
  try {
    const banksResponse = await paystack.get("/bank", {
      params: {
        currency: country.currency,
        type: "mobile_money",
      },
    });

    const banks = Array.isArray(banksResponse.data?.data) ? banksResponse.data.data : [];
    const matched = banks.find((candidate: Record<string, unknown>) => {
      const code = String(candidate.code ?? "").toUpperCase();
      const slug = String(candidate.slug ?? "").toUpperCase();
      const name = String(candidate.name ?? "").toUpperCase();
      const target = operator.code.toUpperCase();
      const label = operator.label.toUpperCase();
      return code === target || slug === target || name.includes(label) || name.includes(target);
    });
    if (matched?.code) {
      bankCode = String(matched.code);
    }
  } catch {
    // Fall back to the operator code from config if bank discovery fails.
  }

  const recipientResponse = await paystack.post("/transferrecipient", {
    type: "mobile_money",
    name: request.recipientName,
    account_number: phone,
    bank_code: bankCode,
    currency: country.currency,
    metadata: {
      transferId: request.transferId,
      operator: operator.code,
      corridor: request.countryCode,
    },
  });

  const recipientCode = recipientResponse.data?.data?.recipient_code;
  if (!recipientCode) {
    throw new Error("Paystack did not return a recipient code.");
  }

  const transferResponse = await paystack.post("/transfer", {
    source: "balance",
    amount: toMinorUnits(localAmount),
    recipient: recipientCode,
    reference,
    reason: `BitExpress payout ${request.transferId}`,
  });

  const transferStatus = String(transferResponse.data?.data?.status ?? "pending").toLowerCase();

  let verifiedStatus = transferStatus;
  if (transferStatus !== "success") {
    try {
      const verifyResponse = await paystack.get(`/transfer/verify/${reference}`);
      verifiedStatus = String(verifyResponse.data?.data?.status ?? transferStatus).toLowerCase();
    } catch {
      verifiedStatus = transferStatus;
    }
  }

  const payoutStatus =
    verifiedStatus === "success"
      ? "success"
      : verifiedStatus === "failed" || verifiedStatus === "reversed"
        ? "failed"
        : "processing";

  return {
    success: payoutStatus !== "failed",
    reference,
    message:
      payoutStatus === "success"
        ? `Paystack delivered ${country.currency} ${localAmount.toFixed(2)} to ${request.recipientPhone}.`
        : `Paystack accepted the payout and is still processing it for ${request.recipientPhone}.`,
    localAmount,
    localCurrency: country.currency,
    estimatedDelivery: buildEstimatedDelivery(15),
    provider: "paystack",
    payoutStatus,
  };
}


export async function processPayout(
  request: PayoutRequest,
  localAmount: number
): Promise<PayoutResult> {
  const country = SUPPORTED_COUNTRIES[request.countryCode];
  if (!country) {
    return {
      success: false,
      reference: "",
      message: `Unsupported country: ${request.countryCode}`,
      localAmount: 0,
      localCurrency: "",
      estimatedDelivery: "",
      provider: "stacks",
      payoutStatus: "failed",
    };
  }

  if (process.env.NODE_ENV === "test") {
    return {
      success: true,
      reference: `TEST-${request.transferId}`,
      message: `Test payout completed for ${request.transferId}.`,
      localAmount: localAmount,
      localCurrency: country.currency,
      estimatedDelivery: buildEstimatedDelivery(1),
      provider: "paystack",
      payoutStatus: "success",
    };
  }

  switch (request.payoutMethod) {
    case "mobile_money":
      if (!country.supportsMobileMoneyPayout) {
        return {
          success: false,
          reference: "",
          message: `${country.name} mobile-money payouts are not supported.`,
          localAmount: 0,
          localCurrency: country.currency,
          estimatedDelivery: "",
          provider: "stacks",
          payoutStatus: "failed",
        };
      }

      // Check liquidity before processing
      const paystackHasLiquidity = await checkPaystackLiquidity(request.countryCode, localAmount);
      if (!paystackHasLiquidity) {
        return {
          success: false,
          reference: "",
          message: `Paystack does not have sufficient liquidity for ${country.currency} payouts. Please try again later.`,
          localAmount: 0,
          localCurrency: country.currency,
          estimatedDelivery: "",
          provider: "paystack",
          payoutStatus: "failed",
        };
      }
      return processPaystackMobileMoneyPayout(request, localAmount);

    case "crypto_wallet":
      return {
        success: true,
        reference: `STX-${request.transferId}`,
        message: "Receiver claimed the transfer on-chain. No off-ramp payout is required.",
        localAmount: request.amountUsd,
        localCurrency: "sBTC",
        estimatedDelivery: buildEstimatedDelivery(1),
        provider: "stacks",
        payoutStatus: "success",
      };

    default:
      return {
        success: false,
        reference: "",
        message: "Unsupported payout method",
        localAmount: 0,
        localCurrency: "",
        estimatedDelivery: "",
        provider: "stacks",
        payoutStatus: "failed",
      };
  }
}

export function getSupportedProviders(): Record<
  string,
  { provider: string; currency: string; flag: string }
> {
  const result: Record<
    string,
    { provider: string; currency: string; flag: string }
  > = {};
  for (const [code, country] of Object.entries(SUPPORTED_COUNTRIES)) {
    if (country.supportsMobileMoneyPayout) {
      result[code] = {
        provider: "paystack",
        currency: country.currency,
        flag: country.flag,
      };
    }
  }
  return result;
}
