import type { TicketRow } from "./types";

// ===========================================================================
// Tempi del progetto.
//
// I progetti non hanno ancora un tempo proprio: l'unica sorgente reale oggi
// sono i ticket di assistenza collegati (tempo_effettivo_minuti). Questo
// modulo li aggrega e li formatta, senza inventare numeri. Quando il backend
// avra' i tempi delle attivita', bastera' sommarli qui.
//
// Modulo PURO: viene importato da Client Component.
// ===========================================================================

// Durata leggibile: "3h 20m", "45m", "2h".
// Zero e null NON sono un tempo registrato: restituire "0m" direbbe che
// qualcuno ha lavorato zero minuti, mentre il fatto e' che nessuno ha
// registrato nulla. La UI distingue i due casi tramite `totale === 0`.
export function formatDurata(minuti: number | null | undefined): string {
  if (minuti == null || !Number.isFinite(minuti) || minuti <= 0) return "—";
  const ore = Math.floor(minuti / 60);
  const min = Math.round(minuti % 60);
  if (ore === 0) return `${min}m`;
  if (min === 0) return `${ore}h`;
  return `${ore}h ${min}m`;
}

export interface TempoOperatore {
  nome: string;
  minuti: number;
  // Quanti ticket hanno contribuito: spiega un totale senza dire "quante
  // volte" e' stato toccato il progetto.
  ticket: number;
}

export interface RiepilogoTempi {
  // Minuti effettivi registrati sui ticket collegati.
  totale: number;
  // Minuti stimati. Zero = nessuna stima inserita, non "stima nulla".
  stimato: number;
  ticketTotale: number;
  ticketConTempo: number;
  perOperatore: TempoOperatore[];
}

export function riepilogoTempi(tickets: TicketRow[]): RiepilogoTempi {
  let totale = 0;
  let stimato = 0;
  let ticketConTempo = 0;
  const perOperatore = new Map<string, TempoOperatore>();

  for (const t of tickets) {
    const effettivo = t.tempo_effettivo_minuti ?? 0;
    if ((t.tempo_stimato_minuti ?? 0) > 0) stimato += t.tempo_stimato_minuti ?? 0;
    if (effettivo <= 0) continue;

    ticketConTempo += 1;
    totale += effettivo;

    // `operatore` sui ticket e' testo libero e puo' essere vuoto: "Non
    // assegnato" e' un raggruppamento reale, non un errore.
    const nome = t.operatore?.trim() || "Non assegnato";
    const voce = perOperatore.get(nome);
    if (voce) {
      voce.minuti += effettivo;
      voce.ticket += 1;
    } else {
      perOperatore.set(nome, { nome, minuti: effettivo, ticket: 1 });
    }
  }

  return {
    totale,
    stimato,
    ticketTotale: tickets.length,
    ticketConTempo,
    perOperatore: Array.from(perOperatore.values()).sort((a, b) => b.minuti - a.minuti),
  };
}
