"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWallet } from "@/components/WalletProvider";
import {
  apiDevCreditMyLedger,
  apiDevSimulateDepositLifecycle,
  apiGetMyLedger,
  apiGetSbtcBalance,
  apiGetWalletBalance,
} from "@/lib/api";
import {
  createSbtcFaucetTx,
  STACKS_NETWORK,
  waitForStacksTxSuccess,
} from "@/lib/stacks";
import { logClientError, logClientInfo } from "@/lib/debug";

function isStacksWalletAddress(value: string): boolean {
  return /^(SP|ST|SM|SN)[A-Z0-9]+$/.test(value);
}

export default function FundGuidePage() {
  const { address, walletName } = useWallet();
  const stacksReady = Boolean(address && isStacksWalletAddress(address));
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [isMintingFaucet, setIsMintingFaucet] = useState(false);
  const [isCreditingLedger, setIsCreditingLedger] = useState(false);
  const [isSimulatingPending, setIsSimulatingPending] = useState(false);
  const [isSimulatingSettle, setIsSimulatingSettle] = useState(false);
  const [stxBalance, setStxBalance] = useState<string | null>(null);
  const [sbtcBalance, setSbtcBalance] = useState<string | null>(null);
  const [sbtcAssetIdentifier, setSbtcAssetIdentifier] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<
    Array<{
      id: string;
      currency: "BTC" | "sBTC" | "STX" | "USD";
      availableBalance: number;
      pendingBalance: number;
      heldBalance: number;
      updatedAt: string;
      lastReason?: string;
    }>
  >([]);

  const stxBalanceDisplay = useMemo(() => {
    if (!stxBalance) return "0";
    const microStx = Number(stxBalance);
    if (!Number.isFinite(microStx)) return "0";
    return (microStx / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }, [stxBalance]);

  const sbtcBalanceDisplay = useMemo(() => {
    if (!sbtcBalance) return "0";
    const sats = Number(sbtcBalance);
    if (!Number.isFinite(sats)) return "0";
    return (sats / 100_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    });
  }, [sbtcBalance]);

  const canUseTestnetFaucet = STACKS_NETWORK === "testnet" && stacksReady;

  const refreshBalances = useCallback(async () => {
    if (!address || !stacksReady) {
      setStxBalance(null);
      setSbtcBalance(null);
      setSbtcAssetIdentifier(null);
      setLedgerRows([]);
      return;
    }

    setIsLoadingBalances(true);
    try {
      const [wallet, sbtc, ledger] = await Promise.allSettled([
        apiGetWalletBalance(address),
        apiGetSbtcBalance(address),
        apiGetMyLedger(),
      ]);

      if (wallet.status === "fulfilled") {
        setStxBalance(wallet.value.stx.balance);
      } else {
        setStxBalance(null);
      }

      if (sbtc.status === "fulfilled") {
        setSbtcBalance(sbtc.value.balance);
        setSbtcAssetIdentifier(sbtc.value.assetIdentifier);
      } else {
        setSbtcBalance(null);
        setSbtcAssetIdentifier(null);
      }

      if (ledger.status === "fulfilled") {
        setLedgerRows(ledger.value.ledger);
      } else {
        setLedgerRows([]);
      }

      logClientInfo("fund.balances.loaded", {
        address,
        stxBalance: wallet.status === "fulfilled" ? wallet.value.stx.balance : null,
        sbtcBalance: sbtc.status === "fulfilled" ? sbtc.value.balance : null,
        ledgerRows: ledger.status === "fulfilled" ? ledger.value.ledger.length : 0,
      });
    } catch (error) {
      logClientError("fund.balances.failed", {
        address,
        message: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      setIsLoadingBalances(false);
    }
  }, [address, stacksReady]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  async function handleMintSbtcFaucet() {
    if (!canUseTestnetFaucet) {
      toast.error("sBTC faucet is only available on testnet with a connected Stacks wallet.");
      return;
    }

    setIsMintingFaucet(true);
    try {
      toast.info("Opening wallet to mint test sBTC...");
      const { txid } = await createSbtcFaucetTx();
      toast.info("Waiting for faucet transaction confirmation...");
      await waitForStacksTxSuccess(txid, { timeoutMs: 180000, pollIntervalMs: 4000 });
      await refreshBalances();
      toast.success("Test sBTC minted successfully.");
      logClientInfo("fund.faucet.succeeded", { txid, address });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      logClientError("fund.faucet.failed", { address, message });
      toast.error(error instanceof Error ? error.message : "Failed to mint test sBTC.");
    } finally {
      setIsMintingFaucet(false);
    }
  }

  async function handleDevCreditLedger() {
    if (!stacksReady) {
      toast.error("Connect a Stacks wallet first.");
      return;
    }

    setIsCreditingLedger(true);
    try {
      await apiDevCreditMyLedger({
        currency: "BTC",
        amount: 25,
        reason: "demo_btc_deposit_credit",
      });
      await refreshBalances();
      toast.success("Demo ledger credit added (BTC +25). Backend scaffold is ready.");
      logClientInfo("fund.ledger.credit.succeeded", { address, currency: "BTC", amount: 25 });
    } catch (error) {
      logClientError("fund.ledger.credit.failed", {
        address,
        message: error instanceof Error ? error.message : "unknown",
      });
      toast.error(error instanceof Error ? error.message : "Unable to add demo ledger credit.");
    } finally {
      setIsCreditingLedger(false);
    }
  }

  async function handleSimulatePendingDeposit() {
    if (!stacksReady) {
      toast.error("Connect a Stacks wallet first.");
      return;
    }

    setIsSimulatingPending(true);
    try {
      await apiDevSimulateDepositLifecycle({
        amountBtc: 0.02,
        phase: "pending",
      });
      await refreshBalances();
      toast.success("Simulated BTC deposit is now pending in ledger.");
      logClientInfo("fund.ledger.deposit_pending.simulated", {
        address,
        amountBtc: 0.02,
      });
    } catch (error) {
      logClientError("fund.ledger.deposit_pending.failed", {
        address,
        message: error instanceof Error ? error.message : "unknown",
      });
      toast.error(error instanceof Error ? error.message : "Unable to simulate pending deposit.");
    } finally {
      setIsSimulatingPending(false);
    }
  }

  async function handleSimulateSettleDeposit() {
    if (!stacksReady) {
      toast.error("Connect a Stacks wallet first.");
      return;
    }

    setIsSimulatingSettle(true);
    try {
      await apiDevSimulateDepositLifecycle({
        amountBtc: 0.02,
        phase: "settle",
        mintSbtc: true,
      });
      await refreshBalances();
      toast.success("Simulated BTC settlement complete. sBTC ledger credit added.");
      logClientInfo("fund.ledger.deposit_settle.simulated", {
        address,
        amountBtc: 0.02,
        mintSbtc: true,
      });
    } catch (error) {
      logClientError("fund.ledger.deposit_settle.failed", {
        address,
        message: error instanceof Error ? error.message : "unknown",
      });
      toast.error(error instanceof Error ? error.message : "Unable to settle simulated deposit.");
    } finally {
      setIsSimulatingSettle(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-[980px] px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-3xl font-bold text-[var(--color-heading)]">Add Money To Your Wallet</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-muted)]">
          Use this quick checklist before sending or claiming funds. STX pays network gas; sBTC is the transfer asset used in remittance escrow.
        </p>

        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Connected wallet</p>
          <p className="mt-1 break-all font-mono text-xs text-[var(--color-text)]">{address ?? "Not connected"}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Provider: {walletName ?? "Unknown"} • Stacks-ready: {stacksReady ? "Yes" : "No"}
          </p>
          <div className="mt-3 grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-text-muted)] md:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide">STX gas balance</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">{stxBalanceDisplay} STX</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide">sBTC transfer balance</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">{sbtcBalanceDisplay} sBTC</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide">Network</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">{STACKS_NETWORK}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            {sbtcAssetIdentifier ? `sBTC asset: ${sbtcAssetIdentifier}` : "sBTC asset could not be resolved for this wallet yet."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshBalances()}
              disabled={isLoadingBalances || !stacksReady}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingBalances ? "Refreshing..." : "Refresh Balances"}
            </button>
            <button
              type="button"
              onClick={() => void handleMintSbtcFaucet()}
              disabled={isMintingFaucet || !canUseTestnetFaucet}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-[#0f0f0f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMintingFaucet ? "Minting Test sBTC..." : "Get Test sBTC (Faucet)"}
            </button>
            <button
              type="button"
              onClick={() => void handleDevCreditLedger()}
              disabled={isCreditingLedger || !stacksReady}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreditingLedger ? "Crediting..." : "Add Demo BTC Ledger Credit"}
            </button>
            <button
              type="button"
              onClick={() => void handleSimulatePendingDeposit()}
              disabled={isSimulatingPending || !stacksReady}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSimulatingPending ? "Simulating Pending..." : "Simulate BTC Deposit Pending"}
            </button>
            <button
              type="button"
              onClick={() => void handleSimulateSettleDeposit()}
              disabled={isSimulatingSettle || !stacksReady}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSimulatingSettle ? "Settling..." : "Simulate BTC Settle + sBTC Credit"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-bold text-[var(--color-heading)]">Why STX And sBTC Are Separate</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">STX</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                Used for network gas fees when broadcasting send, claim, and refund transactions.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">sBTC</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                Escrowed and transferred by the remittance contract. This is the asset your sender must hold today.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Product direction: operator-managed balance rails can hide these differences from end-users. The ledger section below is scaffolding for that migration.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-bold text-[var(--color-heading)]">Operator Ledger Scaffold (Backend)</h2>
          {ledgerRows.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-2 py-2">Currency</th>
                    <th className="px-2 py-2">Available</th>
                    <th className="px-2 py-2">Pending</th>
                    <th className="px-2 py-2">Held</th>
                    <th className="px-2 py-2">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--color-border)]">
                      <td className="px-2 py-2 font-semibold text-[var(--color-heading)]">{row.currency}</td>
                      <td className="px-2 py-2 text-[var(--color-text)]">{row.availableBalance}</td>
                      <td className="px-2 py-2 text-[var(--color-text)]">{row.pendingBalance}</td>
                      <td className="px-2 py-2 text-[var(--color-text)]">{row.heldBalance}</td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)]">{new Date(row.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No ledger rows yet. Use the demo credit button above to seed one and validate the API shape.
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 1: Add Bitcoin</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Send BTC to your wallet and wait for confirmation. In production, this should credit your operator ledger automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 2: Wait For Processing</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              In some cases, your deposit needs a short network processing step before it is available for transfers. This is where pending ledger state helps with UX.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 3: Keep A Small Fee Balance</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Keep a small STX balance for network fees so send, claim, and refund actions can complete.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 4: Start Your Transfer</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              When your wallet balance is ready, return to Send and continue.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/send"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[#0f0f0f]"
          >
            Go To Send
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            Back To Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
