"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLandingPage = pathname === "/";

  const links = [
    { href: "/", label: "Home" },
    { href: "/send", label: "Send" },
    { href: "/receive", label: "Receive" },
    { href: "/dashboard", label: "Dashboard" },
  ];

  return (
    <nav
      style={{
        background: isLandingPage
          ? "rgba(255, 255, 255, 0.92)"
          : "rgba(26, 26, 46, 0.95)",
        borderBottom: isLandingPage
          ? "1px solid var(--color-border)"
          : "1px solid rgba(249,115,22,0.2)",
        backdropFilter: "blur(8px)",
      }}
      className="sticky top-0 z-50 px-4 py-4"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold gradient-text">₿ BitExpress</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "text-[var(--color-primary)]"
                  : isLandingPage
                    ? "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    : "text-gray-400 hover:text-orange-400"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/send">
            <button className="btn-primary text-sm px-4 py-2">
              Send Money
            </button>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className={`md:hidden ${
            isLandingPage
              ? "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]"
              : "text-gray-400 hover:text-white"
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

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden mt-3 pb-3 border-t"
          style={{ borderColor: "rgba(249,115,22,0.2)" }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-2 text-sm font-medium ${
                pathname === link.href
                  ? "text-[var(--color-primary)]"
                  : isLandingPage
                    ? "text-[var(--color-text-muted)]"
                    : "text-gray-400"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
