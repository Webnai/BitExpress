"use client";

import { connect as stacksConnect, disconnect as stacksDisconnect, getLocalStorage, getSelectedProviderId } from "@stacks/connect";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type WalletName = "Leather" | "Xverse";

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  walletName: WalletName | null;
  isHydrated: boolean;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

interface PersistedWalletState {
  address: string;
  walletName: WalletName;
}

const STORAGE_KEY = "bitexpress.wallet";

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function pickAddress(addresses: Array<{ address: string; symbol?: string }>): string | null {
  // Prefer STX address; fall back to first available.
  return (
    addresses.find((a) => a.symbol?.toUpperCase() === "STX")?.address ??
    addresses[0]?.address ??
    null
  );
}

export function shortAddress(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function walletNameFromProviderId(providerId: string | null): WalletName | null {
  if (!providerId) return null;
  const normalized = providerId.toLowerCase();
  if (normalized.includes("xverse")) return "Xverse";
  if (normalized.includes("leather")) return "Leather";
  return null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<WalletName | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Restore session from our own storage first.
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted) as PersistedWalletState;
        if (parsed.address && parsed.walletName) {
          setAddress(parsed.address);
          setWalletName(parsed.walletName);
          setIsHydrated(true);
          return;
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Fall back to Stacks Connect storage.
    const connectStorage = getLocalStorage();
    const fallbackAddress =
      connectStorage?.addresses.stx[0]?.address ??
      connectStorage?.addresses.btc[0]?.address ??
      null;
    const selectedId = getSelectedProviderId();
    const fallbackWalletName = walletNameFromProviderId(selectedId);

    if (fallbackAddress && fallbackWalletName) {
      setAddress(fallbackAddress);
      setWalletName(fallbackWalletName);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ address: fallbackAddress, walletName: fallbackWalletName } satisfies PersistedWalletState),
      );
    }

    setIsHydrated(true);
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Use native wallet chooser popup so available providers are shown in one place.
      const result = await stacksConnect({
        network: "mainnet",
        forceWalletSelect: true,
        persistWalletSelect: true,
        enableLocalStorage: true,
      });

      const connectedAddress = pickAddress(result.addresses);
      if (!connectedAddress) {
        throw new Error("No address returned from wallet. Please try again.");
      }

      const selectedWalletName = walletNameFromProviderId(getSelectedProviderId());

      setAddress(connectedAddress);
      setWalletName(selectedWalletName);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ address: connectedAddress, walletName: selectedWalletName ?? "Leather" } satisfies PersistedWalletState),
      );
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    stacksDisconnect();
    window.localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
    setWalletName(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      connected: Boolean(address),
      address,
      walletName,
      isHydrated,
      isConnecting,
      connectWallet,
      disconnectWallet,
    }),
    [address, walletName, isHydrated, isConnecting, connectWallet, disconnectWallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return {
    ...context,
    displayAddress: shortAddress(context.address),
  };
}
