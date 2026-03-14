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
    return null;
  }

  if (requiresWallet && !connected) {
    return null;
  }

  return <>{children}</>;
}
