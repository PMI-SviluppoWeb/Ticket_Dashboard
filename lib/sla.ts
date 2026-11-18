import type { Priorita } from "./types";

// ===========================================================================
// SLA: obiettivi in MINUTI LAVORATIVI, calcolati sull'orario d'ufficio.
//
// Modulo puro (niente DB) cosi' i conti sono testabili: un errore qui sposta
// le scadenze di ore o di giorni. Il fuso usato e' quello del processo
// (l'app gira in Europa/Rome); i test costruiscono date locali senza "Z" per
// non dipendere dalla macchina.
// ===========================================================================

export interface ObiettivoSla {
  presaMinuti: number;
  risoluzioneMinuti: number;
}

export interface OrarioUfficio {
  // 0 = domenica, 1 = lunedi ... 6 = sabato.
  giorni: number[];
  inizio: string; // "09:00"
  fine: string; // "18:00"
  pausa?: { inizio: string; fine: string } | null;
}

export interface ConfigSla {
  priorita: Record<Priorita, ObiettivoSla>;
  orario: OrarioUfficio;
  // Festivi in formato YYYY-MM-DD.
  festivi: string[];
}

export const CONFIG_SLA_DEFAULT: ConfigSla = {
  priorita: {
    ALTA: { presaMinuti: 60, risoluzioneMinuti: 480 },
    MEDIA: { presaMinuti: 240, risoluzioneMinuti: 1440 },
    BASSA: { presaMinuti: 480, risoluzioneMinuti: 2880 },
  },
  orario: {
    giorni: [1, 2, 3, 4, 5],
    inizio: "09:00",
    fine: "18:00",
    pausa: { inizio: "13:00", fine: "14:00" },
  },
  festivi: [],
};

function minutiDaHHMM(valore: string): number {
  const [h, m] = valore.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, h * 60 + Math.min(59, Math.max(0, m)));
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isGiornoLavorativo(giorno: Date, cfg: ConfigSla): boolean {
  if (!cfg.orario.giorni.includes(giorno.getDay())) return false;
  return !cfg.festivi.includes(ymd(giorno));
}

// Segmenti lavorativi di un giorno, in epoch ms. La pausa spezza la giornata
// in due; una pausa fuori dall'orario viene ignorata.
function segmentiGiorno(giorno: Date, cfg: ConfigSla): Array<[number, number]> {
  const base = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate()).getTime();
  const inizio = base + minutiDaHHMM(cfg.orario.inizio) * 60_000;
  const fine = base + minutiDaHHMM(cfg.orario.fine) * 60_000;
  if (fine <= inizio) return [];

  const pausa = cfg.orario.pausa;
  if (!pausa) return [[inizio, fine]];

  const pInizio = base + minutiDaHHMM(pausa.inizio) * 60_000;
  const pFine = base + minutiDaHHMM(pausa.fine) * 60_000;
  const segmenti: Array<[number, number]> = [];
  if (pInizio > inizio) segmenti.push([inizio, Math.min(pInizio, fine)]);
  if (pFine < fine) segmenti.push([Math.max(pFine, inizio), fine]);
  return segmenti.filter(([a, b]) => b > a);
}

// Minuti lavorativi tra due istanti (epoch ms). 0 se fine <= inizio.
export function minutiLavorativiTra(
  inizioMs: number,
  fineMs: number,
  cfg: ConfigSla
): number {
  if (!Number.isFinite(inizioMs) || !Number.isFinite(fineMs) || fineMs <= inizioMs) {
    return 0;
  }
  let totale = 0;
  const giorno = new Date(inizioMs);
  giorno.setHours(0, 0, 0, 0);
  const ultimoGiorno = new Date(fineMs);
  ultimoGiorno.setHours(0, 0, 0, 0);

  for (const d = new Date(giorno); d <= ultimoGiorno; d.setDate(d.getDate() + 1)) {
    if (!isGiornoLavorativo(d, cfg)) continue;
    for (const [s, e] of segmentiGiorno(d, cfg)) {
      const a = Math.max(s, inizioMs);
      const b = Math.min(e, fineMs);
      if (b > a) totale += (b - a) / 60_000;
    }
  }
  return Math.round(totale);
}

