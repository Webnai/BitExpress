"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  TurnkeyProvider,
  useTurnkey,
  AuthState,
  ClientState,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";
import {
  generateWalletAccountsFromAddressFormat,
  type WalletAccount as TurnkeyWalletAccount,
  type Wallet as TurnkeyWallet,
} from "@turnkey/core";

import {
  apiCreateAuthChallenge,
  apiVerifyTurnkeyWalletSignature,
  apiVerifyWalletSignature,
} from "@/lib/api";
import { getE2EWalletSession } from "@/lib/e2e";
import { STACKS_NETWORK } from "@/lib/stacks";
import { getTurnkeyRuntimeConfig } from "@/lib/turnkey";
import {
  getFirebaseIdToken,
  getFirebaseSessionWalletAddress,
  signInWithFirebaseCustomToken,
  signOutFirebaseSession,
} from "@/lib/firebaseAuth";

type WalletName = "Leather" | "Turnkey";

interface WalletContextValue {
  connected: boolean;
  authenticated: boolean;
  address: string | null;
  walletName: WalletName | null;
  isHydrated: boolean;
  isConnecting: boolean;
  connectLeatherWallet: () => Promise<void>;
  loginTurnkey: () => Promise<void>;
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

interface ResolvedTurnkeyWallet {
  address: string;
  walletName: WalletName;
  walletAccount: TurnkeyWalletAccount;
}

const STORAGE_KEY = "bitexpress.wallet";
const turnkeyRuntimeConfig = getTurnkeyRuntimeConfig();
const turnkeyBitcoinAddressFormat =
  STACKS_NETWORK === "mainnet"
    ? "ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH"
    : "ADDRESS_FORMAT_BITCOIN_TESTNET_P2WPKH";
const turnkeyDefaultWalletAccounts = generateWalletAccountsFromAddressFormat({
  addresses: [turnkeyBitcoinAddressFormat, "ADDRESS_FORMAT_ETHEREUM", "ADDRESS_FORMAT_SOLANA"],
});

const turnkeyProviderConfig: TurnkeyProviderConfig | null = turnkeyRuntimeConfig
  ? {
      organizationId: turnkeyRuntimeConfig.organizationId,
      authProxyConfigId: turnkeyRuntimeConfig.authProxyConfigId,
      auth: {
        methods: {
          emailOtpAuthEnabled: true,
          passkeyAuthEnabled: true,
        },
        createSuborgParams: {
          emailOtpAuth: {
            customWallet: {
              walletName: "BitExpress Embedded Wallet",
              walletAccounts: turnkeyDefaultWalletAccounts,
            },
          },
          passkeyAuth: {
            passkeyName: "BitExpress Passkey",
            customWallet: {
              walletName: "BitExpress Embedded Wallet",
              walletAccounts: turnkeyDefaultWalletAccounts,
            },
          },
          oauth: {
            customWallet: {
              walletName: "BitExpress Embedded Wallet",
              walletAccounts: turnkeyDefaultWalletAccounts,
            },
          },
        },
      },
    }
  : null;

const WalletContext = createContext<WalletContextValue | undefined>(undefined);
type TurnkeyLoginRunner = (() => Promise<void>) | undefined;
type TurnkeyWalletResolver = (() => Promise<ResolvedTurnkeyWallet | null>) | undefined;
type TurnkeyAuthChecker = (() => boolean) | undefined;
type TurnkeyLogoutRunner = (() => Promise<void>) | undefined;
type TurnkeyFirebaseBridgeRunner = ((wallet: ResolvedTurnkeyWallet) => Promise<void>) | undefined;

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
  if (normalized.includes("leather")) return "Leather";
  return null;
}

function isStacksAddress(address: string): boolean {
  return /^(SP|ST|SM|SN)[A-Z0-9]+$/.test(address);
}

function isBitcoinAddress(address: string): boolean {
  return /^(bc1|tb1|1|3|m|n|2)[a-zA-Z0-9]+$/.test(address);
}

function isEd25519TurnkeyAccount(account: TurnkeyWalletAccount): boolean {
  return String(account.curve || "").toUpperCase().includes("ED25519");
}

function pickTurnkeyWalletAccount(wallets: TurnkeyWallet[]): TurnkeyWalletAccount | null {
  const accounts = wallets.flatMap((wallet) => wallet.accounts ?? []);
  if (!accounts.length) return null;

  const stacks = accounts.find((account) => isStacksAddress(account.address));
  if (stacks) return stacks;

  const bitcoin = accounts.find((account) => isBitcoinAddress(account.address));
  return bitcoin ?? accounts[0] ?? null;
}

