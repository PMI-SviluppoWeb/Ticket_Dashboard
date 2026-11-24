import "server-only";
import { db } from "./db";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const JWT_SECRET_FALLBACK = "dev-secret-change-in-production";
const SESSION_COOKIE = "session";

// PBKDF2: 600k iterazioni (OWASP 2024) per gli hash nuovi. Gli hash storici
// (100k) restano validi e vengono ricalcolati automaticamente al primo login
// riuscito, senza richiedere un reset password a nessuno.
const ITERAZIONI_PBKDF2 = 600_000;
const ITERAZIONI_LEGACY = 100_000;
const PREFISSO_HASH = "pbkdf2";

// Rate limit login: dopo N fallimenti per email+IP scatta un blocco temporaneo.
const MAX_TENTATIVI_LOGIN = 5;
const DURATA_BLOCCO_MS = 15 * 60 * 1000;


// Il secret viene letto alla prima use (sign/verify), non al load del modulo:
// un throw a livello di modulo in produzione rischia di far fallire l'init di
// middleware/rotte in modi non controllati. Qui invece ogni firma e ogni
// verifica passa da qui, quindi senza JWT_SECRET nessuna sessione puo' essere
// creata ne' validata: fail-closed, mai il secret di sviluppo in produzione.
let secretMemo: string | null = null;

function jwtSecret(): string {
  if (secretMemo) return secretMemo;
  const secret = process.env.JWT_SECRET;
  if (secret) {
    secretMemo = secret;
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET non impostata: in produzione le sessioni sarebbero forgiabili con il secret di sviluppo. Imposta JWT_SECRET in .env e riavvia il server."
    );
  }
  console.warn("[auth] JWT_SECRET mancante: uso il secret di sviluppo (solo locale).");
  secretMemo = JWT_SECRET_FALLBACK;
  return secretMemo;
}

let cryptoKey: CryptoKey | null = null;

async function getCryptoKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey;
  cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cryptoKey;
}

interface Operator {
  id: string;
  nome: string;
  email: string;
  ruolo: "admin" | "operatore";
  attivo: boolean;
  versione_sessione?: number;
  data_creazione?: string;
  ultimo_accesso?: string | null;
}

interface OperatorWithHash extends Operator {
  password_hash: string;
}

interface SessionPayload {
  operatorId: string;
  email: string;
  ruolo: "admin" | "operatore";
  versione_sessione: number;
  iat: number;
  exp: number;
}

function confrontoCostante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derivaHash(
  password: string,
  salt: Uint8Array,
  iterazioni: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: iterazioni, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivaHash(password, salt, ITERAZIONI_PBKDF2);
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt);
  combined.set(hash, salt.length);
  return `${PREFISSO_HASH}$${ITERAZIONI_PBKDF2}$${Buffer.from(combined).toString("base64")}`;
}

function analizzaHash(hash: string): {
  iterazioni: number;
  salt: Uint8Array;
  atteso: Uint8Array;
} | null {
  try {
    let iterazioni = ITERAZIONI_LEGACY;
    let payload = hash;
    if (hash.startsWith(PREFISSO_HASH + "$")) {
      const parti = hash.split("$");
      if (parti.length !== 3) return null;
      iterazioni = Number(parti[1]);
      payload = parti[2];
      if (!Number.isFinite(iterazioni) || iterazioni <= 0) return null;
    }
    const combined = Buffer.from(payload, "base64");
    if (combined.length <= 16) return null;
    return {
      iterazioni,
      salt: new Uint8Array(combined.subarray(0, 16)),
      atteso: new Uint8Array(combined.subarray(16)),
    };
  } catch {
    return null;
  }
}

