import { RE_DATETIME_LOCAL, pad } from "./calendario";
import type { EventoCalendario } from "./types";

// ===========================================================================
// Matematica della griglia oraria: nessun React, nessun DOM.
//
// Gli orari del calendario sono stringhe naive "YYYY-MM-DDTHH:mm" (ora di
// parete di Roma), non istanti UTC. Per sommare minuti e confrontare giorni
// si usano componenti UTC su Date.UTC: cosi' l'ora legale non accorcia o
// allunga una giornata e non si finisce mai a costruire un Date locale da
// una stringa naive (che verrebbe interpretata nel fuso del browser).
//
// Regola: mai toISOString() su data_inizio/data_scadenza.
// ===========================================================================

export const PX_PER_ORA = 56;
export const MINUTI_GIORNO = 1440;
export const SNAP_MIN = 30;
export const DURATA_MINIMA_MIN = 15;
export const DURATA_DEFAULT_MIN = 60;
export const ALTEZZA_MIN_EVENTO_PX = 24;
export const ORA_SCROLL_INIZIALE = 7;

interface Naive {
  ms: number;
  data: string;
  minuti: number;
}

function analizza(v: string | null | undefined): Naive | null {
  if (!v || !RE_DATETIME_LOCAL.test(v)) return null;
  const anno = Number(v.slice(0, 4));
  const mese = parseInt(v.slice(5, 7), 10);
  const giorno = parseInt(v.slice(8, 10), 10);
  const ora = parseInt(v.slice(11, 13), 10);
  const minuto = parseInt(v.slice(14, 16), 10);
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;
  if (ora > 23 || minuto > 59) return null;

  const ms = Date.UTC(anno, mese - 1, giorno, ora, minuto);
  const d = new Date(ms);
  // Date.UTC normalizza il 31 febbraio: se i componenti non tornano, la
  // stringa era una data inesistente.
  if (
    d.getUTCFullYear() !== anno ||
    d.getUTCMonth() !== mese - 1 ||
    d.getUTCDate() !== giorno ||
    d.getUTCHours() !== ora ||
    d.getUTCMinutes() !== minuto
  ) {
    return null;
  }
  return { ms, data: v.slice(0, 10), minuti: ora * 60 + minuto };
}

