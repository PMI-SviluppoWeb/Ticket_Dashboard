import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard Ticket",
  description: "Gestione e monitoraggio dei ticket di supporto",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${inter.className} h-screen overflow-hidden bg-slate-100 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