// Verifica e dice anche se l'hash va ricalcolato (formato vecchio o iterazioni
// inferiori all'attuale): serve al rehash trasparente al login.
async function verifyPasswordDettaglio(
  password: string,
  hash: string
): Promise<{ valido: boolean; daRicalcolare: boolean }> {
  const analizzato = analizzaHash(hash);
  if (!analizzato) return { valido: false, daRicalcolare: false };
  const calcolato = await derivaHash(password, analizzato.salt, analizzato.iterazioni);
  const valido = confrontoCostante(calcolato, analizzato.atteso);
  return {
    valido,
    daRicalcolare: valido && analizzato.iterazioni < ITERAZIONI_PBKDF2,
  };
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await verifyPasswordDettaglio(password, hash)).valido;
}

// Hash fittizio per le email inesistenti: senza, un attaccante distingue
// "email non registrata" (risposta immediata) da "password sbagliata" (PBKDF2).
// Calcolato una volta per processo.
let hashFittizio: Promise<string> | null = null;
function getHashFittizio(): Promise<string> {
  if (!hashFittizio) {
    hashFittizio = hashPassword(crypto.randomUUID());
  }
  return hashFittizio;
}


async function createJWT(payload: Omit<SessionPayload, "iat" | "exp">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const encodedSignature = Buffer.from(signature).toString("base64url");
  return `${data}.${encodedSignature}`;
}

async function verifyJWT(token: string): Promise<SessionPayload | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const data = `${header}.${payload}`;
    const key = await getCryptoKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(data)
    );
    if (!valid) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function createOperator(
  nome: string,
  email: string,
  password: string,
  ruolo: "admin" | "operatore" = "operatore"
): Promise<Operator> {
  const password_hash = await hashPassword(password);
  const id = crypto.randomUUID();
  const ts = nowISO();
  await db
    .prepare(
      `INSERT INTO operatori (id, nome, email, password_hash, ruolo, attivo, data_creazione)
       VALUES (@id, @nome, @email, @password_hash, @ruolo, 1, @data_creazione)`
    )
    .run({ id, nome, email, password_hash, ruolo, data_creazione: ts });
  return { id, nome, email, ruolo, attivo: true };
}

export async function getOperatorByEmail(email: string): Promise<OperatorWithHash | null> {
  const row = await db
    .prepare(`SELECT id, nome, email, password_hash, ruolo, attivo, versione_sessione, data_creazione, ultimo_accesso FROM operatori WHERE email = ?`)
    .get(email);
  if (!row) return null;
  return row as unknown as OperatorWithHash;
}

export async function authenticateOperator(email: string, password: string): Promise<Operator | null> {
  const operator = await getOperatorByEmail(email);

  // Email inesistente: si esegue comunque un PBKDF2 su un hash fittizio, cosi'
  // il tempo di risposta non rivela se l'account esiste.
  if (!operator) {
    await verifyPassword(password, await getHashFittizio());
    return null;
  }

  const esito = await verifyPasswordDettaglio(password, operator.password_hash);
  if (!esito.valido) return null;
  // La password e' corretta ma l'account e' disattivato: stesso messaggio
  // generico della password sbagliata, nessun dettaglio in piu'.
  if (!operator.attivo) return null;

  // Rehash trasparente: porta gli hash storici a 600k iterazioni.
  if (esito.daRicalcolare) {
    try {
      const nuovoHash = await hashPassword(password);
      await db
        .prepare(`UPDATE operatori SET password_hash = @hash WHERE id = @id`)
        .run({ hash: nuovoHash, id: operator.id });
    } catch (err) {
      console.error("Rehash password fallito:", operator.id, err);
    }
  }

  await db
    .prepare(`UPDATE operatori SET ultimo_accesso = @ts WHERE id = @id`)
    .run({ ts: nowISO(), id: operator.id });
  const { password_hash, ...op } = operator;
  return op;
}

export async function getOperatorById(id: string): Promise<Operator | null> {
  const row = await db
    .prepare(`SELECT id, nome, email, ruolo, attivo, versione_sessione, data_creazione, ultimo_accesso FROM operatori WHERE id = ?`)
    .get(id);
  if (!row) return null;
  return row as unknown as Operator;
}

