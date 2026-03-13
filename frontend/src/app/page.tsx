import Link from "next/link";

const FEATURES = [
  {
    icon: "⚡",
    title: "Near-Instant Settlement",
    description:
      "Transactions settle in minutes using Stacks Layer-2, secured by Bitcoin's blockchain.",
  },
  {
    icon: "💸",
    title: "~1% Fees",
    description:
      "Pay only 0.5–1.5% per transfer — up to 10× cheaper than Western Union or MoneyGram.",
  },
  {
    icon: "📱",
    title: "Mobile Money Ready",
    description:
      "Seamless cash-out to MTN MoMo, M-Pesa, Flutterwave, and Moov Money.",
  },
  {
    icon: "🔒",
    title: "Bitcoin-Secured",
    description:
      "Every sBTC is backed 1:1 by BTC. Funds are protected by Bitcoin's security.",
  },
  {
    icon: "🌍",
    title: "Pan-African Coverage",
    description:
      "Send money between Ghana, Nigeria, Kenya, Togo, Senegal, Tanzania, and Uganda.",
  },
  {
    icon: "🛡️",
    title: "Escrow Protection",
    description:
      "Smart contract escrow ensures funds are only released when the receiver claims.",
  },
];

const ROUTES = [
  { from: "🇬🇭 Ghana", to: "🇳🇬 Nigeria", fee: "1%", time: "~3 min" },
  { from: "🇬🇭 Ghana", to: "🇰🇪 Kenya", fee: "1%", time: "~3 min" },
  { from: "🇬🇭 Ghana", to: "🇹🇬 Togo", fee: "1%", time: "~3 min" },
  { from: "🇰🇪 Kenya", to: "🇳🇬 Nigeria", fee: "1%", time: "~3 min" },
];

const STEPS = [
  { step: "1", title: "Connect Wallet", desc: "Link your Leather or Xverse wallet with one click." },
  { step: "2", title: "Enter Details", desc: "Enter recipient address, amount, and destination country." },
  { step: "3", title: "Send sBTC", desc: "Sign the transaction — funds go into escrow on Stacks." },
  { step: "4", title: "Recipient Claims", desc: "Receiver claims payment and withdraws to mobile money." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section
        className="relative overflow-hidden px-4 pt-20 pb-24 text-center"
        style={{
          background:
            "radial-gradient(ellipse at center top, rgba(249,115,22,0.15) 0%, transparent 60%)",
        }}
      >
        <div className="max-w-4xl mx-auto">
          <div
            className="inline-block px-4 py-1 rounded-full text-sm font-medium mb-6"
            style={{
              background: "rgba(249,115,22,0.1)",
              border: "1px solid rgba(249,115,22,0.3)",
              color: "#f97316",
            }}
          >
            ₿ Powered by Stacks + sBTC
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Send Money Across Africa{" "}
            <span className="gradient-text">Instantly</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Bitcoin-secured cross-border remittances with{" "}
            <strong className="text-orange-400">~1% fees</strong>.
            Compare that to 7–10% at Western Union or MoneyGram.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/send">
              <button className="btn-primary text-lg px-8 py-4 w-full sm:w-auto">
                Send Money Now →
              </button>
            </Link>
            <Link href="/dashboard">
              <button
                className="text-lg px-8 py-4 rounded-xl font-semibold w-full sm:w-auto transition-colors"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f0f0",
                }}
              >
                View Dashboard
              </button>
            </Link>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {[
              { value: "~1%", label: "Avg Fee" },
              { value: "3 min", label: "Settlement" },
              { value: "7", label: "Countries" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold gradient-text">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Why <span className="gradient-text">BitExpress</span>?
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            Built on Stacks Layer-2, secured by Bitcoin — the most trusted
            blockchain in the world.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="card p-6 hover:border-orange-500/40 transition-colors"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Routes */}
      <section className="px-4 py-16" style={{ background: "rgba(26,26,46,0.5)" }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Supported <span className="gradient-text">Routes</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ROUTES.map((route) => (
              <div
                key={`${route.from}-${route.to}`}
                className="card p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{route.from}</span>
                  <span className="text-orange-400">→</span>
                  <span className="text-lg">{route.to}</span>
                </div>
                <div className="text-right">
                  <div className="text-green-400 text-sm font-semibold">{route.fee}</div>
                  <div className="text-gray-500 text-xs">{route.time}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-4">
            + More routes: Senegal, Tanzania, Uganda
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            How It <span className="gradient-text">Works</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-4"
                  style={{ background: "linear-gradient(135deg, #f97316, #f59e0b)" }}
                >
                  {s.step}
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-gray-400 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="px-4 py-16" style={{ background: "rgba(26,26,46,0.5)" }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">
            System <span className="gradient-text">Architecture</span>
          </h2>
          <div className="card p-8 text-sm font-mono text-left">
            <div className="space-y-2 text-gray-300">
              <div className="text-orange-400">User A (Ghana)</div>
              <div className="ml-3">│ send BTC</div>
              <div className="ml-3">▼</div>
              <div className="text-yellow-400 ml-3">BTC → sBTC bridge</div>
              <div className="ml-3">│</div>
              <div className="ml-3">▼</div>
              <div className="text-blue-400 ml-3">Stacks Smart Contract (Clarity)</div>
              <div className="ml-3">│</div>
              <div className="ml-3">▼</div>
              <div className="text-purple-400 ml-3">Receiver Wallet</div>
              <div className="ml-3">│</div>
              <div className="ml-3">▼</div>
              <div className="text-green-400 ml-3">Local off-ramp partner</div>
              <div className="ml-3">│</div>
              <div className="ml-3">▼</div>
              <div className="text-emerald-400 ml-3">Mobile Money / Bank (Nigeria)</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold mb-4">
            Ready to <span className="gradient-text">Send?</span>
          </h2>
          <p className="text-gray-400 mb-8">
            Join the future of African cross-border payments. Low fees, fast
            settlement, Bitcoin secured.
          </p>
          <Link href="/send">
            <button className="btn-primary text-lg px-10 py-4">
              Get Started — Send Money Now →
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-4 py-8 text-center text-gray-600 text-sm"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <p>
          BitExpress — Bitcoin Remittance Infrastructure for Africa |{" "}
          <span className="gradient-text">Built on Stacks + sBTC</span>
        </p>
      </footer>
    </div>
  );
}
