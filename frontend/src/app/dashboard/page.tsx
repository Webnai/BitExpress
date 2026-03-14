import Link from "next/link";
import CountryFlag from "@/components/CountryFlag";

interface HistoryRow {
  date: string;
  txId: string;
  name: string;
  role: "Received" | "Sent";
  amountBtc: string;
  amountUsd: string;
  country: string;
  status: "Completed" | "Pending" | "Failed";
  method: string;
}

const HISTORY_ROWS: HistoryRow[] = [
  {
    date: "Dec 15, 2024 14:32",
    txId: "TX-BTC-458932",
    name: "Kwame Mensah",
    role: "Received",
    amountBtc: "0.011 BTC",
    amountUsd: "$890.50",
    country: "Ghana",
    status: "Completed",
    method: "Mobile Money",
  },
  {
    date: "Dec 15, 2024 11:18",
    txId: "TX-BTC-458911",
    name: "Aisha Ibrahim",
    role: "Sent",
    amountBtc: "0.008 BTC",
    amountUsd: "$544.40",
    country: "Nigeria",
    status: "Completed",
    method: "Bank Transfer",
  },
  {
    date: "Dec 14, 2024 15:45",
    txId: "TX-BTC-458910",
    name: "John Kamau",
    role: "Received",
    amountBtc: "0.012 BTC",
    amountUsd: "$816.60",
    country: "Kenya",
    status: "Pending",
    method: "Mobile Money",
  },
  {
    date: "Dec 14, 2024 09:22",
    txId: "TX-BTC-458905",
    name: "Amina Kofi",
    role: "Sent",
    amountBtc: "0.003 BTC",
    amountUsd: "$204.15",
    country: "Ghana",
    status: "Completed",
    method: "Wallet",
  },
  {
    date: "Dec 13, 2024 20:15",
    txId: "TX-BTC-458899",
    name: "Chidi Okafor",
    role: "Received",
    amountBtc: "0.015 BTC",
    amountUsd: "$1,020.75",
    country: "Nigeria",
    status: "Completed",
    method: "Mobile Money",
  },
  {
    date: "Dec 13, 2024 16:38",
    txId: "TX-BTC-458890",
    name: "Fatima Hassan",
    role: "Sent",
    amountBtc: "0.007 BTC",
    amountUsd: "$476.35",
    country: "South Africa",
    status: "Failed",
    method: "Bank Transfer",
  },
  {
    date: "Dec 12, 2024 19:50",
    txId: "TX-BTC-458881",
    name: "David Mwangi",
    role: "Received",
    amountBtc: "0.009 BTC",
    amountUsd: "$612.45",
    country: "Kenya",
    status: "Completed",
    method: "Wallet",
  },
  {
    date: "Dec 12, 2024 12:05",
    txId: "TX-BTC-458875",
    name: "Grace Nkrumah",
    role: "Sent",
    amountBtc: "0.005 BTC",
    amountUsd: "$340.25",
    country: "Ghana",
    status: "Completed",
    method: "Mobile Money",
  },
];

const STATUS_CLASS: Record<HistoryRow["status"], string> = {
  Completed: "bg-emerald-100 text-emerald-600",
  Pending: "bg-amber-100 text-amber-600",
  Failed: "bg-red-100 text-red-600",
};

const COUNTRY_SHARE = [
  { name: "Nigeria", percent: 35 },
  { name: "Ghana", percent: 28 },
  { name: "Kenya", percent: 22 },
  { name: "South Africa", percent: 10 },
  { name: "Others", percent: 5 },
];

const ACTIVITY = [
  {
    title: "Transfer to Kwame Mensah completed",
    time: "2 min ago",
    amount: "0.001 BTC",
    action: "View Details",
    dot: "bg-emerald-500",
  },
  {
    title: "Received payment from Aisha Ibrahim",
    time: "1 hour ago",
    amount: "0.008 BTC",
    action: "View Details",
    dot: "bg-emerald-500",
  },
  {
    title: "Pending verification for John Kamau",
    time: "3 hours ago",
    amount: "0.012 BTC",
    action: "Track Status",
    dot: "bg-amber-500",
  },
  {
    title: "Withdrawal to mobile money successful",
    time: "5 hours ago",
    amount: "0.003 BTC",
    action: "View Receipt",
    dot: "bg-emerald-500",
  },
];

const CHART_POINTS = [42, 39, 52, 48, 56, 49, 64, 60];

