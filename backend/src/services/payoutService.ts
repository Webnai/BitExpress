// Simulated Mobile Money Off-Ramp Service
// In production, integrate with actual payment APIs:
//   - MTN MoMo API (Ghana, Uganda)
//   - Flutterwave API (Nigeria)
//   - Safaricom Daraja API for M-Pesa (Kenya)
//   - Moov Africa API (Togo, Senegal)

import { SUPPORTED_COUNTRIES } from "../config";

export interface PayoutRequest {
  transferId: string;
  countryCode: string;
  recipientPhone: string;
  recipientName: string;
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
}

// Simulate API call to mobile money provider
async function simulateMobileMoneyPayout(
  request: PayoutRequest,
  localAmount: number,
  currency: string,
  provider: string
): Promise<PayoutResult> {
  // Simulate network delay (50-200ms)
  await new Promise((resolve) =>
    setTimeout(resolve, 50 + Math.random() * 150)
  );

  // Simulate 95% success rate for demo purposes.
  // In production, use actual API responses from the mobile money provider.
  const success = Math.random() > 0.05;
  const reference = `BX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  if (!success) {
    return {
      success: false,
      reference,
      message: `${provider} payout failed. Please retry.`,
      localAmount,
      localCurrency: currency,
      estimatedDelivery: "",
    };
  }

  return {
    success: true,
    reference,
    message: `Successfully sent ${currency} ${localAmount.toFixed(2)} to ${request.recipientPhone} via ${provider}`,
    localAmount,
    localCurrency: currency,
    estimatedDelivery: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
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
    };
  }

  switch (request.payoutMethod) {
    case "mobile_money":
      return simulateMobileMoneyPayout(
        request,
        localAmount,
        country.currency,
        country.mobileMoney
      );

    case "bank_transfer":
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        success: true,
        reference: `BK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        message: `Bank transfer of ${country.currency} ${localAmount.toFixed(2)} initiated`,
        localAmount,
        localCurrency: country.currency,
        estimatedDelivery: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(), // 24 hours
      };

    case "crypto_wallet":
      return {
        success: true,
        reference: `CW-${Date.now()}`,
        message: `sBTC sent directly to crypto wallet`,
        localAmount,
        localCurrency: "sBTC",
        estimatedDelivery: new Date(Date.now() + 60 * 1000).toISOString(), // 1 minute
      };

    default:
      return {
        success: false,
        reference: "",
        message: "Unsupported payout method",
        localAmount: 0,
        localCurrency: "",
        estimatedDelivery: "",
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
      provider: country.mobileMoney,
      currency: country.currency,
      flag: country.flag,
    };
  }
  return result;
}
