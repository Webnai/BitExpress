"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import CountryFlag from "@/components/CountryFlag";
import { useWallet } from "@/components/WalletProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetWalletBalance, apiGetWalletHistory } from "@/lib/api";

type WalletHistoryEntry = {
  id: string;
  direction: "sent" | "received";
  counterpartyWallet: string;
  counterpartyName?: string;
  amountUsd: number;
  fee: number;
  netAmount: number;
  countryCode: string;
  countryName?: string;
  payoutMethod: string;
  status: string;
  stacksTxId?: string;
  createdAt: string;
  claimedAt?: string;
  mobileMoneyRef?: string;
};

const STATUS_CLASS: Record<string, string> = {
  claimed: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  pending: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  refunded: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  failed: "bg-red-100 text-red-700 hover:bg-red-100",
};

const SUPPORTED_FLAG_NAMES = new Set(["Ghana", "Nigeria", "Kenya", "Togo"]);

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStx(microStx: string | null) {
  if (!microStx) return "--";
  const value = Number(microStx) / 1_000_000;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} STX`;
}

function formatStatus(status: string) {
  switch (status) {
    case "claimed":
      return "Completed";
    case "pending":
      return "Pending";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatMethod(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortValue(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function relativeTime(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function buildLinePath(values: number[]) {
  if (values.length < 2) return "";
  const width = 320;
  const height = 170;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * xStep;
      const normalized = (value - min) / Math.max(max - min, 1);
      const y = height - normalized * (height - 22) - 11;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function DashboardPage() {
  const { address, displayAddress, walletName } = useWallet();
  const [balanceMicroStx, setBalanceMicroStx] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!address) {
        setTransactions([]);
        setBalanceMicroStx(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [balance, history] = await Promise.all([
          apiGetWalletBalance(address),
          apiGetWalletHistory(address),
        ]);

        if (cancelled) return;

        setBalanceMicroStx(balance.stx.balance);
        setTransactions(
          [...history.sent, ...history.received].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const completedTransfers = useMemo(
    () => transactions.filter((item) => item.status === "claimed").length,
    [transactions],
  );

  const totalVolumeUsd = useMemo(
    () => transactions.reduce((sum, item) => sum + item.amountUsd, 0),
    [transactions],
  );

  const pendingTransfers = useMemo(
    () => transactions.filter((item) => item.status === "pending").length,
    [transactions],
  );

  const topCountries = useMemo(() => {
    if (!transactions.length) return [] as Array<{ name: string; percent: number; amount: number }>;

    const totals = new Map<string, number>();
    for (const item of transactions) {
      const name = item.countryName || item.countryCode;
      totals.set(name, (totals.get(name) ?? 0) + item.amountUsd);
    }

    const grandTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(totals.entries())
      .map(([name, amount]) => ({
        name,
        amount,
        percent: grandTotal ? Math.round((amount / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

  const chartValues = useMemo(() => {
    return transactions
      .slice(0, 7)
      .map((item) => item.amountUsd)
      .reverse();
  }, [transactions]);

  const chartPath = useMemo(() => buildLinePath(chartValues), [chartValues]);

  const recentActivity = useMemo(() => transactions.slice(0, 4), [transactions]);
  const recentTransactions = useMemo(() => transactions.slice(0, 10), [transactions]);

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="mx-auto max-w-[1180px] px-4 py-7 md:px-6 md:py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-normal text-[#7f8ea9]">Wallet Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-1 text-[2rem] font-bold leading-none text-[#132a52]">
                {isLoading ? "Loading..." : formatStx(balanceMicroStx)}
              </p>
              <p className="mb-4 text-sm text-[#8b99b0]">
                {walletName ? `${walletName} • ${displayAddress ?? "--"}` : displayAddress ?? "Wallet not connected"}
              </p>
              <Badge className="bg-[#eef2f8] text-[#5f6f88] hover:bg-[#eef2f8]">On-chain balance</Badge>
            </CardContent>
          </Card>

          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-normal text-[#7f8ea9]">Transfers In Database</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-1 text-[2rem] font-bold leading-none text-[#132a52]">{transactions.length}</p>
              <p className="mb-4 text-sm text-[#8b99b0]">Completed: {completedTransfers}</p>
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Pending: {pendingTransfers}
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-normal text-[#7f8ea9]">Total Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-1 text-[2rem] font-bold leading-none text-[#132a52]">{formatUsd(totalVolumeUsd)}</p>
              <p className="mb-4 text-sm text-[#8b99b0]">Derived from wallet history stored in DB</p>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                Live wallet + backend data
              </Badge>
            </CardContent>
          </Card>
        </section>

        <section className="mt-5 rounded-2xl border border-[#d6e7f5] bg-[#e9f4ff] p-3 md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/send" className="rounded-lg bg-[#ff7448] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95">
                Send New Transfer →
              </Link>
              <Link href="/receive" className="rounded-lg border border-[#ff9c7f] bg-white px-4 py-2 text-xs font-semibold text-[#ff7448]">
                Claim Incoming Funds
              </Link>
            </div>
            <div className="text-xs text-[#5f6f88]">
              {address ? `Connected wallet: ${displayAddress}` : "Connect a wallet to view dashboard data."}
            </div>
          </div>
        </section>

        {error ? (
          <Card className="mt-5 border-red-200 bg-red-50 shadow-none">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        <section className="mt-5 grid gap-5 xl:grid-cols-[2fr_1.15fr]">
          <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-[1.7rem] font-bold text-[#132a52]">Transaction History</CardTitle>
                  <p className="text-sm text-[#8b99b0]">Backed by your wallet address and backend records</p>
                </div>
              </div>
            </CardHeader>
            <Separator className="bg-[#edf2f8]" />
            <CardContent className="overflow-x-auto pt-0">
              {!isLoading && recentTransactions.length === 0 ? (
                <div className="py-8 text-sm text-[#8b99b0]">No transfers found for this wallet yet.</div>
              ) : (
                <Table className="min-w-[900px] text-xs">
                  <TableHeader>
                    <TableRow className="border-[#edf2f8] hover:bg-transparent">
                      <TableHead className="text-[#8392aa] font-semibold">Date/Time</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Transaction ID</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Direction</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Amount</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Country</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Status</TableHead>
                      <TableHead className="text-[#8392aa] font-semibold">Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((row) => {
                      const countryName = row.countryName || row.countryCode;
                      const displayName = row.counterpartyName || shortValue(row.counterpartyWallet);
                      const badgeClass = STATUS_CLASS[row.status] || "bg-slate-100 text-slate-700 hover:bg-slate-100";
                      return (
                        <TableRow key={row.id} className="border-[#f1f4fa] hover:bg-[#fafbfe]">
                          <TableCell className="text-[#5f6f88]">
                            {new Date(row.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium text-[#42526b]">{shortValue(row.id)}</TableCell>
                          <TableCell>
                            <p className="font-semibold text-[#132a52]">{displayName}</p>
                            <p className="text-[11px] capitalize text-[#8b99b0]">{row.direction}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-semibold text-[#132a52]">{formatUsd(row.amountUsd)}</p>
                            <p className="text-[11px] text-[#8b99b0]">Fee {formatUsd(row.fee)}</p>
                          </TableCell>
                          <TableCell className="text-[#42526b]">
                            <div className="flex items-center gap-1.5">
                              {SUPPORTED_FLAG_NAMES.has(countryName) ? (
                                <CountryFlag
                                  country={countryName as "Ghana" | "Nigeria" | "Kenya" | "Togo"}
                                  variant={1}
                                  size={14}
                                  className="h-3.5 w-3.5 rounded-sm object-cover"
                                />
                              ) : null}
                              <span>{countryName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={badgeClass}>{formatStatus(row.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-[#5f6f88]">{formatMethod(row.payoutMethod)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-[#132a52]">Transfer Volume</CardTitle>
              </CardHeader>
              <CardContent>
                {chartValues.length >= 2 ? (
                  <div className="h-[215px] rounded-xl border border-[#edf2f8] p-3">
                    <svg viewBox="0 0 320 170" className="h-full w-full" role="img" aria-label="transfer volume chart">
                      {[0, 1, 2, 3, 4].map((line) => (
                        <line key={`h-${line}`} x1="0" y1={line * 42.5} x2="320" y2={line * 42.5} stroke="#e9eef6" strokeDasharray="3 3" />
                      ))}
                      {chartValues.map((_, line) => (
                        <line
                          key={`v-${line}`}
                          x1={(320 / Math.max(chartValues.length - 1, 1)) * line}
                          y1="0"
                          x2={(320 / Math.max(chartValues.length - 1, 1)) * line}
                          y2="170"
                          stroke="#eef2f8"
                          strokeDasharray="3 3"
                        />
                      ))}
                      <path d={chartPath} fill="none" stroke="#ff7448" strokeWidth="3" strokeLinecap="round" />
                      {chartValues.map((value, index) => {
                        const min = Math.min(...chartValues);
                        const max = Math.max(...chartValues);
                        const x = (320 / Math.max(chartValues.length - 1, 1)) * index;
                        const y = 170 - ((value - min) / Math.max(max - min, 1)) * (170 - 22) - 11;
                        return <circle key={`${value}-${index}`} cx={x} cy={y} r="3" fill="#ff7448" />;
                      })}
                    </svg>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#edf2f8] p-6 text-sm text-[#8b99b0]">
                    At least two transfers are needed to render the chart.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-[#132a52]">Top Countries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topCountries.length ? (
                  topCountries.map((country) => (
                    <div key={country.name}>
                      <div className="mb-1 flex items-center justify-between text-xs text-[#5f6f88]">
                        <span className="flex items-center gap-1.5">
                          {SUPPORTED_FLAG_NAMES.has(country.name) ? (
                            <CountryFlag
                              country={country.name as "Ghana" | "Nigeria" | "Kenya" | "Togo"}
                              variant={1}
                              size={14}
                              className="h-3.5 w-3.5 rounded-sm object-cover"
                            />
                          ) : null}
                          <span>{country.name}</span>
                        </span>
                        <span>{country.percent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#edf2f8]">
                        <div className="h-2 rounded-full bg-[#ff7448]" style={{ width: `${country.percent}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#8b99b0]">No country distribution available yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="mt-5 border-[#e1e8f3] shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold text-[#132a52]">Recent Activity</CardTitle>
          </CardHeader>
          <Separator className="bg-[#edf2f8]" />
          <CardContent className="pt-4">
            {recentActivity.length ? (
              <div className="grid gap-3 md:grid-cols-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-xl bg-[#f6f9fe] p-3">
                    <div className="mb-2 flex items-start gap-2">
                      <span
                        className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${
                          activity.status === "claimed"
                            ? "bg-emerald-500"
                            : activity.status === "pending"
                              ? "bg-amber-500"
                              : "bg-slate-500"
                        }`}
                      />
                      <p className="text-xs font-medium text-[#42526b]">
                        {activity.direction === "sent" ? "Sent to" : "Received from"} {activity.counterpartyName || shortValue(activity.counterpartyWallet)}
                      </p>
                    </div>
                    <p className="mb-2 text-[11px] text-[#8b99b0]">{relativeTime(activity.createdAt)}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#ff7448]">{formatUsd(activity.amountUsd)}</span>
                      <span className="text-[10px] font-semibold text-[#4d78d0]">{formatStatus(activity.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#8b99b0]">No recent activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
