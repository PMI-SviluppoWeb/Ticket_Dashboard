import PostalMime from "postal-mime";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// ===========================================================================
// OAuth 2.0 (PKCE) + Gmail API per il collegamento account Gmail delle caselle.
//
// Zero-configuration per l'utente: nessuna porta, nessun server, nessuna
// password. L'utente clicca, accetta su Google, e l'app memorizza il Refresh
// Token (cifrato con ENCRYPTION_KEY) nel database. Il worker di polling
// (lib/gmail-worker.ts) lo riusa per ottenere Access Token effimeri.
//
// REGOLA DI MANUTENZIONE: ogni fetch verso Google passa da gmailFetch() con
// cache "no-store" — stesso motivo di lib/google-calendar.ts (Next.js 14
// patcha fetch e ne cacherebbe le risposte su disco, congelando token e
// liste per sempre).
//
// NO `server-only`: questo modulo deve girare sia nelle route Next sia nel
// worker Node separato (come lib/cifratura.ts e lib/turso-client.ts).
// ===========================================================================

const AUTH_URL_DEFAULT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL_DEFAULT = "https://oauth2.googleapis.com/token";
const API_BASE_DEFAULT = "https://www.googleapis.com/gmail/v1/users/me";

// Un solo scope copre tutto: lettura (messages.list), marcatura letta
// (messages.modify) e invio (messages.send).
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

function authUrl(): string {
  return process.env.GOOGLE_OAUTH_URL || AUTH_URL_DEFAULT;
}

function tokenUrl(): string {
  return process.env.GOOGLE_OAUTH_TOKEN_URL || TOKEN_URL_DEFAULT;
}

function apiBase(): string {
  return process.env.GMAIL_API_BASE || API_BASE_DEFAULT;
}

// Base dell'app per costruire il Redirect URI. In produzione va impostata
// sul dominio reale (es. https://support.azienda.it) — in dev il default.
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

export function redirectUri(): string {
  return `${appBaseUrl()}/api/gmail/callback`;
}

// Le env usate per i client credenziali OAuth sono SEPARATE da quelle del
// service account del Calendar: stesso progetto Google va bene, ma non si
// riusano GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY (RS256, altro flusso).
export function credenzialiGmailPresenti(): boolean {
  return Boolean(process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET);
}

export class ErroreGmail extends Error {
  status: number;
  constructor(status: number, messaggio: string) {
    super(messaggio);
    this.name = "ErroreGmail";
    this.status = status;
  }
}

async function gmailFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const opts: RequestInit = { ...init, cache: "no-store" };
  if (opts.cache !== "no-store") {
    throw new Error("gmailFetch: cache 'no-store' obbligatorio su ogni chiamata Google.");
  }
  return fetch(url, opts);
}

// ---------------------------------------------------------------------------
// Flusso di autorizzazione (costruzione URL + scambio codice)
// ---------------------------------------------------------------------------

// PKCE (RFC 7636): il code_verifier resta nel browser (cookie) e viene
// riportato allo scambio. Senza, un codice intercettato non sarebbe
// spendibile da solo — difesa in profondita' in piu' rispetto allo state.
export function generaState(): string {
  return cryptoRandom(32);
}

export function generaCodeVerifier(): string {
  return cryptoRandom(32);
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

function cryptoRandom(byte: number): string {
  const buf = Buffer.alloc(byte);
  // Web Crypto e' disponibile sia in Node 20 sia nel runtime Next.
  globalThis.crypto.getRandomValues(buf);
  return buf.toString("base64url");
}

export async function costruisciUrlConnect(state: string, codeVerifier: string): Promise<string> {
  const challenge = await codeChallengeS256(codeVerifier);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // prompt=consent obbliga Google a restituire SEMPRE un refresh_token:
    // senza, in una ri-autorizzazione il refresh token potrebbe mancare e la
    // casella resterebbe senza credenziali di lunga durata.
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${authUrl()}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function richiediToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await gmailFetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new ErroreGmail(
      res.status,
      data.error_description ?? data.error ?? `Scambio token fallito (HTTP ${res.status}).`
    );
  }
  if (!data.access_token) {
    throw new ErroreGmail(502, "Risposta di Google senza access_token.");
  }
  return data;
}

// Scambio del codice di autorizzazione (solo in fase di collegamento).
export async function scambiaCodice(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  return richiediToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET ?? "",
    code_verifier: codeVerifier,
  });
}

