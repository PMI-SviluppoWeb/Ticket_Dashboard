import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Support Desk · Dashboard Ticket",
  description: "Gestione e monitoraggio dei ticket di supporto",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${inter.className} ${outfit.variable} h-screen overflow-hidden bg-crema text-inchiostro print:h-auto print:overflow-visible print:bg-white`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
