import type { Metadata } from "next";
import "@turnkey/react-wallet-kit/styles.css";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { WalletProvider } from "@/components/WalletProvider";
import WalletRouteGuard from "@/components/WalletRouteGuard";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "BitExpress — Bitcoin Remittance for Africa",
  description:
    "Send money across Africa with ~1% fees and near-instant settlement using Bitcoin and Stacks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <WalletProvider>
          <Navbar />
          <WalletRouteGuard>
            <main>{children}</main>
          </WalletRouteGuard>
          <Footer />
          <Toaster richColors position="top-right" />
        </WalletProvider>
      </body>
    </html>
  );
}
