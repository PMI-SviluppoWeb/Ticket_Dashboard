import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { TempiProvider } from "@/components/TempiContext";
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
      <body className={`${inter.className} ${outfit.variable} h-screen overflow-hidden bg-crema text-inchiostro`}>
        <div className="flex h-full">
          <Sidebar />
          {/* Il cronometro e' uno stato dell'APPLICAZIONE, non della pagina:
              sta sopra le rotte cosi' il conteggio continua a scorrere mentre
              si naviga e l'header di ogni pagina lo legge dallo stesso posto. */}
          <TempiProvider>
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </TempiProvider>
        </div>
      </body>
    </html>
  );
}
