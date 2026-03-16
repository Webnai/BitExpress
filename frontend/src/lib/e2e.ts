type WalletName = "Leather";

export interface BitExpressE2EState {
  wallet?: {
    address: string;
    walletName?: WalletName;
  };
  authToken?: string;
  txids?: {
    send?: string;
    claim?: string;
    refund?: string;
  };
}

declare global {
  interface Window {
    __BITEXPRESS_E2E__?: BitExpressE2EState;
  }
}

export function getE2EState(): BitExpressE2EState | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__BITEXPRESS_E2E__ ?? null;
}

export function getE2EWalletSession(): {
  address: string;
  walletName: WalletName;
  authToken: string;
} | null {
  const state = getE2EState();
  const address = state?.wallet?.address;

  if (!address) {
    return null;
  }

  return {
    address,
    walletName: state.wallet?.walletName ?? "Leather",
    authToken: state.authToken ?? "bitexpress-e2e-auth-token",
  };
}

export function getE2EMockTxId(kind: "send" | "claim" | "refund"): string | null {
  return getE2EState()?.txids?.[kind] ?? null;
}
