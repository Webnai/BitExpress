"use client";

import { useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

const RECIPIENTS = [
  { name: "Kwame Mensah", country: "Ghana", amount: "0.005 BTC" },
  { name: "Aisha Ibrahim", country: "Nigeria", amount: "0.008 BTC" },
  { name: "John Kamau", country: "Kenya", amount: "0.012 BTC" },
  { name: "Amina Kofi", country: "Togo", amount: "0.003 BTC" },
];

const PAY_METHODS = [
  { key: "mobile", title: "Mobile Money", icon: "📱" },
  { key: "bank", title: "Bank Transfer", icon: "🏦" },
  { key: "crypto", title: "Crypto Wallet", icon: "₿" },
] as const;

const RATE_NGN_PER_BTC = 45230500;

export default function SendPage() {
  const [country, setCountry] = useState("Ghana");
  const [phone, setPhone] = useState("+233 24 123 4567");
  const [amountBtc, setAmountBtc] = useState("0.01");
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]["key"]>("crypto");

  const amount = Number.parseFloat(amountBtc) || 0;
  const fee = amount * 0.01;
  const networkFee = 0.00005;
  const total = amount + fee + networkFee;

  const recipientGets = useMemo(() => amount - fee, [amount, fee]);

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="max-w-[1180px] mx-auto px-4 py-8 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-[#e1e8f3] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.05)] md:p-7">
            <h1 className="text-4xl font-bold text-[#132a52]">Send Money</h1>
            <p className="mt-2 text-sm text-[#7f8ea9]">Transfer funds securely across Africa</p>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">Recipient Information</p>

              <div className="mt-3 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="text-[11px] text-[#7f8ea9] block mb-1">Country</label>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CountryFlag country={country as "Ghana" | "Nigeria" | "Kenya" | "Togo"} variant={1} size={20} className="h-5 w-5 rounded-sm object-cover" />
                  </div>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  >
                    <option>Ghana</option>
                    <option>Nigeria</option>
                    <option>Kenya</option>
                    <option>Togo</option>
                  </select>
                  <span className="text-[#8b99b0]">▾</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-[#dbe4f0] bg-[#fbfcff] px-3 py-3">
                <label className="text-[11px] text-[#7f8ea9] block mb-1">Phone Number</label>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#42526b] outline-none"
                  />
                  <span className="text-[#8b99b0]">ⓘ</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">You Send</p>

              <div className="mt-3 rounded-xl border border-[#dbe4f0] bg-[#fbfcff] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <input
                    value={amountBtc}
                    onChange={(e) => setAmountBtc(e.target.value)}
                    className="w-36 bg-transparent text-4xl font-bold text-[#132a52] outline-none"
                  />
                  <div className="rounded-full bg-[#eef2f8] p-1 text-[10px] text-[#5f6f88] font-semibold h-fit">
                    <span className="rounded-full bg-[#ff7448] px-3 py-1 text-white">BTC</span>
                    <span className="px-3 py-1">sBTC</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#ff7448]">Send max available: 0.045 BTC</p>
            </div>

            <div className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6f7d95]">Payment Method</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {PAY_METHODS.map((item) => {
                  const active = method === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMethod(item.key)}
                      className={`rounded-xl border px-4 py-4 text-center transition-colors ${
                        active
                          ? "border-[#ff7448] bg-[#fff6f2]"
                          : "border-[#dfe6f2] bg-white hover:bg-[#fbfcff]"
                      }`}
                    >
                      <p className="text-lg mb-1">{item.icon}</p>
                      <p className={`text-sm font-semibold ${active ? "text-[#ff7448]" : "text-[#42526b]"}`}>
                        {item.title}
                      </p>
                      {active && <p className="text-[10px] text-[#ff7448] mt-1">✓</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-7">
              <h2 className="text-sm font-semibold text-[#132a52]">Recent Recipients</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {RECIPIENTS.map((entry) => (
                  <button key={entry.name} className="rounded-xl bg-[#f6f9fe] px-3 py-3 text-left hover:bg-[#edf3fd]">
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
                        <div className="flex items-center gap-1 text-[11px] text-[#8b99b0]">
                          <CountryFlag country={entry.country as "Ghana" | "Nigeria" | "Kenya" | "Togo"} variant={1} size={14} className="h-3.5 w-3.5 rounded-sm object-cover" />
                          <span>{entry.country}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-[#ff7448]">{entry.amount}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-[#e1e8f3] bg-white p-6 h-fit shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
            <h2 className="text-[1.8rem] font-bold text-[#132a52]">Transaction Summary</h2>

            <div className="mt-6 rounded-xl bg-[#f6f9fe] p-4">
              <p className="text-xs text-[#7f8ea9]">Current Rate</p>
              <p className="mt-1 text-3xl font-bold text-[#132a52]">1 BTC = ₦{RATE_NGN_PER_BTC.toLocaleString()}</p>
              <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                Rate locked for 5:00
              </p>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">You send</span>
                <span className="font-semibold text-[#42526b]">{amount.toFixed(5)} BTC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Recipient gets</span>
                <span className="font-semibold text-[#42526b]">{Math.max(recipientGets, 0).toFixed(5)} BTC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Transaction fee (~1%)</span>
                <span className="font-semibold text-[#42526b]">{fee.toFixed(5)} BTC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#7f8ea9]">Network fee</span>
                <span className="font-semibold text-[#42526b]">{networkFee.toFixed(5)} BTC</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#edf2f8] pt-3">
                <span className="font-semibold text-[#132a52]">Total cost</span>
                <span className="font-bold text-[#132a52]">{total.toFixed(5)} BTC</span>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-[#eef7ff] p-3 text-xs text-[#42526b]">
              ⚡ Arrives in 5-15 minutes
            </div>
            <p className="mt-3 text-xs text-[#7f8ea9]">🛡️ Secured by Bitcoin blockchain</p>

            <div className="mt-5 space-y-2">
              <button className="w-full rounded-xl bg-[#ff7448] px-4 py-3 text-sm font-semibold text-white hover:opacity-95">
                Send Money
              </button>
              <button className="w-full rounded-xl border border-[#ff9c7f] bg-white px-4 py-3 text-sm font-semibold text-[#ff7448]">
                Save as Draft
              </button>
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