// ---------------------------------------------------------------------------
// Access token dal Refresh Token, con cache in memoria per casella
// ---------------------------------------------------------------------------

const MARGINE_MS = 60_000; // rinnova 60s prima della scadenza

// Cache processuale: il worker (e le route) riusano lo stesso access token
// fino a 60s prima della scadenza, evitando un refresh grant a ogni messaggio.
const cacheAccess = new Map<string, { token: string; scadenza: number }>();

export async function ottieniAccessToken(refreshTokenDecifrato: string): Promise<string> {
  const cached = cacheAccess.get(refreshTokenDecifrato);
  if (cached && cached.scadenza > Date.now() + MARGINE_MS) {
    return cached.token;
  }
  const data = await richiediToken({
    grant_type: "refresh_token",
    refresh_token: refreshTokenDecifrato,
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET ?? "",
  });
  const scadenza = Date.now() + (data.expires_in ?? 3600) * 1000;
  cacheAccess.set(refreshTokenDecifrato, { token: data.access_token, scadenza });
  return data.access_token;
}

export function invalidaAccessToken(refreshTokenDecifrato?: string): void {
  if (refreshTokenDecifrato) cacheAccess.delete(refreshTokenDecifrato);
  else cacheAccess.clear();
}

// ---------------------------------------------------------------------------
// Endpoint Gmail API
// ---------------------------------------------------------------------------

async function gmailApi(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return gmailFetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

async function leggiErroreApi(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({})) as {
    error?: { message?: string };
  };
  return data.error?.message ?? `Gmail API HTTP ${res.status}`;
}

export interface ProfiloGmail {
  emailAddress: string;
  historyId: string;
}

// Profilo della casella collegata: usato al callback per l'indirizzo email.
export async function profiloGmail(accessToken: string): Promise<ProfiloGmail> {
  const res = await gmailApi(accessToken, "/profile");
  if (!res.ok) throw new ErroreGmail(res.status, await leggiErroreApi(res));
  const data = (await res.json()) as ProfiloGmail;
  if (!data.emailAddress) throw new ErroreGmail(502, "Profilo Gmail senza emailAddress.");
  return data;
}

export interface MessaggioGmail {
  id: string;
  threadId?: string;
}

// users.messages.list con filtro "is:unread" (+ opzionale "after:<epoch>").
// `dopoEpoch` e' il high water mark salvato al collegamento: impedisce di
// importare le email non lette gia' presenti nella casella al primo ciclo.
export async function listaNonLette(
  accessToken: string,
  dopoEpoch?: number | null
): Promise<MessaggioGmail[]> {
  const q = dopoEpoch
    ? `is:unread after:${Math.floor(dopoEpoch)}`
    : "is:unread";
  const out: MessaggioGmail[] = [];
  let pageToken: string | undefined;
  // Limite difensivo: al massimo 5 pagine (500 msg) per ciclo, il resto
  // arriva ai cicli successivi (le email restano non lette finche' non
  // processate).
  for (let pagina = 0; pagina < 5; pagina++) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gmailApi(accessToken, `/messages?${params.toString()}`);
    if (!res.ok) throw new ErroreGmail(res.status, await leggiErroreApi(res));
    const data = (await res.json()) as {
      messages?: MessaggioGmail[];
      nextPageToken?: string;
    };
    if (data.messages?.length) out.push(...data.messages);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export interface EmailScaricata {
  messageId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  date?: Date;
  headers?: Record<string, string>;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    contentType?: string;
    contentBase64: string;
  }>;
}