// Somma N minuti lavorativi a un istante, restituendo l'epoch della scadenza.
export function aggiungiMinutiLavorativi(
  inizioMs: number,
  minuti: number,
  cfg: ConfigSla
): number {
  if (!Number.isFinite(inizioMs)) return inizioMs;
  if (minuti <= 0) return inizioMs;

  let rimanenti = minuti;
  const giorno = new Date(inizioMs);
  giorno.setHours(0, 0, 0, 0);

  // Limite difensivo: 10 anni di giorni. Evita un loop infinito con una
  // configurazione senza giorni lavorativi.
  for (let i = 0; i < 3660; i++) {
    if (isGiornoLavorativo(giorno, cfg)) {
      for (const [s, e] of segmentiGiorno(giorno, cfg)) {
        const a = Math.max(s, inizioMs);
        if (e <= a) continue;
        const capacita = (e - a) / 60_000;
        if (rimanenti <= capacita) return a + rimanenti * 60_000;
        rimanenti -= capacita;
      }
    }
    giorno.setDate(giorno.getDate() + 1);
  }
  // Configurazione degenere: fallback in minuti di calendario.
  return inizioMs + minuti * 60_000;
}

export interface TicketSlaInput {
  id: string;
  numero?: string;
  priorita: Priorita;
  stato: string;
  creatoIl: string | null;
  presoIl: string | null;
  chiusoIl: string | null;
}

export interface EsitoSla {
  priorita: Priorita;
  obiettivoPresaMinuti: number;
  obiettivoRisoluzioneMinuti: number;
  presaMinuti: number | null;
  risoluzioneMinuti: number | null;
  scadenzaPresa: number | null;
  scadenzaRisoluzione: number | null;
  presaScaduta: boolean;
  risoluzioneScaduta: boolean;
  presaEntro: boolean | null;
  risoluzioneEntro: boolean | null;
}

function epoch(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function valutaSla(
  ticket: TicketSlaInput,
  cfg: ConfigSla,
  adessoMs: number = Date.now()
): EsitoSla | null {
  const obiettivo = cfg.priorita[ticket.priorita] ?? CONFIG_SLA_DEFAULT.priorita[ticket.priorita];
  const creato = epoch(ticket.creatoIl);
  if (creato === null || !obiettivo) return null;

  const preso = epoch(ticket.presoIl);
  const chiuso = epoch(ticket.chiusoIl);

  const scadenzaPresa = aggiungiMinutiLavorativi(creato, obiettivo.presaMinuti, cfg);
  const scadenzaRisoluzione = aggiungiMinutiLavorativi(
    creato,
    obiettivo.risoluzioneMinuti,
    cfg
  );

  const presaMinuti = preso !== null ? minutiLavorativiTra(creato, preso, cfg) : null;
  const risoluzioneMinuti = chiuso !== null ? minutiLavorativiTra(creato, chiuso, cfg) : null;

  const aperto = ticket.stato !== "CHIUSO" && ticket.stato !== "RISOLTO";
  const presaScaduta = preso !== null ? preso > scadenzaPresa : aperto && adessoMs > scadenzaPresa;
  const risoluzioneScaduta =
    chiuso !== null ? chiuso > scadenzaRisoluzione : aperto && adessoMs > scadenzaRisoluzione;

  return {
    priorita: ticket.priorita,
    obiettivoPresaMinuti: obiettivo.presaMinuti,
    obiettivoRisoluzioneMinuti: obiettivo.risoluzioneMinuti,
    presaMinuti,
    risoluzioneMinuti,
    scadenzaPresa,
    scadenzaRisoluzione,
    presaScaduta,
    risoluzioneScaduta,
    presaEntro: preso !== null ? preso <= scadenzaPresa : null,
    risoluzioneEntro: chiuso !== null ? chiuso <= scadenzaRisoluzione : null,
  };
}

// Un ticket e' "in scadenza" se la prossima soglia (presa o risoluzione) cade
// entro la finestra indicata.
export function inScadenza(
  esito: EsitoSla,
  adessoMs: number,
  finestraMinuti = 120
): boolean {
  const soglie: number[] = [];
  if (esito.presaEntro === null) soglie.push(esito.scadenzaPresa ?? Infinity);
  if (esito.risoluzioneEntro === null) soglie.push(esito.scadenzaRisoluzione ?? Infinity);
  return soglie.some((s) => s >= adessoMs && s - adessoMs <= finestraMinuti * 60_000);
}
