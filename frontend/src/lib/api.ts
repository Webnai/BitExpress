import { API_BASE_URL } from "@/types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function apiSend(payload: {
  senderWallet: string;
  receiverWallet: string;
  amountUsd: number;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  payoutMethod: string;
  stacksTxId?: string;
}) {
  const res = await fetch(`${API_BASE_URL}/api/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<{
    success: boolean;
    transfer: {
      id: string;
      status: string;
      amount: number;
      fee: number;
      netAmount: number;
      sourceCountry: string;
      destCountry: string;
      createdAt: string;
    };
  }>(res);
}

export async function apiClaim(payload: {
  transferId: string;
  receiverWallet: string;
  claimCode?: string;
}) {
  const res = await fetch(`${API_BASE_URL}/api/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<{
    success: boolean;
    transfer: {
      id: string;
      status: string;
      claimedAt?: string;
      payout?: {
        reference: string;
        localAmount: number;
        localCurrency: string;
        message: string;
        estimatedDelivery?: string;
      };
    };
  }>(res);
}

export async function apiGetTransaction(id: string) {
  const res = await fetch(`${API_BASE_URL}/api/transaction/${id}`);
  return parseJsonResponse<{
    transaction: {
      id: string;
      sender: string;
      receiver: string;
      amountUsd: number;
      fee: number;
      netAmount: number;
      status: string;
      sourceCountry: { code: string; name?: string; currency?: string };
      destCountry: { code: string; name?: string; currency?: string; mobileMoney?: string };
      recipientPhone?: string;
      recipientName?: string;
      payoutMethod?: string;
      createdAt: string;
      claimedAt?: string;
      mobileMoneyRef?: string;
    };
  }>(res);
}

export async function apiGetWalletHistory(address: string) {
  const res = await fetch(`${API_BASE_URL}/api/transaction/wallet/${address}`);
  return parseJsonResponse<{
    sent: Array<{
      id: string;
      receiver: string;
      amountUsd: number;
      destCountry: string;
      status: string;
      createdAt: string;
    }>;
    received: Array<{
      id: string;
      sender: string;
      amountUsd: number;
      sourceCountry: string;
      status: string;
      createdAt: string;
    }>;
  }>(res);
}

export async function apiGetExchangeRates() {
  const res = await fetch(`${API_BASE_URL}/api/exchange-rate`);
  return parseJsonResponse<{
    rates: Record<string, unknown>;
    supportedCountries: Array<{
      code: string;
      name: string;
      currency: string;
      currencySymbol: string;
      mobileMoney: string;
      flag: string;
    }>;
  }>(res);
}

export async function apiGetEstimate(amountUsd: number) {
  const res = await fetch(`${API_BASE_URL}/api/exchange-rate/estimate/${amountUsd}`);
  return parseJsonResponse<{
    amountUsd: number;
    estimates: Record<string, { localAmount: number; currency: string; flag: string }>;
  }>(res);
}