function WalletProviderCore({
  children,
  runTurnkeyLogin,
  resolveTurnkeyWallet,
  ensureTurnkeyWallet,
  isTurnkeyAuthenticated,
  runTurnkeyLogout,
  runTurnkeyFirebaseBridge,
}: {
  children: React.ReactNode;
  runTurnkeyLogin?: TurnkeyLoginRunner;
  resolveTurnkeyWallet?: TurnkeyWalletResolver;
  ensureTurnkeyWallet?: TurnkeyWalletResolver;
  isTurnkeyAuthenticated?: TurnkeyAuthChecker;
  runTurnkeyLogout?: TurnkeyLogoutRunner;
  runTurnkeyFirebaseBridge?: TurnkeyFirebaseBridgeRunner;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<WalletName | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    async function hydrateSession() {
      try {
        // When Turnkey is enabled and authenticated, prefer its managed wallet state.
        if (isTurnkeyAuthenticated?.() && resolveTurnkeyWallet) {
          const turnkeyWallet = await resolveTurnkeyWallet();
          if (turnkeyWallet) {
            let token = await getFirebaseIdToken();
            if (!token && runTurnkeyFirebaseBridge) {
              await runTurnkeyFirebaseBridge(turnkeyWallet);
              token = await getFirebaseIdToken();
            }

            if (!token) {
              setAddress(null);
              setWalletName(null);
              setAuthenticated(false);
              window.localStorage.removeItem(STORAGE_KEY);
              setIsHydrated(true);
              return;
            }

            setAddress(turnkeyWallet.address);
            setWalletName(turnkeyWallet.walletName);
            setAuthenticated(true);
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                address: turnkeyWallet.address,
                walletName: turnkeyWallet.walletName,
              } satisfies PersistedWalletState),
            );
            setIsHydrated(true);
            return;
          }
        }

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
      } catch (error) {
        console.error("[wallet.hydrate] failed", {
          message: error instanceof Error ? error.message : String(error),
          error,
        });

        setAddress(null);
        setWalletName(null);
        setAuthenticated(false);
        window.localStorage.removeItem(STORAGE_KEY);
      }

      setIsHydrated(true);
    }

    void hydrateSession();
  }, [isTurnkeyAuthenticated, resolveTurnkeyWallet, runTurnkeyFirebaseBridge]);

  const connectLeatherWallet = useCallback(async () => {
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

      const { connect, request } = await loadStacksConnect();
      const result = await connect({
        network: STACKS_NETWORK,
        forceWalletSelect: true,
        enableLocalStorage: true,
      });

      const connectedEntry = pickAddressEntry(result.addresses);
      const connectedAddress = connectedEntry?.address ?? null;
      if (!connectedAddress) {
        throw new Error("No address returned from wallet. Please try again.");
      }

      const { getSelectedProviderId } = await loadStacksConnect();
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

  const loginTurnkey = useCallback(async () => {
    if (!runTurnkeyLogin) {
      throw new Error("Turnkey login is not configured.");
    }

    setIsConnecting(true);
    try {
      await runTurnkeyLogin();

      let turnkeyWallet: ResolvedTurnkeyWallet | null = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        turnkeyWallet =
          (ensureTurnkeyWallet ? await ensureTurnkeyWallet() : null) ??
          (resolveTurnkeyWallet ? await resolveTurnkeyWallet() : null);

        if (turnkeyWallet) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      if (!turnkeyWallet) {
        throw new Error(
          "Turnkey login succeeded, but wallet provisioning has not completed yet. Please retry in a moment.",
        );
      }

      if (runTurnkeyFirebaseBridge) {
        await runTurnkeyFirebaseBridge(turnkeyWallet);
      }

      setAddress(turnkeyWallet.address);
      setWalletName(turnkeyWallet.walletName);
      setAuthenticated(true);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          address: turnkeyWallet.address,
          walletName: turnkeyWallet.walletName,
        } satisfies PersistedWalletState),
      );
    } catch (error) {
      console.error("[wallet.turnkey_login] flow failed", {
        stage: "connect.flow",
        message: error instanceof Error ? error.message : String(error),
        error,
      });
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [runTurnkeyLogin, ensureTurnkeyWallet, resolveTurnkeyWallet, runTurnkeyFirebaseBridge]);

  const connectWallet = useCallback(async () => {
    if (runTurnkeyLogin) {
      await loginTurnkey();
      return;
    }

    await connectLeatherWallet();
  }, [runTurnkeyLogin, loginTurnkey, connectLeatherWallet]);

  const disconnectWallet = useCallback(async () => {
    if (walletName === "Turnkey" && runTurnkeyLogout) {
      await runTurnkeyLogout();
      await signOutFirebaseSession();
      window.localStorage.removeItem(STORAGE_KEY);
      setAddress(null);
      setWalletName(null);
      setAuthenticated(false);
      return;
    }

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
  }, [walletName, runTurnkeyLogout]);

  const value = useMemo<WalletContextValue>(
    () => ({
      connected: Boolean(address) && authenticated,
      authenticated,
      address,
      walletName,
      isHydrated,
      isConnecting,
      connectLeatherWallet,
      loginTurnkey,
      connectWallet,
      disconnectWallet,
    }),
    [
      authenticated,
      address,
      walletName,
      isHydrated,
      isConnecting,
      connectLeatherWallet,
      loginTurnkey,
      connectWallet,
      disconnectWallet,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function WalletProviderWithTurnkey({ children }: { children: React.ReactNode }) {
  const { handleLogin, authState, clientState, wallets, refreshWallets, createWallet, logout, session, signMessage } = useTurnkey();
  const authStateRef = useRef(authState);
  const sessionRef = useRef(session);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const waitForSessionReady = useCallback(async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        authStateRef.current === AuthState.Authenticated &&
        sessionRef.current
      ) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error("Turnkey session is not ready yet. Please try again.");
  }, []);

  const resolveTurnkeyWallet = useCallback(async () => {
    const inMemoryAccount = pickTurnkeyWalletAccount(wallets);
    if (inMemoryAccount) {
      return {
        address: inMemoryAccount.address,
        walletName: "Turnkey" as const,
        walletAccount: inMemoryAccount,
      };
    }

    if (
      authStateRef.current !== AuthState.Authenticated ||
      !sessionRef.current
    ) {
      return null;
    }

    const refreshed = await refreshWallets().catch(() => []);
    const refreshedAccount = pickTurnkeyWalletAccount(refreshed);
    if (!refreshedAccount) return null;

    return {
      address: refreshedAccount.address,
      walletName: "Turnkey" as const,
      walletAccount: refreshedAccount,
    };
  }, [wallets, refreshWallets]);

  const ensureTurnkeyWallet = useCallback(async () => {
    const existing = await resolveTurnkeyWallet();
    if (existing) return existing;

    if (
      authStateRef.current !== AuthState.Authenticated ||
      !sessionRef.current
    ) {
      return null;
    }

    await createWallet({
      walletName: `BitExpress Wallet ${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {
      // If wallet creation is disabled by policy/config, we'll surface a user-facing error upstream.
      return null;
    });

    return resolveTurnkeyWallet();
  }, [resolveTurnkeyWallet, createWallet]);

  const runTurnkeyLogin = useCallback(async () => {
    if (authState === AuthState.Authenticated) {
      return;
    }

    if (clientState !== ClientState.Ready) {
      throw new Error("Turnkey is still initializing. Please try again in a moment.");
    }

    await handleLogin({
      title: "Log in or sign up to BitExpress",
    });

    await waitForSessionReady();
  }, [authState, clientState, handleLogin, waitForSessionReady]);

  const isTurnkeyAuthenticated = useCallback(
    () =>
      authStateRef.current === AuthState.Authenticated &&
      Boolean(sessionRef.current),
    [],
  );

  const runTurnkeyLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const runTurnkeyFirebaseBridge = useCallback(
    async (wallet: ResolvedTurnkeyWallet) => {
      try {
        if (!wallet.walletAccount.publicKey) {
          throw new Error("Turnkey wallet account is missing a public key.");
        }

        const challenge = await apiCreateAuthChallenge(wallet.address);

        const signature = await signMessage({
          message: challenge.message,
          walletAccount: wallet.walletAccount,
          encoding: "PAYLOAD_ENCODING_TEXT_UTF8",
          hashFunction: isEd25519TurnkeyAccount(wallet.walletAccount)
            ? "HASH_FUNCTION_NOT_APPLICABLE"
            : "HASH_FUNCTION_SHA256",
        });

        const verification = await apiVerifyTurnkeyWalletSignature({
          walletAddress: wallet.address,
          nonce: challenge.nonce,
          publicKey: wallet.walletAccount.publicKey,
          signature: {
            r: signature.r,
            s: signature.s,
            v: signature.v,
          },
        });

        await signInWithFirebaseCustomToken(verification.customToken, wallet.address);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Cannot reach BitExpress API")) {
          throw new Error(
            "Turnkey login succeeded, but backend auth is offline. Start the backend API on port 4000 or set NEXT_PUBLIC_API_BASE_URL."
          );
        }

        throw error;
      }
    },
    [signMessage],
  );

  return (
    <WalletProviderCore
      runTurnkeyLogin={runTurnkeyLogin}
      resolveTurnkeyWallet={resolveTurnkeyWallet}
      ensureTurnkeyWallet={ensureTurnkeyWallet}
      isTurnkeyAuthenticated={isTurnkeyAuthenticated}
      runTurnkeyLogout={runTurnkeyLogout}
      runTurnkeyFirebaseBridge={runTurnkeyFirebaseBridge}
    >
      {children}
    </WalletProviderCore>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!turnkeyProviderConfig) {
    return <WalletProviderCore>{children}</WalletProviderCore>;
  }

  return (
    <TurnkeyProvider
      config={turnkeyProviderConfig}
      callbacks={{
        onError: (error) => {
          console.error("[turnkey] auth flow error", error);
        },
      }}
    >
      <WalletProviderWithTurnkey>{children}</WalletProviderWithTurnkey>
    </TurnkeyProvider>
  );
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
