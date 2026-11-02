import "server-only";
import { db } from "./db";
import { cookies } from "next/headers";

const JWT_SECRET_FALLBACK = "dev-secret-change-in-production";
const SESSION_COOKIE = "session";

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
  iat: number;
  exp: number;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);
  return Buffer.from(combined).toString("base64");
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const combined = Buffer.from(hash, "base64");
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const key = await crypto.subtle.importKey(
      "raw",
      data,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const hashResult = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    return Buffer.from(hashResult).equals(storedHash);
  } catch {
    return false;
  }
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
    .prepare(`SELECT id, nome, email, password_hash, ruolo, attivo, data_creazione, ultimo_accesso FROM operatori WHERE email = ?`)
    .get(email);
  if (!row) return null;
  return row as unknown as OperatorWithHash;
}

export async function authenticateOperator(email: string, password: string): Promise<Operator | null> {
  const operator = await getOperatorByEmail(email);
  if (!operator || !operator.attivo) return null;
  const valid = await verifyPassword(password, operator.password_hash);
  if (!valid) return null;
  await db
    .prepare(`UPDATE operatori SET ultimo_accesso = @ts WHERE id = @id`)
    .run({ ts: nowISO(), id: operator.id });
  const { password_hash, ...op } = operator;
  return op;
}

export async function getOperatorById(id: string): Promise<Operator | null> {
  const row = await db
    .prepare(`SELECT id, nome, email, ruolo, attivo, data_creazione, ultimo_accesso FROM operatori WHERE id = ?`)
    .get(id);
  if (!row) return null;
  return row as unknown as Operator;
}

export async function createSession(operator: Operator): Promise<string> {
  const token = await createJWT({
    operatorId: operator.id,
    email: operator.email,
    ruolo: operator.ruolo,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.ruolo !== "admin") throw new Error("Accesso riservato agli amministratori");
  return session;
}

export async function getAllOperators(): Promise<Operator[]> {
  const rows = await db
    .prepare(`SELECT id, nome, email, ruolo, attivo, data_creazione, ultimo_accesso FROM operatori ORDER BY data_creazione DESC`)
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
    params.password_hash = password_hash;
  }

  if (fields.length === 0) return;

  await db.prepare(`UPDATE operatori SET ${fields.join(", ")} WHERE id = @id`).run(params);
}

export async function deactivateOperator(id: string): Promise<void> {
  await db.prepare(`UPDATE operatori SET attivo = 0 WHERE id = @id`).run({ id });
}

export async function activateOperator(id: string): Promise<void> {
  await db.prepare(`UPDATE operatori SET attivo = 1 WHERE id = @id`).run({ id });
}

export async function deleteOperator(id: string): Promise<void> {
  await db.prepare(`DELETE FROM operatori WHERE id = @id`).run({ id });
}

export { verifyJWT };

export type { Operator, SessionPayload };