export async function createSession(operator: Operator): Promise<string> {
  // La versione si rilegge dal DB: un Operatore passato dal chiamante puo'
  // essere una fotografia precedente, e un JWT con versione vecchia verrebbe
  // revocato subito dal controllo di richiediOperatore.
  const riga = await db
    .prepare(`SELECT versione_sessione FROM operatori WHERE id = ?`)
    .get(operator.id);
  const versione = Number(riga?.versione_sessione ?? operator.versione_sessione ?? 0);

  const token = await createJWT({
    operatorId: operator.id,
    email: operator.email,
    ruolo: operator.ruolo,
    versione_sessione: versione,
  });
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyJWT(token);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Non autenticato");
  // Le pagine server non passano dal middleware nel controllo di attivo e
  // versione: si rilegge l'operatore come fa richiediOperatore per le API.
  const operatore = await getOperatorById(session.operatorId);
  if (!operatore || !operatore.attivo) throw new Error("Non autenticato");
  if ((operatore.versione_sessione ?? 0) !== (session.versione_sessione ?? 0)) {
    throw new Error("Non autenticato");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.ruolo !== "admin") throw new Error("Accesso riservato agli amministratori");
  return session;
}

// ---------------------------------------------------------------------------
// Controllo sessione per le route API
// ---------------------------------------------------------------------------

export type EsitoRichiesta =
  | { ok: true; operatore: Operator }
  | { ok: false; risposta: NextResponse };

function leggiCookie(request: Request, nome: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const parte of raw.split(";")) {
    const pezzo = parte.trim();
    const uguale = pezzo.indexOf("=");
    if (uguale < 0) continue;
    if (pezzo.slice(0, uguale) === nome) {
      try {
        return decodeURIComponent(pezzo.slice(uguale + 1));
      } catch {
        return pezzo.slice(uguale + 1);
      }
    }
  }
  return null;
}

export function ipRichiesta(request: Request): string {
  const inoltrato = request.headers.get("x-forwarded-for");
  if (inoltrato) return inoltrato.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "sconosciuto";
}

