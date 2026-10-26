import "server-only";
import { createPrivateKey, sign as firmaRsa, type KeyObject } from "node:crypto";
import type { EventoGoogle } from "./google-evento";

// ===========================================================================
// Client HTTP verso Google Calendar. Autenticazione con service account (RS256).
//
// REGOLA DI MANUTENZIONE — in questo file non si chiama MAI `fetch`
// direttamente: ogni chiamata passa da googleFetch(). Il motivo e' lo stesso
// bug gia' corretto in lib/db.ts: Next.js 14 patcha il fetch globale e ne
// mette in cache le risposte SU DISCO (.next/cache/fetch-cache, default
// force-cache). Senza `cache: "no-store"` la prima risposta a una data URL
// viene riusata per sempre — e qui il caso peggiore e' un token OAuth riusato
// oltre la scadenza, o listCalendars (una GET) congelato per sempre.
// `export const dynamic = "force-dynamic"` NON basta: agisce sul rendering
// della rotta, non sul fetch interno.
//
// Verifica in review: `grep -n "fetch(" lib/google-calendar.ts` deve
// restituire SOLO la riga dentro googleFetch.
// ===========================================================================

const TOKEN_URL_DEFAULT = "https://oauth2.googleapis.com/token";
const API_BASE_DEFAULT = "https://www.googleapis.com/calendar/v3";

const SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

// Lettura lazy: durante `next build` (Docker) le variabili non esistono.
function tokenUrl(): string {
  return process.env.GOOGLE_OAUTH_TOKEN_URL || TOKEN_URL_DEFAULT;
}

function apiBase(): string {
  return process.env.GOOGLE_CALENDAR_API_BASE || API_BASE_DEFAULT;
}

export function dryRun(): boolean {
  return process.env.GOOGLE_DRY_RUN === "true";
}

// Credenziali presenti? Serve alle rotte per distinguere 503 "non
// configurato" da un errore vero di Google.
export function credenzialiPresenti(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

export class ErroreGoogle extends Error {
  status: number;
  categoria: "TOKEN" | "API" | "CONFIG";
  constructor(status: number, messaggio: string, categoria: "TOKEN" | "API" | "CONFIG") {
    super(messaggio);
    this.name = "ErroreGoogle";
    this.status = status;
    this.categoria = categoria;
  }
}

// ---------------------------------------------------------------------------
// UNICO punto di uscita HTTP verso Google.
// ---------------------------------------------------------------------------
async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const opts: RequestInit = { ...init, cache: "no-store" };
  // Controllo a runtime: rende l'omissione un errore immediato invece di un
  // bug silenzioso che si manifesta come dati congelati.
  if (opts.cache !== "no-store") {
    throw new Error("googleFetch: cache 'no-store' obbligatorio su ogni chiamata Google.");
  }
  return fetch(url, opts);
}

// ---------------------------------------------------------------------------
// Token di accesso, con cache in memoria
// ---------------------------------------------------------------------------

const MARGINE_MS = 5 * 60 * 1000; // rinnova 5 minuti prima della scadenza

let cacheToken: { token: string; scadenza: number } | null = null;

// La PEM arriva con gli a-capo ESCAPATI: `env_file` di docker-compose non
// supporta valori multi-riga, quindi la chiave si scrive su una riga sola con
// "\n" letterali, da ripristinare qui.
function chiavePrivata(): KeyObject {
  const raw = process.env.GOOGLE_PRIVATE_KEY ?? "";
  if (!raw) throw new ErroreGoogle(503, "GOOGLE_PRIVATE_KEY mancante.", "CONFIG");
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  try {
    return createPrivateKey({ key: pem, format: "pem" });
  } catch {
    throw new ErroreGoogle(
      503,
      "GOOGLE_PRIVATE_KEY non è una chiave PEM valida (controlla gli a-capo come \\n).",
      "CONFIG"
    );
  }
}

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

// JWT a mano con node:crypto, nello stesso spirito di lib/auth.ts (che firma
// HS256 con crypto.subtle). sign("sha256", ...) con chiave RSA produce
// esattamente RSASSA-PKCS1-v1_5 = SHA256withRSA, cioe' l'algoritmo RS256.
// Nessuna libreria JWT aggiunta.
export function costruisciJwt(email: string, adessoMs: number): string {
  const iat = Math.floor(adessoMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE, // separati da SPAZIO
      aud: tokenUrl(),
      iat,
      exp: iat + 3600, // massimo consentito da Google
    })
  );
  const firma = firmaRsa("sha256", Buffer.from(`${header}.${claim}`), chiavePrivata())
    .toString("base64url");
  return `${header}.${claim}.${firma}`;
}

