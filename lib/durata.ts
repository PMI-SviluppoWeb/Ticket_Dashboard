import type { TicketRow, VoceTempoRow } from "./types";

// ===========================================================================
// Tempi del progetto e del cronometro.
//
// I progetti non hanno un tempo proprio memorizzato: il tempo reale arriva
// dalle voci di `voci_tempo` (task, ticket, tempo generico) e, per lo storico,
// dai ticket di assistenza collegati (tempo_effettivo_minuti). Questo modulo
// aggrega e formatta, senza inventare numeri.
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

// Cronometro: "1:04:09". Sempre con le ore, perche' e' un orologio che scorre
// e larghezza/posizione delle cifre non devono ballare a ogni minuto.
// `secondi` negativi (orologio del client indietro rispetto al server) sono
// clampati a zero: lo schermo non deve mostrare un tempo che risale.
export function formatCronometro(secondi: number | null | undefined): string {
  const s = Math.max(0, Math.floor(secondi ?? 0));
  const ore = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${ore}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Secondi trascorsi fra due istanti ISO. Con `fine` nullo il conteggio arriva
// a `adesso` (default: ora del client).
export function secondiTrascorsi(
  inizio: string,
  fine: string | null,
  adesso: number = Date.now()
): number {
  const a = new Date(inizio).getTime();
  if (!Number.isFinite(a)) return 0;
  const b = fine ? new Date(fine).getTime() : adesso;
  if (!Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

// Minuti di una voce chiusa. Restituisce null per la voce in corso: un tempo
// ancora in movimento non e' un dato da sommare senza dire che e' parziale.
export function minutiVoce(v: VoceTempoRow, adesso: number = Date.now()): number | null {
  if (!v.fine) return null;
  return Math.round(secondiTrascorsi(v.inizio, v.fine, adesso) / 60);
}

// Totale in minuti di un insieme di voci. Le voci in corso CONTANO fino ad
// `adesso`: chi guarda il totale mentre lavora si aspetta di vederlo salire.
// Per un totale "solo registrato" passare `soloChiuse`.
export function totaleMinutiVoci(
  voci: VoceTempoRow[],
  opts?: { adesso?: number; soloChiuse?: boolean }
): number {
  const adesso = opts?.adesso ?? Date.now();
  let totale = 0;
  for (const v of voci) {
    if (!v.fine && opts?.soloChiuse) continue;
    totale += secondiTrascorsi(v.inizio, v.fine, adesso) / 60;
  }
  return Math.round(totale);
}

// Una voce in corso da piu' di `oreLimite` e' quasi certamente dimenticata:
// la UI lo segnala invece di sommare in silenzio mezza giornata di troppo.
export const ORE_AVVISO_TIMER = 8;

export function timerDimenticato(v: VoceTempoRow, adesso: number = Date.now()): boolean {
  if (v.fine) return false;
  return secondiTrascorsi(v.inizio, null, adesso) > ORE_AVVISO_TIMER * 3600;
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