// Unico ingresso per le route: legge il cookie, verifica il JWT e rilegge
// l'operatore dal DB per controllare `attivo` e `versione_sessione`. Sostituisce
// le intestazioni x-operator-* che il middleware non emette piu' (forgiabili
// se il middleware venisse aggirato).
export async function richiediOperatore(
  request: Request,
  opts: { ruolo?: "admin" } = {}
): Promise<EsitoRichiesta> {
  const token = leggiCookie(request, SESSION_COOKIE);
  if (!token) {
    return { ok: false, risposta: NextResponse.json({ error: "Non autenticato." }, { status: 401 }) };
  }

  const payload = await verifyJWT(token);
  if (!payload) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "Sessione non valida o scaduta." }, { status: 401 }),
    };
  }

  const operatore = await getOperatorById(payload.operatorId);
  if (!operatore || !operatore.attivo) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "Sessione non piu' valida." }, { status: 401 }),
    };
  }

  if ((operatore.versione_sessione ?? 0) !== (payload.versione_sessione ?? 0)) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "Sessione revocata." }, { status: 401 }),
    };
  }

  if (opts.ruolo === "admin" && operatore.ruolo !== "admin") {
    return {
      ok: false,
      risposta: NextResponse.json(
        { error: "Accesso riservato agli amministratori." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, operatore };
}

// ---------------------------------------------------------------------------
// Rate limit login (email + IP)
// ---------------------------------------------------------------------------

function chiaveTentativo(email: string, ip: string): string {
  return `${email.trim().toLowerCase()}|${ip}`;
}

export async function verificaTentativiLogin(
  email: string,
  ip: string
): Promise<{ consentito: boolean; secondiRimanenti: number }> {
  const chiave = chiaveTentativo(email, ip);
  const riga = await db
    .prepare(`SELECT tentativi, bloccato_fino FROM tentativi_login WHERE chiave = ?`)
    .get(chiave) as unknown as { tentativi?: number; bloccato_fino?: string | null } | undefined;
  if (!riga) return { consentito: true, secondiRimanenti: 0 };

  const bloccatoFino = riga.bloccato_fino ?? null;
  if (bloccatoFino) {
    const fino = Date.parse(bloccatoFino);
    const adesso = Date.now();
    if (Number.isFinite(fino) && fino > adesso) {
      return { consentito: false, secondiRimanenti: Math.ceil((fino - adesso) / 1000) };
    }
    // Blocco scaduto: il conteggio riparte da zero.
    await db
      .prepare(`UPDATE tentativi_login SET tentativi = 0, bloccato_fino = NULL WHERE chiave = ?`)
      .run(chiave);
  }
  return { consentito: true, secondiRimanenti: 0 };
}

export async function registraTentativoFallito(email: string, ip: string): Promise<void> {
  const chiave = chiaveTentativo(email, ip);
  const ts = nowISO();
  const blocco = new Date(Date.now() + DURATA_BLOCCO_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO tentativi_login (chiave, email, ip, tentativi, bloccato_fino, ultimo_tentativo)
       VALUES (@chiave, @email, @ip, 1, NULL, @ts)
       ON CONFLICT (chiave) DO UPDATE SET
         tentativi = tentativi + 1,
         ultimo_tentativo = @ts,
         bloccato_fino = CASE WHEN tentativi + 1 >= @max THEN @blocco ELSE bloccato_fino END`
    )
    .run({ chiave, email: email.trim().toLowerCase(), ip, ts, max: MAX_TENTATIVI_LOGIN, blocco });
}

export async function azzeraTentativi(email: string, ip: string): Promise<void> {
  await db.prepare(`DELETE FROM tentativi_login WHERE chiave = ?`).run(chiaveTentativo(email, ip));
}

export async function getAllOperators(): Promise<Operator[]> {
  const rows = await db
    .prepare(`SELECT id, nome, email, ruolo, attivo, versione_sessione, data_creazione, ultimo_accesso FROM operatori ORDER BY data_creazione DESC`)
    .all();
  return rows as unknown as Operator[];
}

export async function updateOperator(
  id: string,
  data: { nome?: string; email?: string; ruolo?: "admin" | "operatore"; password?: string }
): Promise<void> {
  const fields: string[] = [];
  const params: Record<string, string> = { id };

  if (data.nome !== undefined) {
    fields.push("nome = @nome");
    params.nome = data.nome;
  }
  if (data.email !== undefined) {
    fields.push("email = @email");
    params.email = data.email;
  }
  if (data.ruolo !== undefined) {
    fields.push("ruolo = @ruolo");
    params.ruolo = data.ruolo;
  }
  if (data.password !== undefined) {
    const password_hash = await hashPassword(data.password);
    fields.push("password_hash = @password_hash");
    // Cambiare password revoca tutte le sessioni aperte dell'operatore.
    fields.push("versione_sessione = versione_sessione + 1");
    params.password_hash = password_hash;
  }

  if (fields.length === 0) return;

  await db.prepare(`UPDATE operatori SET ${fields.join(", ")} WHERE id = @id`).run(params);
}

export async function deactivateOperator(id: string): Promise<void> {
  // Incrementa la versione oltre a disattivare: anche se il controllo `attivo`
  // venisse letto da una cache, il JWT vecchio non corrisponde piu'.
  await db
    .prepare(`UPDATE operatori SET attivo = 0, versione_sessione = versione_sessione + 1 WHERE id = @id`)
    .run({ id });
}

export async function activateOperator(id: string): Promise<void> {
  await db.prepare(`UPDATE operatori SET attivo = 1 WHERE id = @id`).run({ id });
}

export async function deleteOperator(id: string): Promise<void> {
  // La pivot degli accessi alle caselle non ha cascata dal DB: si pulisce
  // prima di eliminare l'operatore.
  await db.batch([
    { sql: `DELETE FROM caselle_operatori WHERE operatore_id = @id`, params: { id } },
    { sql: `DELETE FROM operatori WHERE id = @id`, params: { id } },
  ]);
}

export { verifyJWT };

export type { Operator, SessionPayload };