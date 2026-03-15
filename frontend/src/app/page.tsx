import Link from "next/link";
import Image from "next/image";
import CountryFlag from "@/components/CountryFlag";

const FEATURES = [
  {
    icon: "⚡",
    title: "Instant Settlement",
    description:
      "Money arrives in minutes, not days. Real-time settlement powered by the Bitcoin network.",
  },
  {
    icon: "₿",
    title: "Bitcoin-Secured",
    description:
      "Transparent and immutable transfer records protected by Bitcoin finality.",
  },
  {
    icon: "📱",
    title: "Mobile Money Ready",
    description:
      "Direct integration with MTN Mobile Money, M-Pesa, and trusted local rails.",
  },
  {
    icon: "🌍",
    title: "Pan-African Coverage",
    description:
      "Send money across Ghana, Nigeria, Kenya, Togo, and more African corridors.",
  },
];

const STEPS = [
  { step: "1", title: "Connect Your Wallet", desc: "Connect a Stacks wallet (Leather or Xverse) and load it with USDCx tokens." },
  { step: "2", title: "Send via Smart Contract", desc: "Enter recipient details and confirm the escrow transaction directly from your wallet." },
  { step: "3", title: "Receiver Claims & Cashes Out", desc: "The receiver enters the claim secret, releases funds on-chain, and withdraws to mobile money or a bank." },
];

const COUNTRIES = [
  { name: "Ghana" as const, methods: ["Mobile Money", "Bank Transfer"] },
  { name: "Nigeria" as const, methods: ["Mobile Money", "Bank Transfer"] },
  { name: "Kenya" as const, methods: ["M-Pesa", "Bank Transfer"] },
  { name: "Togo" as const, methods: ["Mobile Money", "Bank Transfer"] },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen landing-page">
      <section className="px-4 pt-14 pb-16 md:pt-18 md:pb-20 landing-hero-bg">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold mb-5 landing-badge">
              Bitcoin-powered remittance rail
            </p>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight text-[var(--color-heading)]">
              Send Money Across Africa Instantly with Bitcoin
            </h1>
            <p className="text-lg md:text-xl text-[var(--color-text-muted)] mt-5 mb-8 max-w-xl">
              Pay as low as 1% in fees and deliver in minutes, not days.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/send">
                <button className="btn-primary text-base px-7 py-3 w-full sm:w-auto">
                  Get Started →
                </button>
              </Link>
              <Link href="/dashboard">
                <button className="btn-secondary text-base px-7 py-3 w-full sm:w-auto">
                  See How It Works
                </button>
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="landing-hero-frame p-4 md:p-5">
              <Image
                src="/image 1.png"
                alt="BitExpress mobile app preview"
                width={1100}
                height={800}
                priority
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-5 landing-trust-band">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-3 text-center text-sm font-medium text-[var(--color-text-muted)]">
          <span>Prototype live on Stacks testnet with wallet-based send, claim, and refund flows</span>
          <div className="flex items-center gap-2">
            <CountryFlag country="Ghana" variant={2} size={24} className="h-6 w-6 rounded-sm object-cover" />
            <CountryFlag country="Nigeria" variant={2} size={24} className="h-6 w-6 rounded-sm object-cover" />
            <CountryFlag country="Kenya" variant={2} size={24} className="h-6 w-6 rounded-sm object-cover" />
            <CountryFlag country="Togo" variant={2} size={24} className="h-6 w-6 rounded-sm object-cover" />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center text-[var(--color-heading)] mb-10">
            Stop Overpaying for Remittances
          </h2>
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-5 items-center">
            <div className="landing-rate-card landing-rate-card-old text-center p-8">
              <p className="font-semibold text-[var(--color-text-muted)] mb-4">Traditional Services</p>
              <p className="text-5xl font-extrabold text-[var(--color-danger-500)]">7-10%</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-4">$70-$100 in fees per $1000</p>
            </div>
            <div className="hidden md:block text-5xl font-bold text-[var(--color-primary)]">→</div>
            <div className="landing-rate-card landing-rate-card-new text-center p-8">
              <p className="font-semibold text-[var(--color-text-muted)] mb-4">BitExpress</p>
              <p className="text-5xl font-extrabold text-[var(--color-success-600)]">0.5-1.5%</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-4">$5-$15 in fees per $1000</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 landing-section-muted">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="landing-feature-card p-6">
              <div className="text-2xl mb-4 w-10 h-10 rounded-lg flex items-center justify-center landing-feature-icon">
                {feature.icon}
              </div>
              <h3 className="font-bold text-xl text-[var(--color-heading)] mb-2">{feature.title}</h3>
              <p className="text-sm leading-6 text-[var(--color-text-muted)]">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-18">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center text-[var(--color-heading)] mb-14">
            Send Money in 3 Simple Steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center relative">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-5 bg-[var(--color-primary)]">
                  {s.step}
                </div>
                <h3 className="font-bold text-xl text-[var(--color-heading)] mb-2">{s.title}</h3>
                <p className="text-[var(--color-text-muted)] text-sm leading-6">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 landing-section-muted">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center text-[var(--color-heading)] mb-12">
            Available Across Africa
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {COUNTRIES.map((country) => (
              <div key={country.name} className="landing-country-card p-6 text-center">
                <div className="mb-4 flex justify-center">
                  <CountryFlag country={country.name} variant={1} size={72} className="h-[72px] w-[72px] object-contain" />
                </div>
                <h3 className="text-xl font-bold text-[var(--color-heading)] mb-3">{country.name}</h3>
                <div className="space-y-1">
                  {country.methods.map((method) => (
                    <p key={method} className="text-sm text-[var(--color-text-muted)]">📱 {method}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-18" style={{ background: "var(--color-primary)" }}>
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Start Sending Money Today</h2>
          <p className="text-white/90 text-lg mb-7">Try the end-to-end prototype and track every transfer on-chain.</p>
          <Link href="/send">
            <button className="landing-cta-button px-8 py-3 rounded-xl font-bold">
              Connect Wallet &amp; Send
            </button>
          </Link>
          <p className="text-xs text-white/80 mt-3">No credit card required</p>
        </div>
      </section>

    </div>
  );
}
