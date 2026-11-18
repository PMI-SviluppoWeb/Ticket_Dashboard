import "server-only";
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db } from "./db";

// ===========================================================================
// Chiavi API macchina (bot WhatsApp su Hermes).
//
// Nel DB vive SOLO l'hash SHA-256 della chiave: il valore in chiaro viene
// restituito una volta sola alla creazione. La chiave identifica il bot, non
// un operatore: nel registro le azioni hanno origine "api".
// ===========================================================================

export type AmbitoApi = "tickets:read" | "tickets:write" | "clienti:read";

export const AMBITI_API: AmbitoApi[] = ["tickets:read", "tickets:write", "clienti:read"];

export interface ChiaveApi {
  id: string;
  nome: string;
  prefisso: string;
  ambiti: AmbitoApi[];
  attiva: boolean;
  ultimo_uso: string | null;
  data_creazione: string;
}

function hashChiave(chiave: string): string {
  return createHash("sha256").update(chiave).digest("hex");
}

function generaChiave(): string {
  return "tk_" + randomBytes(32).toString("base64url");
}

function normalizzaAmbiti(raw: unknown): AmbitoApi[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is AmbitoApi => AMBITI_API.includes(a as AmbitoApi));
}

function aTipo(row: Record<string, unknown>): ChiaveApi {
  let ambiti: AmbitoApi[] = [];
  try {
    ambiti = normalizzaAmbiti(JSON.parse(String(row.ambiti ?? "[]")));
  } catch {
    ambiti = [];
  }
  return {
    id: String(row.id),
    nome: String(row.nome),
    prefisso: String(row.prefisso),
    ambiti,
    attiva: Number(row.attiva) === 1,
    ultimo_uso: row.ultimo_uso ? String(row.ultimo_uso) : null,
    data_creazione: String(row.data_creazione),
  };
}

export async function listaChiaviApi(): Promise<ChiaveApi[]> {
  const rows = await db
    .prepare(
      `SELECT id, nome, prefisso, ambiti, attiva, ultimo_uso, data_creazione
       FROM chiavi_api ORDER BY data_creazione DESC`
    )
    .all();
  return rows.map(aTipo);
}

export async function creaChiaveApi(
  nome: string,
  ambiti: AmbitoApi[]
): Promise<{ ok: true; chiave: string; record: ChiaveApi } | { ok: false; error: string }> {
  const nomePulito = nome.trim();
  if (!nomePulito) return { ok: false, error: "Nome obbligatorio." };
  if (ambiti.length === 0) return { ok: false, error: "Seleziona almeno un ambito." };

  const chiave = generaChiave();
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO chiavi_api (id, nome, hash, prefisso, ambiti, attiva, ultimo_uso, data_creazione)
       VALUES (@id, @nome, @hash, @prefisso, @ambiti, 1, NULL, @data_creazione)`
    )
    .run({
      id,
      nome: nomePulito.slice(0, 120),
      hash: hashChiave(chiave),
      prefisso: chiave.slice(0, 10),
      ambiti: JSON.stringify(ambiti),
      data_creazione: ts,
    });

  return {
    ok: true,
    chiave,
    record: {
      id,
      nome: nomePulito.slice(0, 120),
      prefisso: chiave.slice(0, 10),
      ambiti,
      attiva: true,
      ultimo_uso: null,
      data_creazione: ts,
    },
  };
}

export async function revocaChiaveApi(id: string): Promise<boolean> {
  const res = await db.prepare(`UPDATE chiavi_api SET attiva = 0 WHERE id = ?`).run(id);
  return res.changes > 0;
}

// Rate limit in memoria (una sola istanza dell'app). Finestra mobile di 60s.
const richiestePerChiave = new Map<string, number[]>();
const LIMITE_RICHIESTE = 120;
const FINESTRA_MS = 60_000;

function superaLimite(chiaveId: string): boolean {
  const adesso = Date.now();
  const precedenti = (richiestePerChiave.get(chiaveId) ?? []).filter(
    (t) => adesso - t < FINESTRA_MS
  );
  precedenti.push(adesso);
  richiestePerChiave.set(chiaveId, precedenti);
  return precedenti.length > LIMITE_RICHIESTE;
}

export interface ChiaveAutenticata {
  id: string;
  nome: string;
  ambiti: AmbitoApi[];
}

export type EsitoChiaveApi =
  | { ok: true; chiave: ChiaveAutenticata }
  | { ok: false; risposta: NextResponse };

// Legge "Authorization: Bearer <chiave>", verifica hash + attiva + ambito.
export async function richiediChiaveApi(
  request: Request,
  ambito: AmbitoApi
): Promise<EsitoChiaveApi> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "Chiave API mancante." }, { status: 401 }),
    };
  }
  const chiave = match[1].trim();
  const row = await db
    .prepare(
      `SELECT id, nome, ambiti, attiva FROM chiavi_api WHERE hash = ?`
    )
    .get(hashChiave(chiave));

  if (!row || Number(row.attiva) !== 1) {
    return {
      ok: false,
      risposta: NextResponse.json({ error: "Chiave API non valida." }, { status: 401 }),
    };
  }

  let ambiti: AmbitoApi[] = [];
  try {
    ambiti = normalizzaAmbiti(JSON.parse(String(row.ambiti ?? "[]")));
  } catch {
    ambiti = [];
  }
  if (!ambiti.includes(ambito)) {
    return {
      ok: false,
      risposta: NextResponse.json(
        { error: `Ambito mancante: ${ambito}.` },
        { status: 403 }
      ),
    };
  }

  if (superaLimite(String(row.id))) {
    return {
      ok: false,
      risposta: NextResponse.json(
        { error: "Troppe richieste: riprova tra poco." },
        { status: 429 }
      ),
    };
  }

  // Best effort: non blocca la richiesta se l'aggiornamento fallisce.
  try {
    await db
      .prepare(`UPDATE chiavi_api SET ultimo_uso = ? WHERE id = ?`)
      .run([new Date().toISOString(), String(row.id)]);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    chiave: { id: String(row.id), nome: String(row.nome), ambiti },
  };
}

// ---------------------------------------------------------------------------
// Idempotenza
// ---------------------------------------------------------------------------

export async function rispostaIdempotente(
  chiave: string | null
): Promise<NextResponse | null> {
  if (!chiave) return null;
  const row = await db
    .prepare(`SELECT risposta FROM chiavi_idempotenza WHERE chiave = ?`)
    .get(chiave);
  if (!row) return null;
  try {
    return NextResponse.json(JSON.parse(String(row.risposta)));
  } catch {
    return null;
  }
}

export async function salvaRispostaIdempotente(
  chiave: string | null,
  payload: unknown
): Promise<void> {
  if (!chiave) return;
  try {
    await db
      .prepare(
        `INSERT INTO chiavi_idempotenza (chiave, risposta, data_creazione)
         VALUES (@chiave, @risposta, @data_creazione)
         ON CONFLICT (chiave) DO NOTHING`
      )
      .run({
        chiave,
        risposta: JSON.stringify(payload),
        data_creazione: new Date().toISOString(),
      });
  } catch {
    /* ignore */
  }
}
