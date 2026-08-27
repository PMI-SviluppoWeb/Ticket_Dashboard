import { createClient, type InArgs } from "@libsql/client";
import "server-only";

const url = process.env.TURSO_DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "Variabile TURSO_DATABASE_URL mancante. Configura il file .env.local con l'URL del database Turso."
  );
}

export const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id                   TEXT PRIMARY KEY,
  numero               TEXT NOT NULL UNIQUE,
  cliente              TEXT NOT NULL,
  contatto             TEXT NOT NULL,
  telefono             TEXT,
  email                TEXT,
  modulo_software      TEXT NOT NULL,
  sommario_problema    TEXT NOT NULL,
  descrizione_dettagliata TEXT NOT NULL,
  priorita             TEXT NOT NULL CHECK (priorita IN ('BASSA','MEDIA','ALTA')),
  stato                TEXT NOT NULL DEFAULT 'NUOVO'
                       CHECK (stato IN ('NUOVO','IN_CORSO','RISOLTO','CHIUSO')),
  note                 TEXT,
  operatore            TEXT,
  data_creazione       TEXT NOT NULL,
  data_aggiornamento   TEXT NOT NULL,
  data_chiusura        TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_stato     ON tickets (stato);
CREATE INDEX IF NOT EXISTS idx_tickets_priorita  ON tickets (priorita);
CREATE INDEX IF NOT EXISTS idx_tickets_data      ON tickets (data_creazione);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ruolo          TEXT NOT NULL CHECK (ruolo IN ('user','assistant')),
  contenuto      TEXT NOT NULL,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages (ticket_id);

CREATE TABLE IF NOT EXISTS technical_notes (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  titolo         TEXT NOT NULL,
  problema       TEXT NOT NULL,
  soluzione      TEXT NOT NULL,
  operatore      TEXT,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_technical_notes_ticket ON technical_notes (ticket_id);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id             TEXT PRIMARY KEY,
  nome_file      TEXT NOT NULL,
  dimensione     INTEGER NOT NULL,
  pagine         INTEGER,
  testo          TEXT NOT NULL,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_nome ON knowledge_docs (nome_file);
`;

const schemaReady = (async () => {
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
})().catch((err) => {
  console.error("Errore nell'inizializzazione dello schema su Turso:", err);
});

// Adapter asincrono che replica l'interfaccia di better-sqlite3
// (db.prepare(...).get/all/run) usando il client @libsql/client.
// Le query SQL restano in dialetto SQLite; i parametri nominativi
// "@nome" vengono convertiti in ":nome" (sintassi libSQL).
type ParamValue = string | number | boolean | null;
type Params = InArgs | ParamValue;

type Row = Record<string, unknown>;

function toRow(r: unknown): Row {
  return r as Row;
}

// better-sqlite3 accetta anche uno scalare come binding posizionale
// (es. db.prepare("... WHERE id = ?").get(id)); qui lo normalizziamo.
function normalizeArgs(params?: Params): InArgs | undefined {
  if (params === undefined) return undefined;
  if (Array.isArray(params) || (params !== null && typeof params === "object")) {
    return params;
  }
  return [params];
}

function prepare(sql: string) {
  const sqlFixed = sql.replace(/@([A-Za-z0-9_]+)/g, ":$1");
  return {
    async get(params?: Params): Promise<Row | undefined> {
      await schemaReady;
      const result = await client.execute({ sql: sqlFixed, args: normalizeArgs(params) });
      const row = result.rows[0];
      return row ? toRow(row) : undefined;
    },
    async all(params?: Params): Promise<Row[]> {
      await schemaReady;
      const result = await client.execute({ sql: sqlFixed, args: normalizeArgs(params) });
      return result.rows.map(toRow);
    },
    async run(params?: Params): Promise<{ changes: number }> {
      await schemaReady;
      const result = await client.execute({ sql: sqlFixed, args: normalizeArgs(params) });
      return { changes: result.rowsAffected };
    },
  };
}

export const db = {
  prepare,
  async exec(sql: string): Promise<void> {
    await schemaReady;
    await client.execute(sql);
  },
  async ping(): Promise<void> {
    await schemaReady;
  },
};
