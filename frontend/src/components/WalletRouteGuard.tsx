"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

const PROTECTED_ROUTES = ["/send", "/receive", "/dashboard"];

export default function WalletRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected, isHydrated } = useWallet();

  const requiresWallet = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  useEffect(() => {
    if (isHydrated && requiresWallet && !connected) {
      router.replace("/");
    }
  }, [isHydrated, requiresWallet, connected, router]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm text-[var(--color-text-muted)] shadow-[0_4px_18px_rgba(0,0,0,0.22)]">
          Initializing secure wallet session...
        </div>
      </div>
    );
  }

  if (requiresWallet && !connected) {
    return null;
  }

  return <>{children}</>;
}
