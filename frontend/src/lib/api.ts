import { API_BASE_URL } from "@/types";

export async function apiSend(payload: {
  senderWallet: string;
  receiverWallet: string;
  amountUsd: number;
  sourceCountry: string;
  destCountry: string;
  recipientPhone?: string;
  recipientName?: string;
  payoutMethod: string;
}) {
  const res = await fetch(`${API_BASE_URL}/api/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
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
  return res.json();
}

export async function apiGetTransaction(id: string) {
  const res = await fetch(`${API_BASE_URL}/api/transaction/${id}`);
  return res.json();
}

export async function apiGetWalletHistory(address: string) {
  const res = await fetch(`${API_BASE_URL}/api/transaction/wallet/${address}`);
  return res.json();
}

export async function apiGetExchangeRates() {
  const res = await fetch(`${API_BASE_URL}/api/exchange-rate`);
  return res.json();
}

export async function apiGetEstimate(amountUsd: number) {
  const res = await fetch(`${API_BASE_URL}/api/exchange-rate/estimate/${amountUsd}`);
  return res.json();
}