const buildLinePath = (values: number[]) => {
  const width = 320;
  const height = 170;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = width / (values.length - 1);
  return values
    .map((value, i) => {
      const x = i * xStep;
      const normalized = (value - min) / Math.max(max - min, 1);
      const y = height - normalized * (height - 22) - 11;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

export default function DashboardPage() {
  const chartPath = buildLinePath(CHART_POINTS);

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="max-w-[1180px] mx-auto px-4 py-7 md:px-6 md:py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-[#7f8ea9] mb-3">Total Balance</p>
            <p className="text-[2rem] leading-none font-bold text-[#132a52] mb-3">0.0487 BTC</p>
            <p className="text-sm text-[#8b99b0]">≈ $3,312.59 USD</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-600">+5.2% (7d)</span>
              <div className="rounded-full bg-[#eef2f8] p-1 text-[10px] text-[#5f6f88] font-semibold">
                <span className="rounded-full bg-[#ff7448] px-2 py-1 text-white">BTC</span>
                <span className="px-2 py-1">sBTC</span>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-[#7f8ea9] mb-3">Completed Transfers</p>
            <p className="text-[2rem] leading-none font-bold text-[#132a52] mb-3">247</p>
            <p className="text-sm text-[#8b99b0]">This month: 18</p>
            <div className="mt-6 flex justify-end">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff2ec] text-[#ff7448]">↗</span>
            </div>
          </article>

          <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-[#7f8ea9] mb-3">Lifetime Savings</p>
            <p className="text-[2rem] leading-none font-bold text-[#132a52] mb-3">$845.32 USD</p>
            <p className="text-sm text-[#8b99b0]">vs traditional methods</p>
            <span className="mt-4 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-600">
              +$127 this year
            </span>
          </article>
        </section>

        <section className="mt-5 rounded-2xl border border-[#d6e7f5] bg-[#e9f4ff] p-3 md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/send" className="rounded-lg bg-[#ff7448] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95">
                Send New Transfer →
              </Link>
              <button className="rounded-lg border border-[#ff9c7f] bg-white px-4 py-2 text-xs font-semibold text-[#ff7448]">
                ↙ View Detailed Stats
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button className="rounded-md bg-white px-3 py-2 text-[#5f6f88] border border-[#dde6f2]">This Month ▾</button>
              <button className="rounded-md bg-white px-3 py-2 text-[#5f6f88] border border-[#dde6f2]">All Countries ▾</button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[2fr_1.15fr]">
          <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-[1.7rem] font-bold text-[#132a52]">Transaction History</h2>
                <p className="text-sm text-[#8b99b0]">Recent transfers and receipts</p>
              </div>
              <button className="text-xs font-semibold text-[#ff7448]">🔍 Export</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-[#edf2f8] text-left text-[#8392aa]">
                    <th className="py-2 font-semibold">Date/Time</th>
                    <th className="py-2 font-semibold">Transaction ID</th>
                    <th className="py-2 font-semibold">From/To</th>
                    <th className="py-2 font-semibold">Amount</th>
                    <th className="py-2 font-semibold">Country</th>
                    <th className="py-2 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {HISTORY_ROWS.map((row) => (
                    <tr key={row.txId} className="border-b border-[#f1f4fa] last:border-0">
                      <td className="py-3 text-[#5f6f88]">{row.date}</td>
                      <td className="py-3 font-medium text-[#42526b]">{row.txId}</td>
                      <td className="py-3">
                        <p className="font-semibold text-[#132a52]">{row.name}</p>
                        <p className="text-[11px] text-[#8b99b0]">{row.role}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-semibold text-[#132a52]">{row.amountBtc}</p>
                        <p className="text-[11px] text-[#8b99b0]">{row.amountUsd}</p>
                      </td>
                      <td className="py-3 text-[#42526b]">
                        <div className="flex items-center gap-1.5">
                          {row.country === "Ghana" || row.country === "Nigeria" || row.country === "Kenya" || row.country === "Togo" ? (
                            <CountryFlag country={row.country} variant={1} size={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
                          ) : null}
                          <span>{row.country}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASS[row.status]}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 text-[#5f6f88]">{row.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#8b99b0]">
              <p>Showing 1-10 of 247 transactions</p>
              <div className="flex items-center gap-1">
                <button className="h-6 w-6 rounded-md border border-[#dce4ef] text-[#9aa8bd]">‹</button>
                <button className="h-6 w-6 rounded-md bg-[#ff7448] text-white">1</button>
                <button className="h-6 w-6 rounded-md border border-[#dce4ef] text-[#7f8ea9]">2</button>
                <button className="h-6 w-6 rounded-md border border-[#dce4ef] text-[#7f8ea9]">3</button>
                <button className="h-6 w-6 rounded-md border border-[#dce4ef] text-[#9aa8bd]">›</button>
              </div>
            </div>
          </article>

          <div className="space-y-5">
            <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-[#132a52]">Transaction Volume</h3>
                <div className="flex items-center gap-1 text-[10px]">
                  <button className="rounded bg-[#ff7448] px-2 py-1 text-white">7D</button>
                  <button className="rounded bg-[#eef2f8] px-2 py-1 text-[#7f8ea9]">1M</button>
                  <button className="rounded bg-[#eef2f8] px-2 py-1 text-[#7f8ea9]">3M</button>
                  <button className="rounded bg-[#eef2f8] px-2 py-1 text-[#7f8ea9]">1Y</button>
                </div>
              </div>

              <div className="h-[215px] rounded-xl border border-[#edf2f8] p-3">
                <svg viewBox="0 0 320 170" className="h-full w-full" role="img" aria-label="transaction volume chart">
                  {[0, 1, 2, 3, 4].map((line) => (
                    <line
                      key={`h-${line}`}
                      x1="0"
                      y1={line * 42.5}
                      x2="320"
                      y2={line * 42.5}
                      stroke="#e9eef6"
                      strokeDasharray="3 3"
                    />
                  ))}
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => (
                    <line
                      key={`v-${line}`}
                      x1={line * 45.7}
                      y1="0"
                      x2={line * 45.7}
                      y2="170"
                      stroke="#eef2f8"
                      strokeDasharray="3 3"
                    />
                  ))}
                  <path d={chartPath} fill="none" stroke="#ff7448" strokeWidth="3" strokeLinecap="round" />
                  {CHART_POINTS.map((value, index) => {
                    const min = Math.min(...CHART_POINTS);
                    const max = Math.max(...CHART_POINTS);
                    const x = (320 / (CHART_POINTS.length - 1)) * index;
                    const y = 170 - ((value - min) / Math.max(max - min, 1)) * (170 - 22) - 11;
                    return <circle key={`dot-${value}-${index}`} cx={x} cy={y} r="3" fill="#ff7448" />;
                  })}
                </svg>
              </div>
            </article>

            <article className="rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <h3 className="text-xl font-bold text-[#132a52] mb-4">Top Countries</h3>
              <div className="space-y-3">
                {COUNTRY_SHARE.map((country) => (
                  <div key={country.name}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[#5f6f88]">
                      <span className="flex items-center gap-1.5">
                        {country.name === "Ghana" || country.name === "Nigeria" || country.name === "Kenya" || country.name === "Togo" ? (
                          <CountryFlag country={country.name} variant={1} size={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
                        ) : null}
                        <span>{country.name}</span>
                      </span>
                      <span>{country.percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf2f8]">
                      <div
                        className="h-2 rounded-full bg-[#ff7448]"
                        style={{ width: `${country.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-[#e1e8f3] bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#132a52]">Recent Activity</h3>
            <button className="text-xs font-semibold text-[#ff7448]">View All</button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {ACTIVITY.map((activity) => (
              <div key={activity.title} className="rounded-xl bg-[#f6f9fe] p-3">
                <div className="mb-2 flex items-start gap-2">
                  <span className={`mt-1 inline-flex h-2 w-2 rounded-full ${activity.dot}`} />
                  <p className="text-xs font-medium text-[#42526b]">{activity.title}</p>
                </div>
                <p className="text-[11px] text-[#8b99b0] mb-2">{activity.time}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#ff7448]">{activity.amount}</span>
                  <button className="text-[10px] font-semibold text-[#4d78d0]">{activity.action}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="bg-[#0f2b57] px-4 py-12 text-white">
        <div className="max-w-[1180px] mx-auto grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <p className="text-2xl font-bold mb-3">₿ AfriSend</p>
            <p className="text-white/80">Send money across Africa instantly with Bitcoin-powered remittance.</p>
          </div>
          <div>
            <p className="font-semibold mb-3">Product</p>
            <p className="text-white/80 mb-2">How it Works</p>
            <p className="text-white/80 mb-2">Pricing</p>
            <p className="text-white/80">Countries</p>
          </div>
          <div>
            <p className="font-semibold mb-3">Company</p>
            <p className="text-white/80 mb-2">About</p>
            <p className="text-white/80 mb-2">Blog</p>
            <p className="text-white/80">Careers</p>
          </div>
          <div>
            <p className="font-semibold mb-3">Support</p>
            <p className="text-white/80 mb-2">Help Center</p>
            <p className="text-white/80 mb-2">Contact</p>
            <p className="text-white/80">FAQ</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
