import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreasureNOVA USDT Wallet Analytics",
  description:
    "Real-time BEP-20 USDT wallet analytics on BNB Smart Chain.",
  applicationName: "TreasureNOVA USDT Wallet Analytics",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "TreasureNOVA USDT Wallet Analytics",
    description:
      "Real-time BEP-20 USDT wallet analytics on BNB Smart Chain.",
    type: "website",
    siteName: "TreasureNOVA",
  },
  twitter: {
    card: "summary",
    title: "TreasureNOVA USDT Wallet Analytics",
    description:
      "Real-time BEP-20 USDT wallet analytics on BNB Smart Chain.",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1f3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
