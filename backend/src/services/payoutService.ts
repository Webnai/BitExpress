import { randomUUID } from "crypto";

import axios from "axios";

import {
  CINETPAY_API_KEY,
  CINETPAY_BASE_URL,
  CINETPAY_LANG,
  CINETPAY_NOTIFY_URL,
  CINETPAY_TRANSFER_PASSWORD,
  PAYSTACK_BASE_URL,
  PAYSTACK_SECRET_KEY,
  SUPPORTED_COUNTRIES,
  getMobileMoneyOperator,
  type PayoutProvider,
} from "../config";

export interface PayoutRequest {
  transferId: string;
  countryCode: string;
  recipientPhone: string;
  recipientName: string;
  recipientMobileProvider?: string;
  amountUsd: number;
  payoutMethod: "mobile_money" | "bank_transfer" | "crypto_wallet";
}

export interface PayoutResult {
  success: boolean;
  reference: string;
  message: string;
  localAmount: number;
  localCurrency: string;
  estimatedDelivery: string;
  provider: PayoutProvider;
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

  const digits = normalizeDigits(rawPhone);
  if (!digits) {
    throw new Error("Recipient phone number is required for mobile-money payout.");
  }

  if (digits.length === country.nationalNumberLength) {
    return digits;
  }

  if (digits.startsWith(country.dialCode)) {
    const localPart = digits.slice(country.dialCode.length);
    if (localPart.length === country.nationalNumberLength) {
      return localPart;
    }
    if (
      country.nationalPrefix &&
      localPart.length === country.nationalNumberLength - 1 &&
      !localPart.startsWith(country.nationalPrefix)
    ) {
      return `${country.nationalPrefix}${localPart}`;
    }
  }

  if (
    country.nationalPrefix &&
    digits.length === country.nationalNumberLength - 1 &&
    !digits.startsWith(country.nationalPrefix)
  ) {
    return `${country.nationalPrefix}${digits}`;
  }

  throw new Error(`Invalid phone number for ${country.name}.`);
}

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function toCinetAmount(amount: number): number {
  return Math.max(5, Math.round(amount / 5) * 5);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Recipient";
  const surname = parts.slice(1).join(" ") || "Wallet";
  return { firstName, surname };
}

function buildEstimatedDelivery(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function getSelectedOperator(request: PayoutRequest) {
  const operator = getMobileMoneyOperator(request.countryCode, request.recipientMobileProvider);
  if (!operator) {
    throw new Error("Select a supported mobile-money operator for this country.");
  }
  return operator;
}

async function processPaystackMobileMoneyPayout(
  request: PayoutRequest,
  localAmount: number
): Promise<PayoutResult> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const country = SUPPORTED_COUNTRIES[request.countryCode];
  const operator = getSelectedOperator(request);
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

async function getCinetToken(): Promise<string> {
  if (!CINETPAY_API_KEY || !CINETPAY_TRANSFER_PASSWORD) {
    throw new Error("CINETPAY_API_KEY and CINETPAY_TRANSFER_PASSWORD are required.");
  }

  const payload = new URLSearchParams({
    apikey: CINETPAY_API_KEY,
    password: CINETPAY_TRANSFER_PASSWORD,
  });

  const response = await axios.post(`${CINETPAY_BASE_URL}/v1/auth/login`, payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });

  const token = response.data?.data?.token;
  if (!token) {
    throw new Error(response.data?.message || "CinetPay authentication failed.");
  }

  return token;
}