async function richiediToken(): Promise<{ token: string; scadenza: number }> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
  if (!email) {
    throw new ErroreGoogle(503, "GOOGLE_SERVICE_ACCOUNT_EMAIL mancante.", "CONFIG");
  }

  const adesso = Date.now();
  const jwt = costruisciJwt(email, adesso);

  const res = await googleFetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
    signal: AbortSignal.timeout(8000),
  });

  const testo = await res.text();
  if (!res.ok) {
    throw new ErroreGoogle(
      res.status,
      `Token Google rifiutato (${res.status}): ${testo.slice(0, 300)}`,
      "TOKEN"
    );
  }

  let dati: { access_token?: string; expires_in?: number };
  try {
    dati = JSON.parse(testo) as { access_token?: string; expires_in?: number };
  } catch {
    throw new ErroreGoogle(502, "Risposta del token endpoint non leggibile.", "TOKEN");
  }
  if (!dati.access_token) {
    throw new ErroreGoogle(502, "Il token endpoint non ha restituito access_token.", "TOKEN");
  }

  return {
    token: dati.access_token,
    scadenza: adesso + (dati.expires_in ?? 3600) * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  const adesso = Date.now();
  // Il margine evita di usare un token valido "per pochi secondi" a meta' di
  // un batch di riconciliazione.
  if (cacheToken && cacheToken.scadenza - MARGINE_MS > adesso) {
    return cacheToken.token;
  }
  cacheToken = await richiediToken();
  return cacheToken.token;
}

// Usato solo dai test per forzare il rinnovo.
export function azzeraTokenCache(): void {
  cacheToken = null;
}

// ---------------------------------------------------------------------------
// Richieste con retry
// ---------------------------------------------------------------------------

const TENTATIVI_MAX = 3;
const ATTESE_MS = [250, 1000];

function ritentabile(status: number, corpo: string): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (status === 403) {
    return /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(corpo);
  }
  return false;
}

function attesa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpzioniRichiesta {
  method?: string;
  body?: unknown;
  budgetMs?: number; // timeout per tentativo
  tentativi?: number;
}

