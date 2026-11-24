"use client";

import { usePathname } from "next/navigation";

// ===========================================================================
// Contesto della pagina corrente, passato al Copilot.
//
// L'agente deve sapere da DOVE l'operatore lo sta interrogando: un ticket
// aperto, un cliente, un progetto. La mappa e' volutamente esplicita (niente
// "qualsiasi UUID"): solo le entita' che hanno un significato per gli agenti.
// ===========================================================================

export type TipoContesto = "ticket" | "cliente" | "progetto";

export interface ContestoPagina {
  tipo: TipoContesto;
  id: string;
  href: string;
}

const ROTTE: Array<{ pattern: RegExp; tipo: TipoContesto }> = [
  { pattern: /^\/tickets\/([^/?#]+)/, tipo: "ticket" },
  { pattern: /^\/clienti\/([^/?#]+)/, tipo: "cliente" },
  { pattern: /^\/progetti\/([^/?#]+)/, tipo: "progetto" },
];

export function contestoDaPath(pathname: string): ContestoPagina | null {
  for (const rotta of ROTTE) {
    const m = pathname.match(rotta.pattern);
    if (m && m[1] && m[1] !== "nuovo") {
      return { tipo: rotta.tipo, id: decodeURIComponent(m[1]), href: pathname };
    }
  }
  return null;
}

export function useContestoPagina(): ContestoPagina | null {
  const pathname = usePathname();
  return contestoDaPath(pathname ?? "");
}

export function etichettaContesto(c: ContestoPagina | null): string {
  if (!c) return "Nessun contesto";
  const sostantivo =
    c.tipo === "ticket" ? "Ticket" : c.tipo === "cliente" ? "Cliente" : "Progetto";
  return `${sostantivo} ${c.id.slice(0, 8)}`;
}
