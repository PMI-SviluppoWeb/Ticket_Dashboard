import { RE_DATETIME_LOCAL, pad } from "./calendario";
import type { AttivitaRow, ConfigGoogle, OrigineEvento } from "./types";

// Funzioni PURE per la sincronizzazione Google Calendar: nessun accesso al DB,
// nessuna rete, nessuna libreria di date. Sono il pezzo verificabile senza
// credenziali, ed e' qui che vive tutta la logica delicata sui fusi.

export const ORIGINI: OrigineEvento[] = ["progetto", "cliente", "generico"];

export const ORIGINI_LABELS: Record<OrigineEvento, string> = {
  progetto: "Attività di progetto",
  cliente: "Evento con cliente",
  generico: "Evento generico",
};

export const TIMEZONE_DEFAULT = "Europe/Rome";
export const FINESTRA_GIORNI_DEFAULT = 30;

export const CONFIG_DEFAULT: ConfigGoogle = {
  abilitato: false, // default sicuro: nulla parte finche' non si configura
  modalita: "per_origine",
  calendario_default: "",
  mappatura: {},
  timezone: TIMEZONE_DEFAULT,
  finestra_giorni: FINESTRA_GIORNI_DEFAULT,
};

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

// "YYYY-MM-DDTHH:mm" -> "YYYY-MM-DDTHH:mm:00", che e' RFC3339 senza offset.
//
// NON c'e' nulla da convertire: il valore naive e' GIA' l'ora da parete
// locale, e Google interpreta la stringa nel fuso indicato da `timeZone`.
//
// Il tranello da evitare: new Date("2026-10-19T17:30") viene interpretato nel
// fuso DEL PROCESSO, e il container Docker gira in UTC. toISOString() darebbe
// "17:30Z", cioe' le 19:30 a Roma. Mai costruire un Date dalle stringhe naive
// per convertirle: la conversione e' puramente testuale.
export function daNaiveARfc3339(naive: string): string | null {
  return RE_DATETIME_LOCAL.test(naive) ? `${naive}:00` : null;
}

// Sottrae un'ora a un'etichetta naive.
//
// Tutti i getter sono UTC: l'aritmetica avviene nello "spazio naive" e NON
// dipende dal fuso del processo. Non stiamo spostando un istante, stiamo
// spostando un'etichetta.
export function menoUnOra(naive: string): string {
  const [d, t] = naive.split("T");
  const [y, m, g] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const x = new Date(Date.UTC(y, m - 1, g, h, mi) - 3_600_000);
  return (
    `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` +
    `T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`
  );
}

// Aggiunge N giorni a un'etichetta naive (usato per la soglia della finestra).
export function piuGiorni(naive: string, giorni: number): string {
  const [d, t] = naive.split("T");
  const [y, m, g] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const x = new Date(Date.UTC(y, m - 1, g + giorni, h, mi));
  return (
    `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` +
    `T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`
  );
}

// Soglia della finestra di sincronizzazione, in formato naive (confrontabile
// lessicograficamente con data_scadenza). `null` se la finestra e' disattivata.
export function sogliaFinestra(giorni: number, adesso?: Date): string | null {
  if (!Number.isFinite(giorni) || giorni <= 0) return null;
  const d = adesso ?? new Date();
  const oggi = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
  return piuGiorni(oggi, -giorni);
}

// ---------------------------------------------------------------------------
// Calcolo inizio / fine
//
// Decisione di prodotto: l'evento FINISCE ALLA SCADENZA. Se c'e' data_inizio
// si usa quella come inizio, altrimenti si parte un'ora prima della scadenza.
//   scadenza 17:30, senza inizio -> 16:30 - 17:30
//   inizio 09:00, scadenza 17:30 -> 09:00 - 17:30
// ---------------------------------------------------------------------------

export type CodiceErroreTempo =
  | "SENZA_SCADENZA"
  | "INIZIO_DOPO_FINE"
  | "DURATA_ZERO"
  | "FORMATO";

export type EsitoTempo =
  | { ok: true; inizio: string; fine: string }
  | { ok: false; codice: CodiceErroreTempo };

export const MESSAGGI_TEMPO: Record<CodiceErroreTempo, string> = {
  SENZA_SCADENZA: "Senza scadenza l'elemento non compare in calendario.",
  INIZIO_DOPO_FINE: "L'inizio è successivo alla scadenza: evento non creato.",
  DURATA_ZERO: "Inizio e scadenza coincidono: evento non creato.",
  FORMATO: "Formato data non valido.",
};

export function calcolaInizioFine(
  a: Pick<AttivitaRow, "data_inizio" | "data_scadenza">
): EsitoTempo {
  const fine = a.data_scadenza;
  if (!fine) return { ok: false, codice: "SENZA_SCADENZA" };
  if (!RE_DATETIME_LOCAL.test(fine)) return { ok: false, codice: "FORMATO" };
  if (a.data_inizio && !RE_DATETIME_LOCAL.test(a.data_inizio)) {
    return { ok: false, codice: "FORMATO" };
  }

  const inizio = a.data_inizio ?? menoUnOra(fine);

  // Confronto lessicografico, non su Date: le stringhe naive sono ordinabili
  // cosi' come sono (e' la stessa proprieta' su cui si appoggia la query del
  // calendario).
  if (inizio > fine) return { ok: false, codice: "INIZIO_DOPO_FINE" };
  // Google risponde 400 "Invalid start time" anche su end == start: la
  // coincidenza va difesa, non solo l'inversione.
  if (inizio === fine) return { ok: false, codice: "DURATA_ZERO" };

  return { ok: true, inizio, fine };
}

