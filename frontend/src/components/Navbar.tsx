"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/send", label: "Send Money" },
  { href: "/receive", label: "Receive Money" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLandingPage = pathname === "/";

  const navContainerClass = isLandingPage
    ? "max-w-6xl"
    : "max-w-[1180px]";
  const desktopLinkClass = isLandingPage
    ? "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
    : "text-[#5f6f88] hover:text-[#132a52]";
  const mobileTextClass = isLandingPage
    ? "text-[var(--color-text-muted)]"
    : "text-[#5f6f88]";

  return (
    <nav
      style={{
        background: isLandingPage
          ? "rgba(255, 255, 255, 0.92)"
          : "rgba(255, 255, 255, 0.97)",
        borderBottom: isLandingPage
          ? "1px solid var(--color-border)"
          : "1px solid #e1e8f3",
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

        <div className="hidden md:flex items-center gap-7 text-sm font-medium">
          {NAV_ITEMS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`transition-colors ${
                pathname === link.href
                  ? "text-[var(--color-primary)]"
                  : desktopLinkClass
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <Link href="/send">
            <button
              className="btn-primary text-sm px-4 py-2"
              disabled={pathname === "/send"}
              aria-disabled={pathname === "/send"}
            >
              New Transfer
            </button>
          </Link>
        </div>

        <button
          className={`md:hidden ${
            isLandingPage
              ? "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]"
              : "text-[#5f6f88] hover:text-[#132a52]"
          }`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div
          className="md:hidden mt-3 pt-3 border-t"
          style={{ borderColor: isLandingPage ? "var(--color-border)" : "#e1e8f3" }}
        >
          {NAV_ITEMS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2 text-sm font-medium ${
                pathname === link.href
                  ? "text-[var(--color-primary)]"
                  : mobileTextClass
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="px-4 pt-2">
            <Link href="/send" onClick={() => setMenuOpen(false)}>
              <button
                className="btn-primary text-sm px-4 py-2 w-full"
                disabled={pathname === "/send"}
                aria-disabled={pathname === "/send"}
              >
                New Transfer
              </button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
