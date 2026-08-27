// Migrazione one-shot: copia i dati da data/tickets.db (SQLite) a Turso (libSQL).
// Preserva gli id esistenti, quindi URL e riferimenti restano validi.
//
// Uso: node scripts/migrate-sqlite-to-turso.cjs
// Richiede che .env.local contenga TURSO_DATABASE_URL e TURSO_AUTH_TOKEN reali.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { createClient } = require("@libsql/client");

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
`;

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || "";
  const token = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || "";

  if (!url || url.includes("ORG") || !token || token.includes("eyJ...")) {
    console.error(
      "Mancano TURSO_DATABASE_URL / TURSO_AUTH_TOKEN reali in .env.local.\n" +
        "Crea il database su turso.tech, ottieni URL e token e riempi il file, poi rilancia."
    );
    process.exit(1);
  }

  const sqlitePath = process.argv[2] || path.join(process.cwd(), "data", "tickets.db");
  if (!fs.existsSync(sqlitePath)) {
    console.error(`File SQLite non trovato: ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const remote = createClient({ url, authToken: token || undefined });

  console.log("Creazione/verifica schema su Turso...");
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await remote.execute(stmt);
  }

  const existing = await remote.execute("SELECT COUNT(*) AS n FROM tickets");
  if (existing.rows[0].n > 0) {
    console.error(
      `Turso contiene già ${existing.rows[0].n} ticket: interrompo per evitare duplicati.`
    );
    process.exit(1);
  }

  const tickets = sqlite
    .prepare(
      `SELECT id, numero, cliente, contatto, telefono, email, modulo_software,
              sommario_problema, descrizione_dettagliata, priorita, stato, note, operatore,
              data_creazione, data_aggiornamento, data_chiusura
       FROM tickets ORDER BY rowid ASC`
    )
    .all();

  const messages = sqlite
    .prepare(
      `SELECT id, ticket_id, ruolo, contenuto, data_creazione
       FROM messages ORDER BY rowid ASC`
    )
    .all();

  const notes = sqlite
    .prepare(
      `SELECT id, ticket_id, titolo, problema, soluzione, operatore, data_creazione
       FROM technical_notes ORDER BY rowid ASC`
    )
    .all();

  console.log(`Da migrare: ${tickets.length} ticket, ${messages.length} messaggi, ${notes.length} note tecniche.`);

  for (const t of tickets) {
    await remote.execute({
      sql: `INSERT INTO tickets (
        id, numero, cliente, contatto, telefono, email, modulo_software,
        sommario_problema, descrizione_dettagliata, priorita, stato, note, operatore,
        data_creazione, data_aggiornamento, data_chiusura
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        t.id, t.numero, t.cliente, t.contatto, t.telefono, t.email, t.modulo_software,
        t.sommario_problema, t.descrizione_dettagliata, t.priorita, t.stato, t.note, t.operatore,
        t.data_creazione, t.data_aggiornamento, t.data_chiusura,
      ],
    });
  }

  for (const m of messages) {
    await remote.execute({
      sql: `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione)
            VALUES (?,?,?,?,?)`,
      args: [m.id, m.ticket_id, m.ruolo, m.contenuto, m.data_creazione],
    });
  }

  for (const n of notes) {
    await remote.execute({
      sql: `INSERT INTO technical_notes (id, ticket_id, titolo, problema, soluzione, operatore, data_creazione)
            VALUES (?,?,?,?,?,?,?)`,
      args: [n.id, n.ticket_id, n.titolo, n.problema, n.soluzione, n.operatore, n.data_creazione],
    });
  }

  const [tCount, mCount, nCount] = await Promise.all([
    remote.execute("SELECT COUNT(*) AS n FROM tickets"),
    remote.execute("SELECT COUNT(*) AS n FROM messages"),
    remote.execute("SELECT COUNT(*) AS n FROM technical_notes"),
  ]);
  console.log("Migrazione completata:");
  console.log(`  tickets:         ${tCount.rows[0].n}`);
  console.log(`  messages:        ${mCount.rows[0].n}`);
  console.log(`  technical_notes: ${nCount.rows[0].n}`);

  sqlite.close();
  remote.close();
}

main().catch((err) => {
  console.error("Migrazione fallita:", err);
  process.exit(1);
});