// ---------------------------------------------------------------------------
// Identificativo evento
// ---------------------------------------------------------------------------

// Google accetta un id fornito dal client: base32hex, [a-v0-9], 5-1024 char,
// unico per calendario. crypto.randomUUID() e' esadecimale minuscolo con
// trattini: togliendo i trattini resta in [0-9a-f] ⊂ base32hex.
//
// L'id DERIVATO e' il cuore della robustezza: rende l'insert idempotente.
// Se la riga di stato viene persa ma l'evento esiste ancora, il nuovo insert
// prende 409 e si fa PATCH -> nessun duplicato. Un retry dopo un errore di
// rete non crea doppioni.
export function idEventoDaAttivita(attivitaId: string): string {
  const pulito = attivitaId.toLowerCase().replace(/[^a-v0-9]/g, "");
  if (pulito.length >= 5) return `tk${pulito}`;
  // Difensivo: id legacy o non-UUID. Resta valido e unico.
  return `tk${crypto.randomUUID().replace(/-/g, "")}`;
}

// ---------------------------------------------------------------------------
// Payload evento
// ---------------------------------------------------------------------------

export interface EventoGoogle {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

// Costruisce il payload per l'API Calendar. Ritorna null se l'attivita' non
// ha i requisiti per comparire in calendario (es. senza scadenza).
export function costruisciEvento(
  a: Pick<AttivitaRow, "titolo" | "descrizione" | "data_inizio" | "data_scadenza">,
  timezone: string,
  opts?: { conId?: string }
): { ok: true; evento: EventoGoogle } | { ok: false; codice: CodiceErroreTempo } {
  const tempo = calcolaInizioFine(a);
  if (!tempo.ok) return { ok: false, codice: tempo.codice };

  const inizio = daNaiveARfc3339(tempo.inizio);
  const fine = daNaiveARfc3339(tempo.fine);
  if (!inizio || !fine) return { ok: false, codice: "FORMATO" };

  const evento: EventoGoogle = {
    summary: a.titolo,
    start: { dateTime: inizio, timeZone: timezone },
    end: { dateTime: fine, timeZone: timezone },
  };
  if (a.descrizione) evento.description = a.descrizione;
  if (opts?.conId) evento.id = opts.conId;

  return { ok: true, evento };
}

// ---------------------------------------------------------------------------
// Configurazione: parsing difensivo e risoluzione della mappatura
// ---------------------------------------------------------------------------

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function parseIntSicuro(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Scarta chiavi ignote e valori non stringa o vuoti, e ricade sul default.
// Nessuna libreria di validazione nel repo: si fa a mano.
export function parseMappatura(raw: string | undefined): Partial<Record<OrigineEvento, string>> {
  if (!raw) return {};
  let dati: unknown;
  try {
    dati = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!dati || typeof dati !== "object" || Array.isArray(dati)) return {};

  const out: Partial<Record<OrigineEvento, string>> = {};
  for (const origine of ORIGINI) {
    const v = (dati as Record<string, unknown>)[origine];
    if (typeof v === "string" && v.trim()) out[origine] = v.trim();
  }
  return out;
}

// Costruisce la config dai valori grezzi della tabella `impostazioni`.
export function configDaImpostazioni(imp: Record<string, string>): ConfigGoogle {
  const modalita = imp.google_modalita_mappatura === "unico" ? "unico" : "per_origine";
  const timezone = imp.google_timezone?.trim() || TIMEZONE_DEFAULT;
  const finestra = parseIntSicuro(imp.google_finestra_giorni, FINESTRA_GIORNI_DEFAULT);

  return {
    abilitato: parseBool(imp.google_sync_abilitato, CONFIG_DEFAULT.abilitato),
    modalita,
    calendario_default: imp.google_calendario_default?.trim() ?? "",
    mappatura: parseMappatura(imp.google_mappatura_origini),
    timezone,
    finestra_giorni: finestra >= 0 && finestra <= 3650 ? finestra : FINESTRA_GIORNI_DEFAULT,
  };
}

// Risoluzione PURA: quale calendario per questa origine. `null` = non
// sincronizzare. Nessuna rete, quindi testabile direttamente.
export function risolviCalendario(
  cfg: ConfigGoogle,
  origine: OrigineEvento
): string | null {
  if (!cfg.abilitato) return null;
  if (cfg.modalita === "unico") return cfg.calendario_default || null;
  return cfg.mappatura[origine] || cfg.calendario_default || null;
}

// La configurazione e' completa? Serve a impedire errori silenziosi: con
// mappatura vuota e abilitato=true ogni attivita' finirebbe in ERRORE.
export function configurazioneCompleta(cfg: ConfigGoogle): boolean {
  if (!cfg.abilitato) return false;
  if (cfg.modalita === "unico") return cfg.calendario_default.trim().length > 0;
  return ORIGINI.every((o) => (cfg.mappatura[o] ?? cfg.calendario_default).trim().length > 0);
}
