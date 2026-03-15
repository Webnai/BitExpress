"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiCreateAuthChallenge, apiVerifyWalletSignature } from "@/lib/api";
import { getE2EWalletSession } from "@/lib/e2e";
import { STACKS_NETWORK } from "@/lib/stacks";
import {
  getFirebaseIdToken,
  getFirebaseSessionWalletAddress,
  signInWithFirebaseCustomToken,
  signOutFirebaseSession,
} from "@/lib/firebaseAuth";

type WalletName = "Leather" | "Xverse";

interface WalletContextValue {
  connected: boolean;
  authenticated: boolean;
  address: string | null;
  walletName: WalletName | null;
  isHydrated: boolean;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
}

interface PersistedWalletState {
  address: string;
  walletName: WalletName;
}

interface WalletAddressEntry {
  address: string;
  symbol?: string;
  publicKey?: string;
}

const STORAGE_KEY = "bitexpress.wallet";

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

async function loadStacksConnect() {
  return import("@stacks/connect");
}

function pickAddressEntry(addresses: WalletAddressEntry[]): WalletAddressEntry | null {
  return addresses.find((a) => a.symbol?.toUpperCase() === "STX") ?? addresses[0] ?? null;
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
  const [authenticated, setAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    async function hydrateSession() {
      const e2eSession = getE2EWalletSession();
      if (e2eSession) {
        setAddress(e2eSession.address);
        setWalletName(e2eSession.walletName);
        setAuthenticated(true);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            address: e2eSession.address,
            walletName: e2eSession.walletName,
          } satisfies PersistedWalletState),
        );
        setIsHydrated(true);
        return;
      }

      let candidateAddress: string | null = null;
      let candidateWalletName: WalletName | null = null;

      const persisted = window.localStorage.getItem(STORAGE_KEY);
      if (persisted) {
        try {
          const parsed = JSON.parse(persisted) as PersistedWalletState;
          if (parsed.address && parsed.walletName) {
            candidateAddress = parsed.address;
            candidateWalletName = parsed.walletName;
          }
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      if (!candidateAddress || !candidateWalletName) {
        const { getLocalStorage, getSelectedProviderId } = await loadStacksConnect();
        const connectStorage = getLocalStorage();
        const fallbackAddress =
          connectStorage?.addresses.stx[0]?.address ?? connectStorage?.addresses.btc[0]?.address ?? null;
        const selectedId = getSelectedProviderId();
        const fallbackWalletName = walletNameFromProviderId(selectedId);

        if (fallbackAddress && fallbackWalletName) {
          candidateAddress = fallbackAddress;
          candidateWalletName = fallbackWalletName;
        }
      }

      const token = await getFirebaseIdToken();
      const sessionWallet = await getFirebaseSessionWalletAddress();

      if (candidateAddress && candidateWalletName && token && sessionWallet === candidateAddress) {
        setAddress(candidateAddress);
        setWalletName(candidateWalletName);
        setAuthenticated(true);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            address: candidateAddress,
            walletName: candidateWalletName,
          } satisfies PersistedWalletState),
        );
      } else {
        setAddress(null);
        setWalletName(null);
        setAuthenticated(false);
        window.localStorage.removeItem(STORAGE_KEY);
      }

      setIsHydrated(true);
    }

    void hydrateSession();
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const e2eSession = getE2EWalletSession();
      if (e2eSession) {
        setAddress(e2eSession.address);
        setWalletName(e2eSession.walletName);
        setAuthenticated(true);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            address: e2eSession.address,
            walletName: e2eSession.walletName,
          } satisfies PersistedWalletState),
        );
        return;
      }

      const { connect, getSelectedProviderId, request } = await loadStacksConnect();
      const result = await connect({
        network: STACKS_NETWORK,
        forceWalletSelect: true,
        persistWalletSelect: true,
        enableLocalStorage: true,
      });

      const connectedEntry = pickAddressEntry(result.addresses);
      const connectedAddress = connectedEntry?.address ?? null;
      if (!connectedAddress) {
        throw new Error("No address returned from wallet. Please try again.");
      }

      const selectedWalletName = walletNameFromProviderId(getSelectedProviderId()) ?? "Leather";

      const challenge = await apiCreateAuthChallenge(connectedAddress).catch((error) => {
        console.error("[wallet.connect] auth challenge failed", {
          stage: "auth.challenge",
          walletAddress: connectedAddress,
          message: error instanceof Error ? error.message : String(error),
          error,
        });
        throw error;
      });

      const signatureData = await request("stx_signMessage", {
        message: challenge.message,
        publicKey: connectedEntry?.publicKey,
      }).catch((error) => {
        console.error("[wallet.connect] wallet signing failed", {
          stage: "wallet.sign_message",
          walletAddress: connectedAddress,
          hasPublicKey: Boolean(connectedEntry?.publicKey),
          message: error instanceof Error ? error.message : String(error),
          error,
        });
        throw error;
      });

      const verification = await apiVerifyWalletSignature({
        walletAddress: connectedAddress,
        nonce: challenge.nonce,
        signature: signatureData.signature,
        publicKey: signatureData.publicKey,
      }).catch((error) => {
        console.error("[wallet.connect] auth verify failed", {
          stage: "auth.verify",
          walletAddress: connectedAddress,
          nonce: challenge.nonce,
          message: error instanceof Error ? error.message : String(error),
          error,
        });
        throw error;
      });

      await signInWithFirebaseCustomToken(verification.customToken, connectedAddress).catch((error) => {
        console.error("[wallet.connect] firebase sign-in failed", {
          stage: "firebase.custom_token_signin",
          walletAddress: connectedAddress,
          message: error instanceof Error ? error.message : String(error),
          error,
        });
        throw error;
      });

      setAddress(connectedAddress);
      setWalletName(selectedWalletName);
      setAuthenticated(true);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ address: connectedAddress, walletName: selectedWalletName } satisfies PersistedWalletState),
      );
    } catch (error) {
      console.error("[wallet.connect] connect flow failed", {
        stage: "connect.flow",
        message: error instanceof Error ? error.message : String(error),
        error,
      });
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    const e2eSession = getE2EWalletSession();
    if (e2eSession) {
      window.localStorage.removeItem(STORAGE_KEY);
      setAddress(null);
      setWalletName(null);
      setAuthenticated(false);
      return;
    }

    const { disconnect } = await loadStacksConnect();
    disconnect();
    window.localStorage.removeItem(STORAGE_KEY);
    await signOutFirebaseSession();
    setAddress(null);
    setWalletName(null);
    setAuthenticated(false);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      connected: Boolean(address) && authenticated,
      authenticated,
      address,
      walletName,
      isHydrated,
      isConnecting,
      connectWallet,
      disconnectWallet,
    }),
    [authenticated, address, walletName, isHydrated, isConnecting, connectWallet, disconnectWallet],
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