// Avvolge googleFetch con retry, backoff e rinnovo del token su 401.
// Ritorna la Response: la traduzione in errore la fa il chiamante, che sa
// quali status sono "attesi" (es. 404 sulla delete = gia' assente = successo).
async function richiestaGoogle(
  url: string,
  opts: OpzioniRichiesta = {}
): Promise<Response> {
  const budget = opts.budgetMs ?? 8000;
  const maxTentativi = opts.tentativi ?? TENTATIVI_MAX;

  if (dryRun()) {
    // Livello 1 di verifica: esercita l'intero flusso senza rete e senza
    // nemmeno chiedere il token.
    console.log(`[google:dry-run] ${opts.method ?? "GET"} ${url}`, opts.body ?? "");
    return new Response(JSON.stringify({ id: "dry-run-event", summary: "dry-run" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let ultimoErrore: unknown = null;
  let rinnovato = false;

  for (let tentativo = 0; tentativo < maxTentativi; tentativo++) {
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";

      const res = await googleFetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(budget),
      });

      // Token scaduto a meta' strada: si azzera la cache e si ripete UNA volta.
      if (res.status === 401 && !rinnovato) {
        rinnovato = true;
        cacheToken = null;
        tentativo--; // il rinnovo non consuma un tentativo
        continue;
      }

      const corpo = res.ok ? "" : await res.clone().text();
      if (!res.ok && ritentabile(res.status, corpo) && tentativo < maxTentativi - 1) {
        await attesa(ATTESE_MS[tentativo] ?? 1000);
        continue;
      }
      return res;
    } catch (err) {
      // Un errore di CONFIGURAZIONE (env mancanti, chiave PEM non valida) non
      // e' transitorio: ritentarlo e' inutile, e riavvolgerlo in "Google non
      // raggiungibile" manderebbe l'utente a cercare il problema sbagliato.
      if (err instanceof ErroreGoogle && err.categoria === "CONFIG") throw err;
      ultimoErrore = err;
      if (tentativo < maxTentativi - 1) {
        await attesa(ATTESE_MS[tentativo] ?? 1000);
        continue;
      }
    }
  }

  const msg = ultimoErrore instanceof Error ? ultimoErrore.message : "errore sconosciuto";
  throw new ErroreGoogle(502, `Google non raggiungibile: ${msg}`, "API");
}

// ---------------------------------------------------------------------------
// API pubbliche
// ---------------------------------------------------------------------------

export interface CalendarioGoogle {
  id: string;
  summary: string;
}

// Best effort: su un account Gmail gratuito un calendario condiviso a mano
// NON compare nella CalendarList del service account (non puo' "accettare" la
// condivisione). Per questo la UI accetta sempre anche l'id scritto a mano.
export async function listCalendars(budgetMs = 8000): Promise<CalendarioGoogle[]> {
  const res = await richiestaGoogle(`${apiBase()}/users/me/calendarList`, { budgetMs });
  if (!res.ok) {
    const corpo = await res.text();
    throw new ErroreGoogle(res.status, `Elenco calendari non disponibile: ${corpo.slice(0, 200)}`, "API");
  }
  const dati = (await res.json()) as { items?: { id?: string; summary?: string }[] };
  return (dati.items ?? [])
    .filter((i) => typeof i.id === "string")
    .map((i) => ({ id: i.id as string, summary: i.summary || (i.id as string) }));
}

// Verifica che il calendario sia condiviso con il service account.
// Usa `events.list` (scope calendar.events): 200 = condiviso, 404/403 = no.
// Cosi' non serve lo scope calendar.readonly.
export async function verificaAccesso(calendarId: string, budgetMs = 8000): Promise<boolean> {
  const res = await richiestaGoogle(
    `${apiBase()}/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1`,
    { budgetMs, tentativi: 1 }
  );
  if (res.ok) return true;
  if (res.status === 404 || res.status === 403 || res.status === 400) return false;
  const corpo = await res.text();
  throw new ErroreGoogle(res.status, `Verifica non riuscita: ${corpo.slice(0, 200)}`, "API");
}

// Inserimento. Google risponde 409 se l'id proposto esiste gia': il chiamante
// lo traduce in PATCH (idempotenza dell'id derivato).
export async function insertEvent(
  calendarId: string,
  evento: EventoGoogle,
  budgetMs = 8000
): Promise<{ id: string }> {
  const res = await richiestaGoogle(
    `${apiBase()}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    { method: "POST", body: evento, budgetMs }
  );
  const corpo = await res.text();
  if (!res.ok) {
    throw new ErroreGoogle(
      res.status,
      `Creazione evento non riuscita (${res.status}): ${corpo.slice(0, 200)}`,
      "API"
    );
  }
  const dati = JSON.parse(corpo) as { id?: string };
  return { id: dati.id ?? evento.id ?? "" };
}

// Aggiornamento (PATCH: modifica parziale, il payload e' comunque completo).
export async function updateEvent(
  calendarId: string,
  eventId: string,
  evento: EventoGoogle,
  budgetMs = 8000
): Promise<void> {
  const res = await richiestaGoogle(
    `${apiBase()}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "PATCH", body: evento, budgetMs }
  );
  if (!res.ok) {
    const corpo = await res.text();
    throw new ErroreGoogle(
      res.status,
      `Aggiornamento evento non riuscito (${res.status}): ${corpo.slice(0, 200)}`,
      "API"
    );
  }
}

// Eliminazione IDEMPOTENTE: 404/410 significano "gia' assente", che per una
// delete e' un successo. Senza questo, un retry dopo un errore di rete
// lascerebbe lo stato sporco per sempre.
export async function deleteEvent(
  calendarId: string,
  eventId: string,
  budgetMs = 8000
): Promise<boolean> {
  const res = await richiestaGoogle(
    `${apiBase()}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", budgetMs }
  );
  if (res.ok || res.status === 404 || res.status === 410) return true;
  const corpo = await res.text();
  throw new ErroreGoogle(
    res.status,
    `Eliminazione evento non riuscita (${res.status}): ${corpo.slice(0, 200)}`,
    "API"
  );
}
