import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

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
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
