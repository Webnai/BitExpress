import { getFirebaseIdToken } from "@/lib/firebaseAuth";
import { logClientError, logClientInfo } from "@/lib/debug";
import { API_BASE_URL } from "@/types";

const STACKS_MAINNET_API_BASE_URL = process.env.NEXT_PUBLIC_STACKS_API_URL || "https://api.hiro.so";
const STACKS_TESTNET_API_BASE_URL =
  process.env.NEXT_PUBLIC_STACKS_TESTNET_API_URL || "https://api.testnet.hiro.so";
const STACKS_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
// Mainnet sBTC: SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc
const SBTC_ASSET_IDENTIFIER =
  process.env.NEXT_PUBLIC_SBTC_ASSET_IDENTIFIER || `${STACKS_CONTRACT_ADDRESS}.sbtc-token::sbtc`;

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseJsonResponse<T>(path: string, res: Response): Promise<T> {
  const data = await res.clone().json().catch(async () => res.clone().text().catch(() => null));

  logClientInfo("api.response", {
    path,
    status: res.status,
    ok: res.ok,
    data,
  });

  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}`;

    logClientError("api.response_error", {
      path,
      status: res.status,
      data,
      message,
    });

    throw new Error(message);
  }

  return data as T;
}

async function apiFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    requiresAuth?: boolean;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.requiresAuth) {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("You must be signed in before making this request.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  logClientInfo("api.request", {
    path,
    method,
    requiresAuth: Boolean(options.requiresAuth),
    hasIdempotencyKey: Boolean(options.idempotencyKey),
    body: options.body ?? null,
  });

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    return parseJsonResponse<T>(path, response);
  } catch (error) {
    logClientError("api.request_failed", {
      path,
      method,
      message: error instanceof Error ? error.message : "unknown",
      body: options.body ?? null,
    });
    throw error;
  }
}

export async function apiCreateAuthChallenge(walletAddress: string) {
  return apiFetch<{
    walletAddress: string;
    nonce: string;
    message: string;
    expiresAt: string;
  }>("/api/auth/challenge", {
    method: "POST",
    body: { walletAddress },
  });
}

export async function apiVerifyWalletSignature(payload: {
  walletAddress: string;
  nonce: string;
  signature: string;
  publicKey: string;
}) {
  return apiFetch<{
    customToken: string;
    walletAddress: string;
  }>("/api/auth/verify", {
    method: "POST",
    body: payload,
  });
}

export async function apiSend(payload: {
  receiverWallet: string;
  amountUsd: number;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  recipientMobileProvider?: string;
  payoutMethod: string;
  stacksTxId?: string;
  idempotencyKey?: string;
}) {
  const { idempotencyKey, ...body } = payload;

  return apiFetch<{
    success: boolean;
    transfer: {
      id: string;
      status: string;
      onChainTransferId?: number;
      amount: number;
      fee: number;
      netAmount: number;
      sourceCountry: string;
      destCountry: string;
      createdAt: string;
    };
  }>("/api/send", {
    method: "POST",
    requiresAuth: true,
    idempotencyKey: idempotencyKey ?? makeIdempotencyKey(),
    body,
  });
}

export async function apiClaim(payload: {
  transferId: string;
  claimCode?: string;
  claimStacksTxId?: string;
  idempotencyKey?: string;
}) {
  const { idempotencyKey, ...body } = payload;

  return apiFetch<{
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
        provider?: string;
        status?: string;
      };
    };
  }>("/api/claim", {
    method: "POST",
    requiresAuth: true,
    idempotencyKey: idempotencyKey ?? makeIdempotencyKey(),
    body,
  });
}

export async function apiGetTransaction(id: string) {
  return apiFetch<{
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
      onChainTransferId?: number;
      recipientPhone?: string;
      recipientName?: string;
      recipientMobileProvider?: string;
      payoutMethod?: string;
      payoutProvider?: string;
      payoutStatus?: string;
      claimStacksTxId?: string;
      refundStacksTxId?: string;
      createdAt: string;
      claimedAt?: string;
      refundedAt?: string;
      mobileMoneyRef?: string;
    };
  }>(`/api/transaction/${id}`);
}

export async function apiGetWalletHistory(address: string) {
  return apiFetch<{
    sent: Array<{
      id: string;
      direction: "sent";
      counterpartyWallet: string;
      counterpartyName?: string;
      amountUsd: number;
      fee: number;
      netAmount: number;
      countryCode: string;
      countryName?: string;
      payoutMethod: string;
      recipientMobileProvider?: string;
      payoutProvider?: string;
      payoutStatus?: string;
      status: string;
      onChainTransferId?: number;
      stacksTxId?: string;
      claimStacksTxId?: string;
      refundStacksTxId?: string;
      createdAt: string;
      claimedAt?: string;
      refundedAt?: string;
      mobileMoneyRef?: string;
    }>;
    received: Array<{
      id: string;
      direction: "received";
      counterpartyWallet: string;
      counterpartyName?: string;
      amountUsd: number;
      fee: number;
      netAmount: number;
      countryCode: string;
      countryName?: string;
      payoutMethod: string;
      recipientMobileProvider?: string;
      payoutProvider?: string;
      payoutStatus?: string;
      status: string;
      onChainTransferId?: number;
      stacksTxId?: string;
      claimStacksTxId?: string;
      refundStacksTxId?: string;
      createdAt: string;
      claimedAt?: string;
      refundedAt?: string;
      mobileMoneyRef?: string;
    }>;
  }>(`/api/transaction/wallet/${address}`, { requiresAuth: true });
}

export async function apiRefundTransfer(payload: {
  transferId: string;
  refundStacksTxId?: string;
}) {
  return apiFetch<{
    success: boolean;
    message: string;
    transferId: string;
    refundStacksTxId?: string;
    refundedAt: string;
  }>(`/api/transaction/${payload.transferId}/refund`, {
    method: "POST",
    requiresAuth: true,
    body: { refundStacksTxId: payload.refundStacksTxId },
  });
}

export async function apiGetWalletBalance(address: string) {
  const isTestnet = address.startsWith("ST") || address.startsWith("SN");
  const baseUrl = isTestnet ? STACKS_TESTNET_API_BASE_URL : STACKS_MAINNET_API_BASE_URL;
  const path = `/extended/v1/address/${address}/balances`;

  logClientInfo("api.request", {
    path,
    method: "GET",
    requiresAuth: false,
    baseUrl,
  });

  const res = await fetch(`${baseUrl}/extended/v1/address/${address}/balances`, {
    cache: "no-store",
  });
  return parseJsonResponse<{
    stx: {
      balance: string;
      total_sent: string;
      total_received: string;
    };
  }>(path, res);
}

export async function apiGetSbtcBalance(address: string) {
  const isTestnet = address.startsWith("ST") || address.startsWith("SN");
  const baseUrl = isTestnet ? STACKS_TESTNET_API_BASE_URL : STACKS_MAINNET_API_BASE_URL;
  const path = `/extended/v1/address/${address}/balances`;

  logClientInfo("api.request", {
    path,
    method: "GET",
    requiresAuth: false,
    baseUrl,
  });

  const res = await fetch(`${baseUrl}/extended/v1/address/${address}/balances`, {
    cache: "no-store",
  });

  const data = await parseJsonResponse<{
    fungible_tokens?: Record<
      string,
      {
        balance?: string;
        total_sent?: string;
        total_received?: string;
      }
    >;
  }>(path, res);

  const token = data.fungible_tokens?.[SBTC_ASSET_IDENTIFIER];
  return {
    assetIdentifier: SBTC_ASSET_IDENTIFIER,
    balance: token?.balance || "0",
    totalSent: token?.total_sent || "0",
    totalReceived: token?.total_received || "0",
  };
}

export async function apiGetExchangeRates() {
  return apiFetch<{
    rates: Record<
      string,
      {
        from: string;
        to: string;
        rate: number;
        btcUsdPrice: number;
        updatedAt: string;
      }
    >;
    supportedCountries: Array<{
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
    }>;
  }>("/api/exchange-rate");
}

export async function apiGetEstimate(amountUsd: number) {
  return apiFetch<{
    amountUsd: number;
    estimates: Record<string, { localAmount: number; currency: string; flag: string }>;
  }>(`/api/exchange-rate/estimate/${amountUsd}`);
}
