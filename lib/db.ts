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
CREATE TABLE IF NOT EXISTS operatori (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  ruolo          TEXT NOT NULL DEFAULT 'operatore' CHECK (ruolo IN ('admin','operatore')),
  attivo         INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  data_creazione TEXT NOT NULL,
  ultimo_accesso TEXT
);

CREATE INDEX IF NOT EXISTS idx_operatori_email ON operatori (email);
CREATE INDEX IF NOT EXISTS idx_operatori_attivo ON operatori (attivo);

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
  data_chiusura        TEXT,
  data_inizio_lavoro   TEXT,
  tempo_stimato_minuti INTEGER,
  tempo_effettivo_minuti INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tickets_stato     ON tickets (stato);
CREATE INDEX IF NOT EXISTS idx_tickets_priorita  ON tickets (priorita);
CREATE INDEX IF NOT EXISTS idx_tickets_data      ON tickets (data_creazione);
CREATE INDEX IF NOT EXISTS idx_tickets_operatore ON tickets (operatore);

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
  links          TEXT DEFAULT '[]',
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_nome ON knowledge_docs (nome_file);

CREATE TABLE IF NOT EXISTS knowledge_links (
  id             TEXT PRIMARY KEY,
  titolo         TEXT NOT NULL,
  url            TEXT NOT NULL,
  descrizione    TEXT,
  categoria      TEXT DEFAULT 'generale',
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_categoria ON knowledge_links (categoria);

CREATE TABLE IF NOT EXISTS allegati (
  id               TEXT PRIMARY KEY,
  note_tecnica_id  TEXT NOT NULL REFERENCES technical_notes(id) ON DELETE CASCADE,
  ticket_id        TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  nome_file        TEXT NOT NULL,
  nome_originale   TEXT NOT NULL,
  dimensione       INTEGER NOT NULL,
  tipo_mime        TEXT NOT NULL,
  data_creazione   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allegati_note ON allegati (note_tecnica_id);
CREATE INDEX IF NOT EXISTS idx_allegati_ticket ON allegati (ticket_id);

CREATE TABLE IF NOT EXISTS notifications (
  id             TEXT PRIMARY KEY,
  titolo         TEXT NOT NULL,
  messaggio      TEXT NOT NULL,
  ticket_id      TEXT,
  tipo           TEXT NOT NULL DEFAULT 'info',
  letta          INTEGER NOT NULL DEFAULT 0 CHECK (letta IN (0,1)),
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_letta ON notifications (letta);
CREATE INDEX IF NOT EXISTS idx_notifications_data  ON notifications (data_creazione);

CREATE TABLE IF NOT EXISTS email_log (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,
  destinatario   TEXT NOT NULL,
  oggetto        TEXT NOT NULL,
  corpo          TEXT NOT NULL,
  stato          TEXT NOT NULL DEFAULT 'inviata' CHECK (stato IN ('inviata','errore')),
  errore         TEXT,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_log_ticket ON email_log (ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_log_tipo   ON email_log (tipo);

CREATE TABLE IF NOT EXISTS articoli (
  id             TEXT PRIMARY KEY,
  codice         TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,
  descrizione    TEXT,
  categoria      TEXT,
  prezzo         REAL,
  unita_misura   TEXT DEFAULT 'pezzo',
  attivo         INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articoli_codice   ON articoli (codice);
CREATE INDEX IF NOT EXISTS idx_articoli_categoria ON articoli (categoria);

CREATE TABLE IF NOT EXISTS clienti (
  id               TEXT PRIMARY KEY,
  ragione_sociale  TEXT NOT NULL,
  nome_contatto    TEXT,
  email            TEXT,
  telefono         TEXT,
  indirizzo        TEXT,
  citta            TEXT,
  provincia        TEXT,
  cap              TEXT,
  partita_iva      TEXT,
  note             TEXT,
  attivo           INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  data_creazione   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clienti_ragione_sociale ON clienti (ragione_sociale);
CREATE INDEX IF NOT EXISTS idx_clienti_citta           ON clienti (citta);

CREATE TABLE IF NOT EXISTS email_inbox (
  id             TEXT PRIMARY KEY,
  message_id     TEXT NOT NULL UNIQUE,
  from_email     TEXT NOT NULL,
  from_nome      TEXT,
  subject        TEXT NOT NULL,
  body_preview   TEXT,
  body_html      TEXT,
  ticket_id      TEXT,
  stato          TEXT NOT NULL DEFAULT 'processata'
                 CHECK (stato IN ('processata','errore','ignorata')),
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_inbox_message_id ON email_inbox (message_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_ticket     ON email_inbox (ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_stato      ON email_inbox (stato);
`;

const schemaReady = (async () => {
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  // Migration: add links column if missing
  try {
    await client.execute("ALTER TABLE knowledge_docs ADD COLUMN links TEXT DEFAULT '[]'");
  } catch {
    // Column already exists
  }
  // Migration: make email NOT NULL on tickets (set default for existing nulls)
  try {
    await client.execute("UPDATE tickets SET email = 'sconosciuto@placeholder.it' WHERE email IS NULL");
    await client.execute("ALTER TABLE tickets ALTER COLUMN email TEXT NOT NULL");
  } catch {
    // Column already NOT NULL or migration not needed
  }
  // Migration: fix contact data - extract phone and email from contatto field
  try {
    // Find tickets where contatto contains email or phone patterns
    const ticketsWithMixedContact = await client.execute(
      `SELECT id, contatto, telefono, email FROM tickets
       WHERE contatto LIKE '%@%'
          OR contatto LIKE '%+39%'
          OR contatto LIKE '%0039%'
          OR (contatto GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*' AND contatto != 'Non fornito')
          OR email = 'sconosciuto@placeholder.it'`
    );
    for (const row of ticketsWithMixedContact.rows) {
      const contatto = (row.contatto as string) || "";
      let telefono = (row.telefono as string) || null;
      let email = (row.email as string) || null;
      let nomeContatto = contatto;

      // Reset placeholder email
      if (email === "sconosciuto@placeholder.it") {
        email = null;
      }

      // Extract email if present in contatto
      const emailMatch = contatto.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      if (emailMatch && !email) {
        email = emailMatch[0];
        nomeContatto = nomeContatto.replace(emailMatch[0], "").replace(/[<>]/g, "").trim();
      }

      // Extract phone if present in contatto
      const phoneMatch = contatto.match(/(?:\+39|0039)\s*[\d\s\-]{8,15}|(?<!\d)[\d\s\-]{8,15}(?!\d)/);
      if (phoneMatch && !telefono) {
        telefono = phoneMatch[0].trim();
        nomeContatto = nomeContatto.replace(phoneMatch[0], "").trim();
      }

      // Clean up separators and extra spaces
      nomeContatto = nomeContatto.replace(/[-–—,;|/\\]+/g, " ").replace(/\s{2,}/g, " ").trim();
      if (!nomeContatto) nomeContatto = "Non fornito";

      await client.execute({
        sql: `UPDATE tickets SET contatto = :contatto, telefono = :telefono, email = :email WHERE id = :id`,
        args: [nomeContatto, telefono, email || null, row.id as string],
      });
    }
  } catch {
    // Migration not needed or already applied
  }
  // Migration: add time tracking columns
  try {
    await client.execute("ALTER TABLE tickets ADD COLUMN data_inizio_lavoro TEXT");
  } catch { /* Column already exists */ }
  try {
    await client.execute("ALTER TABLE tickets ADD COLUMN tempo_stimato_minuti INTEGER");
  } catch { /* Column already exists */ }
  try {
    await client.execute("ALTER TABLE tickets ADD COLUMN tempo_effettivo_minuti INTEGER");
  } catch { /* Column already exists */ }

  // Seed: popola tabella clienti con dati di esempio se vuota
  try {
    const { rows } = await client.execute("SELECT COUNT(*) AS cnt FROM clienti");
    const count = (rows[0] as Record<string, unknown>)?.cnt as number;
    if (count === 0) {
      const now = new Date().toISOString();
      await client.executeMultiple(`
        INSERT INTO clienti (id, ragione_sociale, nome_contatto, email, telefono, indirizzo, citta, provincia, cap, partita_iva, attivo, data_creazione)
        VALUES
          ('CLI-001', 'Rossi & Figli S.r.l.', 'Marco Rossi', 'marco.rossi@rossifigli.it', '02 1234567', 'Via Roma 10', 'Milano', 'MI', '20100', 'IT01234567890', 1, '${now}'),
          ('CLI-002', 'Bianchi Distribuzioni S.p.A.', 'Laura Bianchi', 'laura.bianchi@bianchidist.it', '06 9876543', 'Corso Italia 25', 'Roma', 'RM', '00100', 'IT09876543210', 1, '${now}'),
          ('CLI-003', 'Verdi Cloud Services', 'Giuseppe Verdi', 'giuseppe.verdi@verdicloud.it', '011 5551234', 'Via Torino 42', 'Torino', 'TO', '10100', 'IT11223344556', 1, '${now}'),
          ('CLI-004', 'Neri Techno Solutions', 'Francesca Neri', 'francesca.neri@neritech.it', '055 6789012', 'Via Firenze 8', 'Firenze', 'FI', '50100', 'IT66778899001', 1, '${now}'),
          ('CLI-005', 'Gialli & Partners', 'Alessandro Gialli', 'alessandro.gialli@giallipartners.it', '081 3456789', 'Via Napoli 15', 'Napoli', 'NA', '80100', 'IT55443322110', 1, '${now}');
      `);
    }
  } catch {
    // Seeding non necessario o tabella già popolata
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
