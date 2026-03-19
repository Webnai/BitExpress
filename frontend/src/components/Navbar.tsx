"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { toast } from "sonner";

const PUBLIC_NAV = [{ href: "/", label: "Home" }];
const PROTECTED_NAV = [
  { href: "/send", label: "Send Money" },
  { href: "/track", label: "Track Transfer" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/receive", label: "Receive Money" },
];

/** Deterministic hue from an address string for avatar color. */
function addressHue(addr: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(addr.length, 8); i++) n += addr.charCodeAt(i);
  return n % 360;
}

function WalletAvatar({ address, size = 32 }: { address: string; size?: number }) {
  const hue = addressHue(address);
  const initials = address.slice(2, 4).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 60) % 360},70%,45%))`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "0.02em",
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    connected,
    address,
    walletName,
    displayAddress,
    isConnecting,
    connectLeatherWallet,
    loginTurnkey,
    disconnectWallet,
  } = useWallet();
  const isLandingPage = pathname === "/";

  const handleLeatherConnect = async () => {
    try {
      await connectLeatherWallet();
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
      toast.error(message);
    }
  };

  const handleTurnkeyLogin = async () => {
    try {
      await loginTurnkey();
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Turnkey login failed.";
      toast.error(message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      router.replace("/");
    } catch {
      toast.error("Failed to disconnect wallet.");
    }
  };

  const navContainerClass = isLandingPage ? "max-w-6xl" : "max-w-[1180px]";
  const desktopLinkClass = isLandingPage
    ? "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
    : "text-[#5f6f88] hover:text-[#132a52]";

  const visibleNavItems = connected ? [...PUBLIC_NAV, ...PROTECTED_NAV] : [];

  useEffect(() => {
    if (connected && pathname === "/") {
      router.replace("/dashboard");
    }
  }, [connected, pathname, router]);

  return (
    <nav
      style={{
        background: "rgba(15, 15, 15, 0.98)",
        borderBottom: "1px solid var(--color-border)",
        backdropFilter: "blur(8px)",
      }}
      className="sticky top-0 z-50 px-4 py-3"
    >
      <div className={`${navContainerClass} mx-auto flex items-center justify-between gap-4`}>
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold gradient-text">₿ BitExpress</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7 text-sm font-medium">
          {visibleNavItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`transition-colors ${
                pathname === link.href ? "text-[var(--color-primary)]" : desktopLinkClass
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop wallet area */}
        <div className="hidden md:flex items-center gap-3">
          {connected && address ? (
            <>
              <WalletAvatar address={address} size={32} />
              <span className="text-xs text-[var(--color-text-muted)] font-mono max-w-[190px] truncate" title={address}>
                {displayAddress ?? address}
              </span>
              <button
                className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary text-sm px-4 py-2"
                onClick={() => void handleLeatherConnect()}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect Leather Wallet"}
              </button>
              <button
                className="btn-primary text-sm px-4 py-2"
                onClick={() => void handleTurnkeyLogin()}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Login"}
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className={`md:hidden ${
            isLandingPage
              ? "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]"
              : "text-[#5f6f88] hover:text-[#132a52]"
          }`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden mt-3 pt-3 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          {visibleNavItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2 text-sm font-medium ${
                pathname === link.href ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="px-4 pt-3">
            {connected && address ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2">
                  <WalletAvatar address={address} size={28} />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-[11px] font-semibold text-[var(--color-text)]">{walletName}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)] font-mono truncate">{displayAddress}</span>
                  </div>
                </div>
                <button
                  className="btn-secondary text-sm px-4 py-2 w-full"
                  onClick={() => {
                    void handleDisconnect();
                    setMenuOpen(false);
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  className="btn-secondary text-sm px-4 py-2 w-full"
                  onClick={() => {
                    void handleLeatherConnect();
                    setMenuOpen(false);
                  }}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Connecting..." : "Connect Leather Wallet"}
                </button>
                <button
                  className="btn-primary text-sm px-4 py-2 w-full"
                  onClick={() => {
                    void handleTurnkeyLogin();
                    setMenuOpen(false);
                  }}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Connecting..." : "Login"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
