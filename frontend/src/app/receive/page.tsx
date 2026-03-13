import Link from "next/link";

const SUMMARY_ITEMS = [
  { label: "Original Amount", value: "0.0105 BTC" },
  { label: "Network Fee (Paid by sender)", value: "0.0005 BTC" },
  { label: "Processing Status", value: "Ready to Claim" },
];

const DETAIL_ITEMS = [
  { label: "Transaction ID", value: "TX-BTC-458932", icon: "📋" },
  { label: "Date & Time", value: "Dec 15, 2024 at 14:32 GMT", icon: "◷" },
  { label: "Network", value: "Bitcoin Mainnet", icon: "◉" },
  { label: "Confirmations", value: "6/6 Confirmed", icon: "●" },
  { label: "Transaction Fee", value: "0.0005 BTC", icon: "ⓘ" },
  { label: "Status", value: "Ready to Claim", icon: "•" },
];

const WITHDRAWAL_METHODS = [
  {
    icon: "📲",
    title: "Withdraw to Mobile Money",
    desc: "MTN MoMo, Flutterwave, M-Pesa, Moov Money",
    chip: "Instant",
    chipClass: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: "🏦",
    title: "Convert to Local Currency",
    desc: "View current exchange rates",
    chip: "1-2 days",
    chipClass: "bg-blue-100 text-blue-600",
  },
  {
    icon: "🧱",
    title: "Save in BTC Wallet",
    desc: "Earn potential returns",
    chip: "Secure",
    chipClass: "bg-orange-100 text-orange-600",
  },
];

const RECENT_RECEIVES = [
  { name: "Kwame Mensah", amount: "0.005 BTC", time: "2 hours ago" },
  { name: "Aisha Ibrahim", amount: "0.008 BTC", time: "1 day ago" },
  { name: "John Kamau", amount: "0.012 BTC", time: "3 days ago" },
  { name: "Amina Kofi", amount: "0.003 BTC", time: "5 days ago" },
];

export default function ReceivePage() {
  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="max-w-[1180px] mx-auto px-4 py-8 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-[#e1e8f3] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.05)] md:p-7">
            <h1 className="text-5xl md:text-4xl font-bold text-[#132a52]">Receive Money</h1>
            <p className="mt-2 text-sm text-[#7f8ea9]">Claim your incoming Bitcoin transfer</p>

            <div className="mt-6 rounded-xl border border-[#b7ebd4] bg-[#daf6e9] px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-600">✅ Payment Received Successfully</p>
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold text-white">Verified</span>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">From</p>
              <div className="mt-2 rounded-xl bg-[#f1f4f8] px-4 py-3 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#8aa4d3] to-[#4d78d0] grid place-items-center text-white font-bold">
                  KM
                </div>
                <div>
                  <p className="font-semibold text-[#132a52]">Kwame Mensah ✓</p>
                  <p className="text-xs text-[#7f8ea9]">🇬🇭 Ghana</p>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border-2 border-[#ff7448] bg-white p-4">
              <p className="text-xs text-[#7f8ea9]">Amount Received</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-5xl font-bold text-[#132a52]">0.01</p>
                  <p className="mt-2 text-sm font-semibold text-emerald-600">≈ $680.50 USD</p>
                </div>
                <div className="rounded-full bg-[#eef2f8] p-1 text-[10px] text-[#5f6f88] font-semibold h-fit">
                  <span className="rounded-full bg-[#ff7448] px-3 py-1 text-white">BTC</span>
                  <span className="px-3 py-1">sBTC</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {DETAIL_ITEMS.map((item) => (
                <div key={item.label} className="rounded-lg bg-[#f7f9fd] px-3 py-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-[#7f8ea9]">
                    <span>{item.label}</span>
                    <span>{item.icon}</span>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      item.label === "Confirmations"
                        ? "text-emerald-600"
                        : item.label === "Status"
                          ? "text-[#132a52]"
                          : "text-[#42526b]"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-7">
              <h2 className="text-xl font-bold text-[#132a52]">Choose Withdrawal Method</h2>
              <div className="mt-3 space-y-2">
                {WITHDRAWAL_METHODS.map((method) => (
                  <button
                    key={method.title}
                    className="w-full rounded-xl border border-[#dfe6f2] bg-white px-4 py-4 text-left hover:bg-[#fbfcff]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 text-lg">{method.icon}</span>
                        <div>
                          <p className="font-semibold text-[#132a52]">{method.title}</p>
                          <p className="text-xs text-[#7f8ea9] mt-1">{method.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${method.chipClass}`}>
                          {method.chip}
                        </span>
                        <span className="text-[#8b99b0]">›</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-7">
              <h2 className="text-sm font-semibold text-[#132a52]">Recent Receives</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {RECENT_RECEIVES.map((entry) => (
                  <div key={entry.name} className="rounded-xl bg-[#f6f9fe] px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#8aa4d3] to-[#4d78d0] grid place-items-center text-[11px] text-white font-bold">
                        {entry.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#132a52]">{entry.name}</p>
                        <p className="text-[11px] font-semibold text-[#ff7448]">{entry.amount}</p>
                        <p className="text-[11px] text-[#8b99b0]">{entry.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-[#e1e8f3] bg-white p-6 h-fit shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
            <h2 className="text-3xl text-[1.8rem] font-bold text-[#132a52]">Claim Summary</h2>
            <p className="mt-2 text-xs text-emerald-600 font-semibold">✅ Blockchain Verified</p>

            <div className="mt-6 rounded-xl bg-[#f6f9fe] p-4">
              <p className="text-xs text-[#7f8ea9]">Available to Claim</p>
              <p className="mt-1 text-4xl font-bold text-[#132a52]">0.01 BTC</p>
              <p className="mt-1 text-sm text-[#7f8ea9]">$680.50 USD</p>
              <p className="mt-2 text-xs font-semibold text-emerald-600">▼ +2.3% (24h)</p>
            </div>

            <div className="mt-6 space-y-2">
              {SUMMARY_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center justify-between border-b border-[#edf2f8] pb-2 text-sm">
                  <span className="text-[#7f8ea9]">{item.label}</span>
                  <span className="font-semibold text-[#42526b]">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-bold text-[#132a52] mb-3">You Receive</h3>
              <div className="rounded-xl bg-[#f6f9fe] p-3 text-xs text-[#6f7d95]">
                ⚡ Choose how to receive your funds. Mobile money arrives instantly.
              </div>

              <ul className="mt-4 space-y-2 text-sm text-[#5f6f88]">
                <li>✓ Blockchain verified transaction</li>
                <li>✓ Funds held in secure escrow</li>
                <li>✓ Instant withdrawal available</li>
              </ul>

              <div className="mt-5 space-y-2">
                <button className="w-full rounded-xl bg-[#ff7448] px-4 py-3 text-sm font-semibold text-white hover:opacity-95">
                  Claim Funds Now
                </button>
                <Link
                  href="/dashboard"
                  className="block w-full rounded-xl border border-[#ff9c7f] bg-white px-4 py-3 text-center text-sm font-semibold text-[#ff7448]"
                >
                  View Transaction
                </Link>
              </div>

              <p className="mt-4 text-xs text-[#8b99b0]">ⓘ Need help? Contact support</p>
            </div>
          </aside>
        </div>
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
