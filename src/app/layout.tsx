import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ManufactureOS",
    template: "%s · ManufactureOS",
  },
  description: "Discrete Manufacturing ERP: BOM, Item Master, Production Planning & MRP, Procurement, Inventory & Stock, Manufacturing Orders, Quality Control, dan Cost Accounting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-brand-600 focus:outline-none"
          href="#main-content"
        >
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
