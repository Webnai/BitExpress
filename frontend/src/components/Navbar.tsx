"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
    connectWallet,
    disconnectWallet,
  } = useWallet();
  const isLandingPage = pathname === "/";

  const handleConnect = async () => {
    try {
      await connectWallet();
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet connection failed.";
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
  const mobileTextClass = isLandingPage ? "text-[var(--color-text-muted)]" : "text-[#5f6f88]";

  const visibleNavItems = connected ? [...PUBLIC_NAV, ...PROTECTED_NAV] : PUBLIC_NAV;

  return (
    <nav
      style={{
        background: isLandingPage ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.97)",
        borderBottom: isLandingPage ? "1px solid var(--color-border)" : "1px solid #e1e8f3",
        backdropFilter: "blur(8px)",
      }}
      className="sticky top-0 z-50 px-4 py-3"
    >
      <div className={`${navContainerClass} mx-auto flex items-center justify-between gap-4`}>
        <Link href="/" className="flex items-center gap-2">
          <span className={isLandingPage ? "text-2xl font-bold gradient-text" : "text-xl font-bold text-[#132a52]"}>
            ₿ BitExpress
          </span>
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
              {/* Notification bell */}
              <button className="relative p-2 rounded-lg text-[#5f6f88] hover:text-[#132a52] hover:bg-[#f6f9fe] transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <WalletAvatar address={address} size={32} />
              <span className="text-xs text-[#5f6f88] font-mono max-w-[190px] truncate" title={address}>
                {displayAddress ?? address}
              </span>
              <button
                className="rounded-lg border border-[#e1e8f3] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f6f88] hover:bg-[#f6f9fe] hover:text-[#132a52] transition-colors"
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="btn-primary text-sm px-3 py-2"
              onClick={() => void handleConnect()}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
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
          style={{ borderColor: isLandingPage ? "var(--color-border)" : "#e1e8f3" }}
        >
          {visibleNavItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2 text-sm font-medium ${
                pathname === link.href ? "text-[var(--color-primary)]" : mobileTextClass
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="px-4 pt-3">
            {connected && address ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 rounded-xl bg-[#f6f9fe] px-3 py-2">
                  <WalletAvatar address={address} size={28} />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-[11px] font-semibold text-[#132a52]">{walletName}</span>
                    <span className="text-[11px] text-[#7f8ea9] font-mono truncate">{displayAddress}</span>
                  </div>
                </div>
                <button
                  className="btn-secondary text-sm px-4 py-2 w-full"
                  onClick={() => {
                    void handleDisconnect();
                    setMenuOpen(false);
                  }}
                >
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              <div>
                <button
                  className="btn-primary text-sm px-4 py-2 w-full"
                  onClick={() => {
                    void handleConnect();
                    setMenuOpen(false);
                  }}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