// Scarica il messaggio completo (format=raw) e lo parse con PostalMime —
// stessa libreria usata dal worker IMAP, stesso identico output.
export async function scaricaMessaggio(
  accessToken: string,
  id: string
): Promise<EmailScaricata | null> {
  const res = await gmailApi(accessToken, `/messages/${encodeURIComponent(id)}?format=raw`);
  if (res.status === 404) return null; // cancellato tra list e fetch: salta
  if (!res.ok) throw new ErroreGmail(res.status, await leggiErroreApi(res));
  const data = (await res.json()) as { raw?: string; id: string; labelIds?: string[] };
  if (!data.raw) return null;
  const raw = Buffer.from(data.raw, "base64url");
  const parsed = await PostalMime.parse(raw);

  const headers: Record<string, string> = {};
  const headerUtili = new Set([
    "auto-submitted",
    "precedence",
    "list-unsubscribe",
    "in-reply-to",
    "references",
    "message-id",
  ]);
  for (const h of parsed.headers ?? []) {
    const chiave = String(h.key ?? "").toLowerCase();
    if (!headerUtili.has(chiave)) continue;
    headers[chiave] = Array.isArray(h.value)
      ? h.value.join(" ")
      : String(h.value ?? "");
  }

  const attachments = (parsed.attachments ?? [])
    .filter((a) => a && a.content != null && a.filename)
    .map((a) => {
      const contenuto = a.content;
      const buffer =
        typeof contenuto === "string"
          ? Buffer.from(contenuto)
          : Buffer.from(new Uint8Array(contenuto as ArrayBuffer));
      return {
        filename: String(a.filename),
        contentType: a.mimeType ?? undefined,
        contentBase64: buffer.toString("base64"),
        dimensione: buffer.length,
      };
    })
    .filter((a) => a.dimensione > 0 && a.dimensione <= 10 * 1024 * 1024)
    .map(({ dimensione: _dimensione, ...rest }) => rest);

  return {
    messageId: parsed.messageId ?? `<${id}@gmail>`,
    from: parsed.from?.address ?? "",
    fromName: parsed.from?.name ?? undefined,
    subject: parsed.subject ?? "(nessun oggetto)",
    body: parsed.text ?? "",
    bodyHtml: parsed.html ?? undefined,
    // PostalMime tipizza `date` come stringa: il webhook la vuole ISO.
    date: parsed.date ? new Date(parsed.date) : undefined,
    headers,
    inReplyTo: headers["in-reply-to"],
    references: headers["references"],
    attachments,
  };
}

// Rimuove la label UNREAD: la email smette di comparire in "is:unread" e non
// viene riesaminata ai cicli successivi (equivale al \Seen dell'IMAP).
export async function segnaLetta(accessToken: string, id: string): Promise<void> {
  const res = await gmailApi(accessToken, `/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  if (!res.ok) throw new ErroreGmail(res.status, await leggiErroreApi(res));
}

// Invio via API (usato da lib/email.ts per le caselle Gmail, al posto di
// SMTP). Supporta allegati: con allegati si costruisce un multipart/mixed,
// altrimenti un MIME testuale puro. Il tutto in base64url (campo "raw").
export async function inviaEmailGmail(
  accessToken: string,
  opts: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    attachments?: { filename: string; path: string }[];
    messageId?: string;
    inReplyTo?: string | null;
    references?: string[];
  }
): Promise<void> {
  const headers = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
  ];
  if (opts.from) headers.unshift(`From: ${opts.from}`);
  if (opts.messageId) headers.push(`Message-ID: ${opts.messageId}`);
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references && opts.references.length > 0) {
    headers.push(`References: ${opts.references.join(" ")}`);
  }

  let mime: string;
  if (opts.attachments?.length) {
    // Boundary solo alfanumerici: RFC 2046 la richiede senza trattini
    // ambigui in testa.
    const boundary = `gmailsend${cryptoRandom(16)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parti: string[] = [`--${boundary}`];
    parti.push('Content-Type: text/html; charset="utf-8"');
    parti.push("Content-Transfer-Encoding: 8bit");
    parti.push("", opts.html);
    for (const att of opts.attachments) {
      // Legge dal disco a ogni invio: gli allegati vivono in uploads e non
      // vengono cachati (altrimenti un file sostituito resterebbe vecchio).
      const dati = readFileSync(att.path);
      parti.push(`--${boundary}`);
      parti.push(`Content-Type: application/octet-stream; name="${basename(att.filename)}"`);
      parti.push("Content-Transfer-Encoding: base64");
      parti.push(`Content-Disposition: attachment; filename="${basename(att.filename)}"`);
      parti.push("", dati.toString("base64").replace(/(.{76})/g, "$1\r\n"));
    }
    parti.push(`--${boundary}--`, "");
    mime = [...headers, "", parti.join("\r\n")].join("\r\n");
  } else {
    headers.push('Content-Type: text/html; charset="utf-8"');
    mime = [...headers, "", opts.html].join("\r\n");
  }

  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const res = await gmailApi(accessToken, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new ErroreGmail(res.status, await leggiErroreApi(res));
}
