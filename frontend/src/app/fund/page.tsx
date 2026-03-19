"use client";

import Link from "next/link";

import { useWallet } from "@/components/WalletProvider";

function isStacksWalletAddress(value: string): boolean {
  return /^(SP|ST|SM|SN)[A-Z0-9]+$/.test(value);
}

export default function FundGuidePage() {
  const { address, walletName } = useWallet();
  const stacksReady = Boolean(address && isStacksWalletAddress(address));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-[980px] px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-3xl font-bold text-[var(--color-heading)]">Add Money To Your Wallet</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-muted)]">
          Use this quick checklist before sending or claiming funds.
        </p>

        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Connected wallet</p>
          <p className="mt-1 break-all font-mono text-xs text-[var(--color-text)]">{address ?? "Not connected"}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Provider: {walletName ?? "Unknown"} • Stacks-ready: {stacksReady ? "Yes" : "No"}
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 1: Add Bitcoin</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Send BTC to your wallet and wait for confirmation.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 2: Wait For Processing</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              In some cases, your deposit needs a short network processing step before it is available for transfers.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">Step 3: Keep A Small Fee Balance</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Keep a small balance for network fees so send, claim, and refund actions can complete.
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