async function processCinetPayMobileMoneyPayout(
  request: PayoutRequest,
  localAmount: number
): Promise<PayoutResult> {
  const country = SUPPORTED_COUNTRIES[request.countryCode];
  const operator = getSelectedOperator(request);
  const phone = normalizeLocalPhoneNumber(request.countryCode, request.recipientPhone);
  const token = await getCinetToken();
  const reference = buildTransferReference("bxcp");
  const cinetAmount = toCinetAmount(localAmount);
  const { firstName, surname } = splitName(request.recipientName);
  const email = `bitexpress+${request.transferId}@example.com`;

  const contactPayload = new URLSearchParams({
    data: JSON.stringify([
      {
        prefix: country.dialCode,
        phone,
        name: firstName,
        surname,
        email,
      },
    ]),
  });

  const contactResponse = await axios.post(
    `${CINETPAY_BASE_URL}/v1/transfer/contact?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(CINETPAY_LANG)}`,
    contactPayload.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    }
  );

  const contactData = Array.isArray(contactResponse.data?.data)
    ? contactResponse.data.data.flat()
    : [];
  const firstContact = contactData[0];
  if (firstContact && ![0, 726, "0", "726"].includes(firstContact.code)) {
    throw new Error(firstContact.status || firstContact.description || "CinetPay contact creation failed.");
  }

  const sendPayload = new URLSearchParams({
    data: JSON.stringify([
      {
        prefix: country.dialCode,
        phone,
        amount: cinetAmount,
        client_transaction_id: reference,
        notify_url: CINETPAY_NOTIFY_URL,
        payment_method: operator.code,
      },
    ]),
  });

  const sendResponse = await axios.post(
    `${CINETPAY_BASE_URL}/v1/transfer/money/send/contact?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(CINETPAY_LANG)}`,
    sendPayload.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    }
  );

  if (Number(sendResponse.data?.code) !== 0) {
    throw new Error(sendResponse.data?.description || sendResponse.data?.message || "CinetPay payout failed.");
  }

  const sendResult = Array.isArray(sendResponse.data?.data) ? sendResponse.data.data[0] : undefined;
  const cinetTransactionId = sendResult?.transaction_id;

  let treatmentStatus = String(sendResult?.treatment_status ?? "NEW").toUpperCase();
  let sendingStatus = "PENDING";

  try {
    const checkResponse = await axios.get(`${CINETPAY_BASE_URL}/v1/transfer/check/money`, {
      params: {
        token,
        lang: CINETPAY_LANG,
        client_transaction_id: reference,
      },
      timeout: 15000,
    });

    const checkResult = Array.isArray(checkResponse.data?.data) ? checkResponse.data.data[0] : undefined;
    treatmentStatus = String(checkResult?.treatment_status ?? treatmentStatus).toUpperCase();
    sendingStatus = String(checkResult?.sending_status ?? sendingStatus).toUpperCase();
  } catch {
    // Keep the initial status if the verification call fails.
  }

  const payoutStatus =
    treatmentStatus === "VAL"
      ? "success"
      : treatmentStatus === "REJ"
        ? "failed"
        : "processing";

  const waitingForConfirmation = payoutStatus === "processing" && sendingStatus === "PENDING";

  return {
    success: payoutStatus !== "failed",
    reference: cinetTransactionId || reference,
    message: waitingForConfirmation
      ? "CinetPay accepted the payout but it still needs transfer confirmation or a whitelisted IP for automatic execution."
      : payoutStatus === "success"
        ? `CinetPay delivered ${country.currency} ${cinetAmount} to ${request.recipientPhone}.`
        : `CinetPay accepted the payout and is still processing it for ${request.recipientPhone}.`,
    localAmount: cinetAmount,
    localCurrency: country.currency,
    estimatedDelivery: buildEstimatedDelivery(30),
    provider: "cinetpay",
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
      localAmount: request.payoutMethod === "crypto_wallet" ? request.amountUsd : localAmount,
      localCurrency: request.payoutMethod === "crypto_wallet" ? "USDCx" : country.currency,
      estimatedDelivery: buildEstimatedDelivery(1),
      provider:
        request.payoutMethod === "mobile_money"
          ? country.mobileMoneyProvider || "stacks"
          : "stacks",
      payoutStatus: "success",
    };
  }

  switch (request.payoutMethod) {
    case "mobile_money":
      if (!country.supportsMobileMoneyPayout || !country.mobileMoneyProvider) {
        return {
          success: false,
          reference: "",
          message: `${country.name} mobile-money payouts are not supported by the currently integrated live rails.`,
          localAmount: 0,
          localCurrency: country.currency,
          estimatedDelivery: "",
          provider: "stacks",
          payoutStatus: "failed",
        };
      }

      if (country.mobileMoneyProvider === "paystack") {
        return processPaystackMobileMoneyPayout(request, localAmount);
      }

      return processCinetPayMobileMoneyPayout(request, localAmount);

    case "bank_transfer":
      return {
        success: false,
        reference: "",
        message: "Bank transfer payouts are disabled until a live bank rail is integrated.",
        localAmount: 0,
        localCurrency: country.currency,
        estimatedDelivery: "",
        provider: "stacks",
        payoutStatus: "failed",
      };

    case "crypto_wallet":
      return {
        success: true,
        reference: `STX-${request.transferId}`,
        message: "Receiver claimed the transfer on-chain. No off-ramp payout is required.",
        localAmount: request.amountUsd,
        localCurrency: "USDCx",
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
    result[code] = {
      provider: country.mobileMoneyProvider || "unsupported",
      currency: country.currency,
      flag: country.flag,
    };
  }
  return result;
}