function formatta(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function minutiDelGiorno(v: string | null | undefined): number | null {
  const p = analizza(v);
  return p ? p.minuti : null;
}

export function chiaveNaive(v: string | null | undefined): string | null {
  const p = analizza(v);
  return p ? p.data : null;
}

export function spostaDataOra(naive: string, minuti: number): string {
  const p = analizza(naive);
  if (!p) return naive;
  return formatta(p.ms + minuti * 60_000);
}

export function diffMinuti(a: string, b: string): number {
  const pa = analizza(a);
  const pb = analizza(b);
  if (!pa || !pb) return 0;
  return Math.round((pa.ms - pb.ms) / 60_000);
}

export function arrotonda(minuti: number, passo = SNAP_MIN): number {
  return Math.round(minuti / passo) * passo;
}

export function snapDeltaPx(dyPx: number, pxPerOra = PX_PER_ORA): number {
  return arrotonda((dyPx / pxPerOra) * 60);
}

export function topPx(minuti: number, pxPerOra = PX_PER_ORA): number {
  return (minuti / 60) * pxPerOra;
}

export function altezzaPx(
  durataMinuti: number,
  pxPerOra = PX_PER_ORA,
  minimoPx = ALTEZZA_MIN_EVENTO_PX
): number {
  return Math.max(minimoPx, (Math.max(0, durataMinuti) / 60) * pxPerOra);
}

export function oraDaMinuti(minuti: number): string {
  const m = Math.max(0, Math.min(MINUTI_GIORNO - 1, Math.round(minuti)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// ---------------------------------------------------------------------------
// Evento -> intervallo effettivo
// ---------------------------------------------------------------------------

export interface IntervalloEvento {
  inizio: string;
  fine: string;
}

// La scadenza e' la fine; l'inizio e' opzionale e, se manca o e' incoerente,
// si mostra un blocco di un'ora che termina alla scadenza (stessa regola di
// lib/google-evento.calcolaInizioFine).
export function inizioFineEvento(
  e: Pick<EventoCalendario, "data_inizio" | "data_scadenza">
): IntervalloEvento | null {
  const fine = analizza(e.data_scadenza);
  if (!fine) return null;

  const inizio = analizza(e.data_inizio);
  const fineStr = e.data_scadenza as string;
  if (inizio && diffMinuti(fineStr, e.data_inizio as string) > 0) {
    return { inizio: e.data_inizio as string, fine: fineStr };
  }
  return { inizio: spostaDataOra(fineStr, -DURATA_DEFAULT_MIN), fine: fineStr };
}

// ---------------------------------------------------------------------------
// Clipping per giorno
// ---------------------------------------------------------------------------

export interface SegmentoGiorno {
  evento: EventoCalendario;
  inizio: string;
  fine: string;
  inizioMin: number;
  fineMin: number;
  continuaPrima: boolean;
  continuaDopo: boolean;
  tuttoIlGiorno: boolean;
}

export function segmentiDelGiorno(
  eventi: EventoCalendario[],
  chiave: string
): SegmentoGiorno[] {
  const inizioGiorno = `${chiave}T00:00`;
  const fineGiorno = spostaDataOra(inizioGiorno, MINUTI_GIORNO);
  const out: SegmentoGiorno[] = [];

  for (const evento of eventi) {
    const range = inizioFineEvento(evento);
    if (!range) continue;
    // Confronto lessicografico: il formato naive a larghezza fissa ordina
    // come il tempo. La fine e' esclusiva a mezzanotte.
    if (range.inizio >= fineGiorno || range.fine <= inizioGiorno) continue;

    const inizioMin = Math.max(0, diffMinuti(range.inizio, inizioGiorno));
    const fineMin = Math.min(MINUTI_GIORNO, diffMinuti(range.fine, inizioGiorno));
    if (fineMin <= inizioMin) continue;

    const durata = diffMinuti(range.fine, range.inizio);
    out.push({
      evento,
      inizio: range.inizio,
      fine: range.fine,
      inizioMin,
      fineMin,
      continuaPrima: diffMinuti(range.inizio, inizioGiorno) < 0,
      continuaDopo: diffMinuti(range.fine, fineGiorno) > 0,
      tuttoIlGiorno:
        durata >= MINUTI_GIORNO ||
        (inizioMin === 0 && fineMin === MINUTI_GIORNO),
    });
  }

  return out;
}

export function eventiPerGiorno(
  eventi: EventoCalendario[],
  giorni: Date[]
): Map<string, SegmentoGiorno[]> {
  const mappa = new Map<string, SegmentoGiorno[]>();
  for (const giorno of giorni) {
    const chiave = `${giorno.getFullYear()}-${pad(giorno.getMonth() + 1)}-${pad(
      giorno.getDate()
    )}`;
    mappa.set(chiave, segmentiDelGiorno(eventi, chiave));
  }
  return mappa;
}

// ---------------------------------------------------------------------------
// Impacchettamento delle sovrapposizioni (interval partitioning)
// ---------------------------------------------------------------------------

export interface EventoPosizionato extends SegmentoGiorno {
  colonna: number;
  colonne: number;
}

export function impacchetta(segmenti: SegmentoGiorno[]): EventoPosizionato[] {
  const ordinati = [...segmenti]
    .filter((s) => !s.tuttoIlGiorno)
    .sort(
      (a, b) =>
        a.inizioMin - b.inizioMin ||
        b.fineMin - a.fineMin ||
        a.evento.id.localeCompare(b.evento.id)
    );

  const out: EventoPosizionato[] = [];
  let i = 0;

  while (i < ordinati.length) {
    // Cluster = insieme con sovrapposizione transitiva. Back-to-back
    // (inizio >= fine del cluster) apre un cluster nuovo, cosi' due eventi
    // consecutivi restano entrambi a larghezza piena.
    const cluster = [ordinati[i]];
    let fineCluster = ordinati[i].fineMin;
    i++;
    while (i < ordinati.length && ordinati[i].inizioMin < fineCluster) {
      cluster.push(ordinati[i]);
      fineCluster = Math.max(fineCluster, ordinati[i].fineMin);
      i++;
    }

    const finiColonna: number[] = [];
    const assegnati: { segmento: SegmentoGiorno; colonna: number }[] = [];
    for (const segmento of cluster) {
      let colonna = finiColonna.findIndex((fine) => fine <= segmento.inizioMin);
      if (colonna === -1) {
        colonna = finiColonna.length;
        finiColonna.push(segmento.fineMin);
      } else {
        finiColonna[colonna] = segmento.fineMin;
      }
      assegnati.push({ segmento, colonna });
    }

    const colonne = Math.max(1, finiColonna.length);
    for (const a of assegnati) {
      out.push({ ...a.segmento, colonna: a.colonna, colonne });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Drag e resize
// ---------------------------------------------------------------------------

export interface LimitiGiorni {
  inizio: string;
  fine: string;
}

export function limitiDaGiorni(giorni: Date[]): LimitiGiorni {
  const prima = giorni[0];
  const ultima = giorni[giorni.length - 1];
  const chiavePrima = `${prima.getFullYear()}-${pad(prima.getMonth() + 1)}-${pad(
    prima.getDate()
  )}`;
  const chiaveUltima = `${ultima.getFullYear()}-${pad(
    ultima.getMonth() + 1
  )}-${pad(ultima.getDate())}`;
  return { inizio: `${chiavePrima}T00:00`, fine: `${chiaveUltima}T23:59` };
}

export function calcolaSpostamento(input: {
  inizio0: string;
  fine0: string;
  deltaMinuti: number;
  deltaGiorni: number;
  limiteInizio: string;
  limiteFine: string;
}): IntervalloEvento {
  const durata = Math.max(
    DURATA_DEFAULT_MIN,
    diffMinuti(input.fine0, input.inizio0)
  );
  let inizio = spostaDataOra(
    input.inizio0,
    input.deltaMinuti + input.deltaGiorni * MINUTI_GIORNO
  );

  if (inizio < input.limiteInizio) inizio = input.limiteInizio;
  let fine = spostaDataOra(inizio, durata);

  if (fine > input.limiteFine) {
    fine = input.limiteFine;
    inizio = spostaDataOra(fine, -durata);
    if (inizio < input.limiteInizio) inizio = input.limiteInizio;
  }

  return { inizio, fine };
}

export function calcolaRidimensionamento(input: {
  inizio: string;
  fine0: string;
  deltaMinuti: number;
  limiteFine: string;
  durataMinima?: number;
}): { fine: string } {
  const minima = Math.max(DURATA_MINIMA_MIN, input.durataMinima ?? 0);
  let fine = spostaDataOra(input.fine0, input.deltaMinuti);

  const fineMinima = spostaDataOra(input.inizio, minima);
  if (fine < fineMinima) fine = fineMinima;
  if (fine > input.limiteFine) fine = input.limiteFine;
  if (fine < input.inizio) fine = spostaDataOra(input.inizio, minima);

  return { fine };
}

// ---------------------------------------------------------------------------
// Geometria del pointer
// ---------------------------------------------------------------------------

export interface RettangoloX {
  left: number;
  right: number;
}

export function indiceGiornoDaX(x: number, rects: RettangoloX[]): number {
  if (rects.length === 0) return 0;
  if (x <= rects[0].left) return 0;
  for (let i = 0; i < rects.length; i++) {
    if (x >= rects[i].left && x < rects[i].right) return i;
  }
  return rects.length - 1;
}

export function etichettaGmt(anchor: Date): string {
  // getTimezoneOffset e' positivo a ovest di Greenwich; l'etichetta vuole
  // il segno opposto.
  const offset = -anchor.getTimezoneOffset() / 60;
  const segno = offset >= 0 ? "+" : "";
  const valore = Number.isInteger(offset) ? String(offset) : offset.toFixed(1);
  return `GMT${segno}${valore}`;
}
