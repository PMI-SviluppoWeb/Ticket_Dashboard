import { type InArgs, type Client } from "@libsql/client";
import "server-only";
import { getTursoClient } from "./turso-client";

// Client condiviso con l'IMAP worker: la creazione vive in lib/turso-client.ts
// (senza "server-only"), qui resta solo l'inoltro.
function getClient(): Client {
  return getTursoClient();
}

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
  -- Casella che ha ricevuto il messaggio (FK soft: la casella può essere
  -- eliminata, la colonna resta come storico). Serve a rispondere con lo
  -- stesso account che ha ricevuto la mail.
  casella_id     TEXT,
  stato          TEXT NOT NULL DEFAULT 'processata'
                 CHECK (stato IN ('processata','errore','ignorata')),
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_inbox_message_id ON email_inbox (message_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_ticket     ON email_inbox (ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_stato      ON email_inbox (stato);
-- NOTA: l'indice su casella_id NON sta qui: su un DB esistente la colonna
-- casella_id non esiste ancora a questo punto (CREATE TABLE IF NOT EXISTS e'
-- un no-op) e l'indice fallirebbe, bloccando executeMultiple prima della
-- creazione di caselle_email. Viene creato DOPO l'ALTER, nel blocco
-- incondizionato di initSchema().

-- Caselle email collegate all'app: ogni riga e' un account IMAP+SMTP che
-- l'IMAP worker polla per creare ticket, oppure un account Gmail collegato
-- via OAuth 2.0 (tipo='gmail', nessuna password: refresh token CIFRATO con
-- ENCRYPTION_KEY in oauth_refresh_token_cifrata, lib/cifratura.ts).
-- predefinita = account mittente per le uscite non collegate a una mail
-- in entrata (ticket creati manualmente). Gli admin garantiscono che sia
-- al massimo una riga predefinita=1.
CREATE TABLE IF NOT EXISTS caselle_email (
  id                TEXT PRIMARY KEY,
  etichetta         TEXT NOT NULL,
  indirizzo         TEXT NOT NULL UNIQUE,
  tipo              TEXT NOT NULL DEFAULT 'imap' CHECK (tipo IN ('imap','gmail')),
  imap_host         TEXT NOT NULL,
  imap_port         INTEGER NOT NULL DEFAULT 993,
  imap_secure       INTEGER NOT NULL DEFAULT 1 CHECK (imap_secure IN (0,1)),
  smtp_host         TEXT NOT NULL,
  smtp_port         INTEGER NOT NULL DEFAULT 587,
  smtp_secure       INTEGER NOT NULL DEFAULT 0 CHECK (smtp_secure IN (0,1)),
  utente            TEXT NOT NULL,
  password_cifrata  TEXT NOT NULL,
  -- Solo per tipo='gmail': refresh token OAuth cifrato (mai in chiaro).
  oauth_refresh_token_cifrata TEXT,
  -- Solo per tipo='gmail': epoch secondi del collegamento. Funge da high
  -- water mark: la query di polling usa "is:unread after:<questo valore>"
  -- per non importare le email gia' presenti nella casella.
  gmail_da_epoch    INTEGER,
  abilitata         INTEGER NOT NULL DEFAULT 1 CHECK (abilitata IN (0,1)),
  predefinita       INTEGER NOT NULL DEFAULT 0 CHECK (predefinita IN (0,1)),
  data_creazione    TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caselle_email_abilitata ON caselle_email (abilitata);

CREATE TABLE IF NOT EXISTS progetti (
  id                 TEXT PRIMARY KEY,
  codice             TEXT NOT NULL UNIQUE,
  nome               TEXT NOT NULL,
  descrizione        TEXT,
  cliente_id         TEXT NOT NULL,
  stato              TEXT NOT NULL DEFAULT 'PIANIFICATO'
                     CHECK (stato IN ('PIANIFICATO','IN_CORSO','IN_PAUSA','COMPLETATO','ANNULLATO')),
  priorita           TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priorita IN ('BASSA','MEDIA','ALTA')),
  responsabile       TEXT,
  -- Collaboratori oltre al responsabile: array JSON di nomi (lib/persone.ts).
  -- Il responsabile NON si ripete qui: e' il primo nome, nella colonna sopra.
  persone            TEXT NOT NULL DEFAULT '[]',
  data_inizio        TEXT,
  data_fine          TEXT,
  note               TEXT,
  attivo             INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  data_creazione     TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_progetti_cliente ON progetti (cliente_id);
CREATE INDEX IF NOT EXISTS idx_progetti_stato   ON progetti (stato);

CREATE TABLE IF NOT EXISTS attivita (
  id                 TEXT PRIMARY KEY,
  progetto_id        TEXT,
  cliente_id         TEXT,
  titolo             TEXT NOT NULL,
  descrizione        TEXT,
  stato              TEXT NOT NULL DEFAULT 'DA_FARE'
                     CHECK (stato IN ('DA_FARE','IN_CORSO','COMPLETATA')),
  priorita           TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priorita IN ('BASSA','MEDIA','ALTA')),
  data_inizio        TEXT,
  data_scadenza      TEXT,
  data_completamento TEXT,
  assegnatario       TEXT,
  -- Collaboratori oltre all'assegnatario: array JSON di nomi (lib/persone.ts).
  -- L'assegnatario NON si ripete qui: Google Calendar e la dashboard leggono
  -- quella colonna, e due elenchi divergerebbero.
  persone            TEXT NOT NULL DEFAULT '[]',
  data_creazione     TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attivita_progetto ON attivita (progetto_id);
CREATE INDEX IF NOT EXISTS idx_attivita_cliente  ON attivita (cliente_id);
CREATE INDEX IF NOT EXISTS idx_attivita_scadenza ON attivita (data_scadenza);
CREATE INDEX IF NOT EXISTS idx_attivita_stato    ON attivita (stato);

-- Etichette personalizzate del calendario. Il colore e' un hex libero
-- scelto dall'utente: la leggibilita' sui chip piccoli e' garantita dal
-- calcolo della luminanza lato client (testo bianco/nero), non da una
-- lista di token.
CREATE TABLE IF NOT EXISTS etichette (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL UNIQUE,
  colore         TEXT NOT NULL DEFAULT '#6B7280',
  data_creazione TEXT NOT NULL
);

-- Assegnazione N:N tra attivita' ed etichette. Senza foreign key
-- applicate (coerente col resto del DB): la pulizia orfani la fa la
-- DELETE dell'etichetta.
CREATE TABLE IF NOT EXISTS attivita_etichette (
  attivita_id   TEXT NOT NULL,
  etichetta_id  TEXT NOT NULL,
  PRIMARY KEY (attivita_id, etichetta_id)
);

CREATE INDEX IF NOT EXISTS idx_attivita_etichette_etichetta ON attivita_etichette (etichetta_id);

CREATE TABLE IF NOT EXISTS progetti_tickets (
  id             TEXT PRIMARY KEY,
  progetto_id    TEXT NOT NULL,
  ticket_id      TEXT NOT NULL,
  data_creazione TEXT NOT NULL,
  UNIQUE (progetto_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_progetti_tickets_progetto ON progetti_tickets (progetto_id);
CREATE INDEX IF NOT EXISTS idx_progetti_tickets_ticket   ON progetti_tickets (ticket_id);

CREATE TABLE IF NOT EXISTS impostazioni (
  chiave             TEXT PRIMARY KEY,
  valore             TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attivita_google (
  attivita_id        TEXT PRIMARY KEY,
  calendar_id        TEXT NOT NULL,
  event_id           TEXT NOT NULL,
  stato              TEXT NOT NULL DEFAULT 'PENDENTE'
                     CHECK (stato IN ('PENDENTE','SINCRONIZZATO','ERRORE','DA_CANCELLARE')),
  tentativi          INTEGER NOT NULL DEFAULT 0,
  ultimo_errore      TEXT,
  data_sync          TEXT,
  data_creazione     TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attivita_google_stato    ON attivita_google (stato);
CREATE INDEX IF NOT EXISTS idx_attivita_google_calendar ON attivita_google (calendar_id);

-- Tempi di lavorazione. Una voce appartiene a UNA cosa: un'attivita' (task di
-- progetto o evento sciolto), un ticket, oppure nessuna delle due (tempo
-- "generico", registrato dall'header quando non si e' scelto un bersaglio).
--
-- Non c'e' una FK verso attivita/tickets: le due tabelle hanno gia' cancellato
-- righe in passato (cascate) e il DB non applica le foreign key. Il bersaglio
-- vivo si risolve in lettura con un LEFT JOIN; una voce orfana resta un tempo
-- registrato e non sparisce dai totali storici.
--
-- "fine" NULL significa voce in corso: e' il cronometro attivo. E' uno stato
-- DERIVATO dalle date, mai una colonna: non puo' andare fuori sincrono.
CREATE TABLE IF NOT EXISTS voci_tempo (
  id                 TEXT PRIMARY KEY,
  attivita_id        TEXT,
  ticket_id          TEXT,
  operatore_id       TEXT NOT NULL,
  operatore          TEXT NOT NULL,
  descrizione        TEXT,
  inizio             TEXT NOT NULL,
  fine               TEXT,
  data_creazione     TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL,
  CHECK (attivita_id IS NULL OR ticket_id IS NULL)
);

-- Il cronometro attivo di un operatore si cerca sempre per operatore aperto.
CREATE INDEX IF NOT EXISTS idx_voci_tempo_operatore ON voci_tempo (operatore_id, fine);
CREATE INDEX IF NOT EXISTS idx_voci_tempo_attivita ON voci_tempo (attivita_id);
CREATE INDEX IF NOT EXISTS idx_voci_tempo_ticket   ON voci_tempo (ticket_id);
CREATE INDEX IF NOT EXISTS idx_voci_tempo_inizio   ON voci_tempo (inizio);

-- Agenti AI: definizione (prompt di sistema, modello, ruolo) e storico
-- delle esecuzioni. La definizione e' volutamente generica: ogni agente
-- e' un system prompt + un modello, i "strumenti" sono un JSON riservato
-- all'evoluzione futura (tool-calling). Le esecuzioni sono il log di
-- visualizzazione in UI (input, output, stato, durata, eventuale ticket
-- o cliente di contesto).
CREATE TABLE IF NOT EXISTS agenti (
  id               TEXT PRIMARY KEY,
  nome             TEXT NOT NULL,
  descrizione      TEXT,
  -- Cosa fa l'agente: assistente (ticket), contenuti (social), clienti (CRM)
  ruolo            TEXT NOT NULL DEFAULT 'assistente'
                   CHECK (ruolo IN ('assistente','contenuti','clienti','custom')),
  modello          TEXT NOT NULL DEFAULT '',
  system_prompt    TEXT NOT NULL,
  -- JSON array di nomi strumenti (lib/agenti-tools.ts). Se vuoto l'agente e'
  -- solo conversazionale; se non vuoto l'esecuzione usa il loop strumenti
  -- IN-APP (query eseguite dalla nostra app sul nostro DB) e forza OpenRouter.
  strumenti        TEXT NOT NULL DEFAULT '[]',
  -- Backend per l'esecuzione: 'auto' = default globale (Hermes se configurato,
  -- altrimenti OpenRouter), oppure override esplicito per questo agente.
  provider         TEXT NOT NULL DEFAULT 'auto'
                   CHECK (provider IN ('auto','openrouter','hermes')),
  attivo           INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  creato_da        TEXT,
  data_creazione   TEXT NOT NULL,
  data_aggiornamento TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenti_ruolo ON agenti (ruolo);
CREATE INDEX IF NOT EXISTS idx_agenti_attivo ON agenti (attivo);

CREATE TABLE IF NOT EXISTS agenti_esecuzioni (
  id             TEXT PRIMARY KEY,
  agente_id      TEXT NOT NULL,
  input_utente   TEXT NOT NULL,
  output         TEXT,
  stato          TEXT NOT NULL DEFAULT 'in_corso'
                 CHECK (stato IN ('in_corso','completata','errore')),
  errore         TEXT,
  modello        TEXT,
  prompt_tokens  INTEGER,
  completion_tokens INTEGER,
  durata_ms      INTEGER,
  operatore_id   TEXT,
  -- Contesto opzionale in JSON (ticket_id, cliente_id, ...): collega
  -- l'esecuzione alla risorsa di business da cui e' nata.
  contesto       TEXT,
  -- Trace JSON del loop strumenti: quali tool ha chiamato l'agente, con
  -- quali argomenti e sintesi dei risultati. NULL per le esecuzioni
  -- conversazionali senza strumenti.
  traccia        TEXT,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenti_esecuzioni_agente ON agenti_esecuzioni (agente_id, data_creazione);
CREATE INDEX IF NOT EXISTS idx_agenti_esecuzioni_stato  ON agenti_esecuzioni (stato);

-- Registro attivita': traccia OGNI mutazione fatta dall'app (utente, agente,
-- API macchina o sistema). E' la base dell'audit: chi ha fatto cosa, su quale
-- entita', con quali dettagli. "dettagli" e' JSON libero (mai contenuto
-- sensibile: niente password o token).
CREATE TABLE IF NOT EXISTS registro_attivita (
  id             TEXT PRIMARY KEY,
  operatore_id   TEXT,
  origine        TEXT NOT NULL DEFAULT 'utente'
                 CHECK (origine IN ('utente','agente','api','sistema')),
  azione         TEXT NOT NULL,
  entita         TEXT,
  entita_id      TEXT,
  dettagli       TEXT,
  data           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registro_data      ON registro_attivita (data);
CREATE INDEX IF NOT EXISTS idx_registro_entita    ON registro_attivita (entita, entita_id);
CREATE INDEX IF NOT EXISTS idx_registro_operatore ON registro_attivita (operatore_id);

-- Storico delle transizioni di stato di un ticket. Una riga per passaggio:
-- serve al calcolo SLA e al tasso di riapertura (CHIUSO/RISOLTO -> NUOVO/IN_CORSO).
CREATE TABLE IF NOT EXISTS tickets_storico_stati (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL,
  da_stato       TEXT,
  a_stato        TEXT NOT NULL,
  operatore_id   TEXT,
  operatore      TEXT,
  data           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_storico_stati_ticket ON tickets_storico_stati (ticket_id, data);

-- Tentativi di login per email+IP: rate limit e blocco temporaneo. Una riga
-- per coppia; il conteggio si azzera quando il blocco scade o al login valido.
CREATE TABLE IF NOT EXISTS tentativi_login (
  chiave           TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  ip               TEXT NOT NULL,
  tentativi        INTEGER NOT NULL DEFAULT 0,
  bloccato_fino    TEXT,
  ultimo_tentativo TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tentativi_email ON tentativi_login (email);
CREATE INDEX IF NOT EXISTS idx_tentativi_ip    ON tentativi_login (ip);

-- Chiavi API macchina (bot WhatsApp su Hermes). Si conserva solo l'HASH della
-- chiave: il valore in chiaro viene mostrato una volta sola alla creazione.
-- "ambiti" e' un array JSON di permessi (es. ["tickets:read","tickets:write"]).
CREATE TABLE IF NOT EXISTS chiavi_api (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  hash           TEXT NOT NULL UNIQUE,
  prefisso       TEXT NOT NULL,
  ambiti         TEXT NOT NULL DEFAULT '[]',
  attiva         INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0,1)),
  ultimo_uso     TEXT,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chiavi_api_attiva ON chiavi_api (attiva);

-- Idempotenza delle chiamate macchina: la stessa Idempotency-Key restituisce
-- la risposta gia' prodotta invece di creare un doppione (es. retry del bot).
CREATE TABLE IF NOT EXISTS chiavi_idempotenza (
  chiave         TEXT PRIMARY KEY,
  risposta       TEXT NOT NULL,
  data_creazione TEXT NOT NULL
);

-- Proposte degli agenti: uno strumento di scrittura NON modifica nulla, crea
-- una proposta che un umano approva o rifiuta. L'approvazione esegue le
-- funzioni esistenti con l'identita' dell'operatore.
CREATE TABLE IF NOT EXISTS agenti_proposte (
  id             TEXT PRIMARY KEY,
  esecuzione_id  TEXT,
  agente_id      TEXT,
  tipo           TEXT NOT NULL,
  payload        TEXT NOT NULL,
  stato          TEXT NOT NULL DEFAULT 'in_attesa'
                 CHECK (stato IN ('in_attesa','approvata','rifiutata')),
  proposta_da    TEXT,
  deciso_da      TEXT,
  data_creazione TEXT NOT NULL,
  data_decisione TEXT
);

CREATE INDEX IF NOT EXISTS idx_agenti_proposte_stato ON agenti_proposte (stato, data_creazione);

-- Stato di lettura PER OPERATORE. La colonna notifications.letta resta per
-- compatibilita' con i dati esistenti, ma la verita' e' questa tabella: due
-- operatori che vedono la stessa notifica hanno letture indipendenti.
CREATE TABLE IF NOT EXISTS notifications_lette (
  notification_id TEXT NOT NULL,
  operatore_id    TEXT NOT NULL,
  data            TEXT NOT NULL,
  PRIMARY KEY (notification_id, operatore_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_lette_operatore ON notifications_lette (operatore_id);

-- Allegati arrivati per email e agganciati a un MESSAGGIO (non a una nota
-- tecnica). La tabella allegati richiede note_tecnica_id NOT NULL: per non
-- ricostruirla si usa questa accanto, con le stesse regole MIME.
CREATE TABLE IF NOT EXISTS allegati_messaggi (
  id             TEXT PRIMARY KEY,
  messaggio_id   TEXT NOT NULL,
  ticket_id      TEXT NOT NULL,
  nome_file      TEXT NOT NULL,
  nome_originale TEXT NOT NULL,
  dimensione     INTEGER NOT NULL,
  tipo_mime      TEXT NOT NULL,
  data_creazione TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allegati_messaggi_messaggio ON allegati_messaggi (messaggio_id);
CREATE INDEX IF NOT EXISTS idx_allegati_messaggi_ticket    ON allegati_messaggi (ticket_id);
`;

// NOTA sui due vincoli dello SCHEMA (che viene splittato su ";"):
//  - nessun DDL puo' contenere un ";" dentro un letterale;
//  - nessun DDL puo' contenere un "@" nudo dentro un letterale, perche'
//    prepare() riscrive /@([A-Za-z0-9_]+)/ in ":nome" ANCHE dentro le stringhe.
// In particolare calendar_id contiene "@" (es. "info@azienda.it"): va sempre
// passato come parametro, mai interpolato in una query.

// Schema inizializzato in modo lazy: la prima query reale del processo
// attiva la creazione tabelle/migrazioni; a build-time non viene eseguito nulla.
let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initSchema().catch((err) => {
      console.error("Errore nell'inizializzazione dello schema su Turso:", err);
      schemaPromise = null; // permette il retry alla prossima query
    });
  }
  return schemaPromise;
}

async function initSchema(): Promise<void> {
  const client = getClient();

  // Tutto lo schema in UNA sola richiesta HTTP: prima erano 50 `execute` in
  // serie, cioe' 50 round-trip (~10s su un DB remoto) pagati al primo accesso
  // di ogni processo. Gli statement sono idempotenti (`IF NOT EXISTS`).
  await client.executeMultiple(SCHEMA);

  // Aggiunta di colonne (non dati): deve girare a OGNI avvio, anche su un
  // database che ha gia' registrato la versione dello schema. Il gate sotto
  // protegge le migrazioni pesanti (o di dati), non queste. `CREATE TABLE IF
  // NOT EXISTS` sopra non tocca una tabella esistente, quindi senza questo
  // blocco un DB gia' creato resterebbe senza `persone` e ogni SELECT
  // fallirebbe con "no such column".
  try {
    await getClient().execute("ALTER TABLE progetti ADD COLUMN persone TEXT NOT NULL DEFAULT '[]'");
  } catch { /* Column already exists */ }
  try {
    await getClient().execute("ALTER TABLE attivita ADD COLUMN persone TEXT NOT NULL DEFAULT '[]'");
  } catch { /* Column already exists */ }
  // Casella di provenienza di ogni email in entrata (multi-casella): su un
  // DB creato prima di questa feature la colonna manca, quindi va aggiunta
  // a ogni avvio come le due sopra.
  try {
    await getClient().execute("ALTER TABLE email_inbox ADD COLUMN casella_id TEXT");
  } catch { /* Column already exists */ }
  try {
    await getClient().execute(
      "CREATE INDEX IF NOT EXISTS idx_email_inbox_casella ON email_inbox (casella_id)"
    );
  } catch { /* Index already exists */ }
  // Caselle Gmail via OAuth: colonne aggiunte dopo la creazione originale
  // della tabella, quindi su un DB esistente vanno messe qui (idempotenti,
  // fuori dal gate di versione, come le ALTER sopra).
  try {
    await getClient().execute(
      "ALTER TABLE caselle_email ADD COLUMN tipo TEXT NOT NULL DEFAULT 'imap'"
    );
  } catch { /* Column already exists */ }
  try {
    await getClient().execute(
      "ALTER TABLE caselle_email ADD COLUMN oauth_refresh_token_cifrata TEXT"
    );
  } catch { /* Column already exists */ }
  try {
    await getClient().execute(
      "ALTER TABLE caselle_email ADD COLUMN gmail_da_epoch INTEGER"
    );
  } catch { /* Column already exists */ }
  // Agenti AI: provider per agente + trace delle esecuzioni con strumenti.
  try {
    await getClient().execute(
      "ALTER TABLE agenti ADD COLUMN provider TEXT NOT NULL DEFAULT 'auto'"
    );
  } catch { /* Column already exists */ }
  try {
    await getClient().execute(
      "ALTER TABLE agenti_esecuzioni ADD COLUMN traccia TEXT"
    );
  } catch { /* Column already exists */ }

  // --- Fase 1: colonne additive (sempre, come le ALTER sopra) ---
  // `versione_sessione` sta nel JWT: incrementarla revoca tutte le sessioni
  // aperte dell'operatore (cambio password, disattivazione forzata).
  const colonneAggiuntive = [
    "ALTER TABLE operatori ADD COLUMN versione_sessione INTEGER NOT NULL DEFAULT 0",
    // Deroga TLS esplicita per singola casella (certificati non validi).
    "ALTER TABLE caselle_email ADD COLUMN tls_non_verificato INTEGER NOT NULL DEFAULT 0",
    // Colonne strutturate accanto a quelle testuali (che restano e vengono
    // scritte in parallelo finche' la migrazione non e' consolidata).
    "ALTER TABLE tickets ADD COLUMN operatore_id TEXT",
    "ALTER TABLE tickets ADD COLUMN cliente_id TEXT",
    "ALTER TABLE tickets ADD COLUMN creato_il TEXT",
    "ALTER TABLE tickets ADD COLUMN aggiornato_il TEXT",
    "ALTER TABLE tickets ADD COLUMN chiuso_il TEXT",
    "ALTER TABLE tickets ADD COLUMN preso_in_carico_il TEXT",
    "ALTER TABLE tickets ADD COLUMN canale TEXT NOT NULL DEFAULT 'manuale'",
    "ALTER TABLE tickets ADD COLUMN eliminato_il TEXT",
    // NULL = notifica per tutti gli admin; valorizzato = solo quell'operatore.
    "ALTER TABLE notifications ADD COLUMN destinatario_id TEXT",
    // --- Fase 2: triage email e threading ---
    "ALTER TABLE email_inbox ADD COLUMN esito_ai TEXT",
    "ALTER TABLE email_inbox ADD COLUMN confidenza REAL",
    "ALTER TABLE email_inbox ADD COLUMN motivo TEXT",
    "ALTER TABLE email_inbox ADD COLUMN in_reply_to TEXT",
    "ALTER TABLE email_inbox ADD COLUMN riferimenti TEXT",
    // Corpo testuale completo: serve a creare/agganciare il ticket dalla coda
    // "Da verificare" senza riprocessare l'email.
    "ALTER TABLE email_inbox ADD COLUMN body_text TEXT",
    // Esito FINALE del triage: ticket | da_verificare | ignora.
    // La colonna storica `stato` continua a usare i valori ammessi dal suo
    // CHECK (processata/errore/ignorata): il nuovo stato vive qui, senza
    // ricostruire la tabella (migrazione additiva).
    "ALTER TABLE email_inbox ADD COLUMN stato_triage TEXT",
    // Correzione umana del triage (materiale per migliorare il prompt).
    "ALTER TABLE email_inbox ADD COLUMN correzione_umana TEXT",
    "ALTER TABLE email_inbox ADD COLUMN corretto_da TEXT",
    "ALTER TABLE email_log ADD COLUMN message_id TEXT",
    "ALTER TABLE email_log ADD COLUMN in_reply_to TEXT",
    "ALTER TABLE email_log ADD COLUMN riferimenti TEXT",
    // Impostazioni di triage per casella e cursore UID persistente.
    "ALTER TABLE caselle_email ADD COLUMN triage_attivo INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE caselle_email ADD COLUMN triage_soglia REAL NOT NULL DEFAULT 0.7",
    "ALTER TABLE caselle_email ADD COLUMN triage_priorita TEXT",
    "ALTER TABLE caselle_email ADD COLUMN triage_operatore TEXT",
    // 1 = modalita' osservazione: classifica ma crea comunque il ticket.
    "ALTER TABLE caselle_email ADD COLUMN triage_osservazione INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE caselle_email ADD COLUMN ultimo_uid INTEGER",
    "ALTER TABLE caselle_email ADD COLUMN uid_validita INTEGER",
    // --- Fase 4: agenti con proprietario/visibilita e costo per esecuzione ---
    "ALTER TABLE agenti ADD COLUMN proprietario_id TEXT",
    "ALTER TABLE agenti ADD COLUMN visibilita TEXT NOT NULL DEFAULT 'libreria'",
    "ALTER TABLE agenti_esecuzioni ADD COLUMN costo_stimato REAL",
  ];
  for (const sql of colonneAggiuntive) {
    try {
      await getClient().execute(sql);
    } catch { /* Column already exists */ }
  }

  // Modello fisso rimosso: gli agenti che puntavano al vecchio default
  // vengono riportati a "usa il default di sistema" (configurabile da env).
  try {
    await getClient().execute(
      "UPDATE agenti SET modello = '' WHERE modello = 'deepseek/deepseek-v4.1-flash-1017'"
    );
  } catch { /* tabella agenti non ancora presente */ }
  const indiciAggiuntivi = [
    "CREATE INDEX IF NOT EXISTS idx_tickets_operatore_id ON tickets (operatore_id)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_cliente_id ON tickets (cliente_id)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_creato_il ON tickets (creato_il)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_eliminato_il ON tickets (eliminato_il)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_canale ON tickets (canale)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_destinatario ON notifications (destinatario_id)",
  ];
  for (const sql of indiciAggiuntivi) {
    try {
      await getClient().execute(sql);
    } catch { /* Index already exists */ }
  }
  // Contatore ticket: una riga in impostazioni, inizializzata al massimo
  // numero gia' assegnato. Da qui in poi createTicket lo incrementa dentro la
  // stessa transazione dell'INSERT (niente piu' Date.now(), che collideva).
  // Il SELECT MAX gira solo la prima volta: un INSERT OR IGNORE lo
  // rieseguirebbe a ogni avvio (scansione completa di tickets inutile).
  try {
    const contatore = await getClient().execute(
      "SELECT 1 AS uno FROM impostazioni WHERE chiave = 'contatore_ticket'"
    );
    if (contatore.rows.length === 0) {
      await getClient().execute({
        sql: `INSERT INTO impostazioni (chiave, valore, data_aggiornamento)
              SELECT 'contatore_ticket',
                     CAST(COALESCE(MAX(CAST(substr(numero, 6) AS INTEGER)), 0) AS TEXT),
                     :ts
              FROM tickets`,
        args: [new Date().toISOString()],
      });
    }
  } catch { /* gia' inizializzato */ }

  // Le migrazioni sotto restano idempotenti, ma la pulizia dei contatti legge
  // tutta la tabella `tickets`: gira una volta per database, non a ogni avvio.
  if ((await leggiVersioneSchema(client)) >= SCHEMA_VERSION) return;

  // Migration: add links column if missing
  try {
    await getClient().execute("ALTER TABLE knowledge_docs ADD COLUMN links TEXT DEFAULT '[]'");
  } catch {
    // Column already exists
  }
  // Migration: make email NOT NULL on tickets (set default for existing nulls)
  try {
    await getClient().execute("UPDATE tickets SET email = 'sconosciuto@placeholder.it' WHERE email IS NULL");
    await getClient().execute("ALTER TABLE tickets ALTER COLUMN email TEXT NOT NULL");
  } catch {
    // Column already NOT NULL or migration not needed
  }
  // Migration: fix contact data - extract phone and email from contatto field
  const updatesContatti = [];
  try {
    // Find tickets where contatto contains email or phone patterns
    const ticketsWithMixedContact = await getClient().execute(
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

      updatesContatti.push({
        sql: `UPDATE tickets SET contatto = :contatto, telefono = :telefono, email = :email WHERE id = :id`,
        // Nessun recapito trovato -> placeholder, non NULL: la colonna puo'
        // essere NOT NULL su qualche installazione e un UPDATE fallito
        // bloccherebbe l'intera migrazione dei contatti.
        args: [nomeContatto, telefono, email || 'sconosciuto@placeholder.it', row.id as string],
      });
    }
  } catch {
    // Migration not needed or already applied
  }
  // Un solo round-trip per tutte le righe (prima era un UPDATE per riga).
  // Best effort come gli altri blocchi: un errore qui non deve impedire
  // l'uso dell'app.
  if (updatesContatti.length > 0) {
    try {
      await client.batch(updatesContatti, "write");
    } catch (err) {
      console.error("Migrazione contatti non applicata:", err);
    }
  }
  // Migration: add time tracking columns
  try {
    await getClient().execute("ALTER TABLE tickets ADD COLUMN data_inizio_lavoro TEXT");
  } catch { /* Column already exists */ }
  try {
    await getClient().execute("ALTER TABLE tickets ADD COLUMN tempo_stimato_minuti INTEGER");
  } catch { /* Column already exists */ }
  try {
    await getClient().execute("ALTER TABLE tickets ADD COLUMN tempo_effettivo_minuti INTEGER");
  } catch { /* Column already exists */ }

  // Backfill v3: colonne strutturate dai valori testuali storici. Gira una
  // volta per database; nessuna colonna vecchia viene rimossa e le colonne
  // testuali continuano a essere scritte in parallelo.
  try {
    await backfillStrutturato(client);
  } catch (err) {
    // Non blocca l'app: la versione dello schema non viene registrata, quindi
    // il prossimo avvio riprova.
    console.error("Backfill struttura ticket non applicato:", err);
  }

  // Solo se tutte le migrazioni sono andate a termine si registra la versione:
  // in caso di errore il prossimo avvio le ritenta.
  try {
    await client.execute({
      sql: `INSERT INTO impostazioni (chiave, valore, data_aggiornamento)
            VALUES ('schema_version', :v, :ts)
            ON CONFLICT (chiave) DO UPDATE SET valore = :v, data_aggiornamento = :ts`,
      args: [String(SCHEMA_VERSION), new Date().toISOString()],
    });
  } catch (err) {
    console.error("Versione schema non registrata:", err);
  }
}

// Incrementare quando si aggiunge una migrazione dati da eseguire una volta.
// v2: i ticket arrivati dal centralino/agent MCP hanno i recapiti dentro il
// testo libero del contatto (email e telefono non avevano colonna scritta):
// si riestrae tutto.
// v3: colonne strutturate (operatore_id, cliente_id, date ISO), storico stati,
// registro attivita', chiavi API, contatore ticket. Backfill per nome esatto.
const SCHEMA_VERSION = 3;

// Accetta i formati che convivono nella tabella: ISO e "dd/mm/yyyy, hh:mm"
// (quello scritto da tickets.now()). Restituisce ISO UTC, oppure null se non
// riconosce la data: meglio una colonna vuota che una data inventata.
function dataOraIso(valore: unknown): string | null {
  if (typeof valore !== "string") return null;
  const s = valore.trim();
  if (!s) return null;

  const isoDiretto = Date.parse(s);
  if (Number.isFinite(isoDiretto)) return new Date(isoDiretto).toISOString();

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const [, g, me, a, o = "0", mi = "0", se = "0"] = m;
    const dt = new Date(Number(a), Number(me) - 1, Number(g), Number(o), Number(mi), Number(se));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}

async function backfillStrutturato(client: Client): Promise<void> {
  const [ticketRes, operatoriRes, clientiRes] = await client.batch(
    [
      {
        sql: `SELECT id, operatore, cliente, data_creazione, data_aggiornamento,
                     data_chiusura, data_inizio_lavoro
              FROM tickets
              WHERE operatore_id IS NULL OR cliente_id IS NULL OR creato_il IS NULL`,
        args: [],
      },
      { sql: "SELECT id, nome FROM operatori", args: [] },
      { sql: "SELECT id, ragione_sociale FROM clienti", args: [] },
    ],
    "read"
  );

  const perNomeOperatore = new Map<string, string>();
  for (const r of operatoriRes.rows) {
    if (typeof r.nome === "string" && typeof r.id === "string") {
      perNomeOperatore.set(r.nome, r.id);
    }
  }
  const perNomeCliente = new Map<string, string>();
  for (const r of clientiRes.rows) {
    if (typeof r.ragione_sociale === "string" && typeof r.id === "string") {
      perNomeCliente.set(r.ragione_sociale, r.id);
    }
  }

  let senzaOperatore = 0;
  let senzaCliente = 0;
  let dateNonRiconosciute = 0;
  const statements: BatchStatement[] = [];

  for (const t of ticketRes.rows) {
    const id = String(t.id);
    const operatoreId =
      typeof t.operatore === "string" ? (perNomeOperatore.get(t.operatore) ?? null) : null;
    const clienteId =
      typeof t.cliente === "string" ? (perNomeCliente.get(t.cliente) ?? null) : null;

    if (t.operatore && !operatoreId) senzaOperatore += 1;
    if (t.cliente && !clienteId) senzaCliente += 1;

    const creato = dataOraIso(t.data_creazione);
    const aggiornato = dataOraIso(t.data_aggiornamento);
    const chiuso = dataOraIso(t.data_chiusura);
    const preso = dataOraIso(t.data_inizio_lavoro);
    if (!creato) dateNonRiconosciute += 1;

    statements.push({
      sql: `UPDATE tickets
            SET operatore_id = COALESCE(operatore_id, @operatore_id),
                cliente_id = COALESCE(cliente_id, @cliente_id),
                creato_il = COALESCE(creato_il, @creato_il),
                aggiornato_il = COALESCE(aggiornato_il, @aggiornato_il),
                chiuso_il = COALESCE(chiuso_il, @chiuso_il),
                preso_in_carico_il = COALESCE(preso_in_carico_il, @preso_in_carico_il)
            WHERE id = @id`,
      params: {
        id,
        operatore_id: operatoreId,
        cliente_id: clienteId,
        creato_il: creato,
        aggiornato_il: aggiornato,
        chiuso_il: chiuso,
        preso_in_carico_il: preso,
      },
    });
  }

  if (statements.length > 0) {
    // A blocchi: un batch unico con migliaia di statement puo' superare i
    // limiti della richiesta HTTP verso Turso.
    for (let i = 0; i < statements.length; i += 200) {
      await client.batch(statements.slice(i, i + 200), "write");
    }
  }

  console.log(
    `[db] Backfill v3: ${ticketRes.rows.length} ticket esaminati, ` +
      `${senzaOperatore} senza operatore abbinato, ` +
      `${senzaCliente} senza cliente abbinato, ` +
      `${dateNonRiconosciute} con data non riconosciuta.`
  );
}

async function leggiVersioneSchema(client: Client): Promise<number> {
  try {
    const { rows } = await client.execute(
      "SELECT valore FROM impostazioni WHERE chiave = 'schema_version'"
    );
    const n = Number(rows[0]?.valore ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

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

// Contatore diagnostico, spento salvo DB_TRACE=1. Serve a CONTARE le richieste
// vere verso Turso per schermata: con un DB remoto "piu' veloce" senza numeri e'
// un'opinione. Fuori dalla traccia il costo e' un `if` su una costante.
const TRACE = process.env.DB_TRACE === "1";
const contatori = { richieste: 0, msTotale: 0 };

async function tracciata<T>(etichetta: string, sql: string, fn: () => Promise<T>): Promise<T> {
  if (!TRACE) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    contatori.richieste += 1;
    contatori.msTotale += ms;
    console.log(`[db] ${ms.toFixed(0)}ms ${etichetta} ${sql.replace(/\s+/g, " ").slice(0, 90)}`);
  }
}

// Snapshot dei contatori, azzerandoli: si chiama a inizio e fine schermata.
export function dbStats(): { richieste: number; msTotale: number } {
  const snapshot = { ...contatori };
  contatori.richieste = 0;
  contatori.msTotale = 0;
  return snapshot;
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
      await ensureSchema();
      const result = await tracciata("get", sqlFixed, () =>
        getClient().execute({ sql: sqlFixed, args: normalizeArgs(params) })
      );
      const row = result.rows[0];
      return row ? toRow(row) : undefined;
    },
    async all(params?: Params): Promise<Row[]> {
      await ensureSchema();
      const result = await tracciata("all", sqlFixed, () =>
        getClient().execute({ sql: sqlFixed, args: normalizeArgs(params) })
      );
      return result.rows.map(toRow);
    },
    async run(params?: Params): Promise<{ changes: number }> {
      await ensureSchema();
      const result = await tracciata("run", sqlFixed, () =>
        getClient().execute({ sql: sqlFixed, args: normalizeArgs(params) })
      );
      return { changes: result.rowsAffected };
    },
  };
}

export interface BatchStatement {
  sql: string;
  params?: Record<string, ParamValue> | ParamValue[];
}

export const db = {
  prepare,
  // Piu' statement in UNA richiesta al server (e in transazione, se Turso la
  // supporta). Evita di sommare un round-trip per riga.
  async batch(statements: BatchStatement[]): Promise<{ changes: number }[]> {
    if (statements.length === 0) return [];
    await ensureSchema();
    const risultati = await tracciata("batch", `${statements.length} statement`, () =>
      getClient().batch(
        statements.map((s) => ({
          sql: s.sql.replace(/@([A-Za-z0-9_]+)/g, ":$1"),
          args: normalizeArgs(s.params),
        })),
        "write"
      )
    );
    return risultati.map((r) => ({ changes: r.rowsAffected }));
  },

  // N SELECT indipendenti in UNA richiesta HTTP.
  //
  // Perche' esiste: il database e' remoto, quindi ogni `execute()` e' una
  // richiesta di rete e la latenza si paga per richiesta, non per riga.
  // `Promise.all` mette due query in parallelo ma emette DUE richieste; questo
  // ne emette UNA. Lato server le SELECT vengono eseguite in sequenza, cioe'
  // si sommano i microsecondi dell'SQL invece dei millisecondi del viaggio.
  //
  // Uso: solo per letture indipendenti. Una lista che dipende dal risultato
  // della prima query non entra in un batch (non c'e' il risultato).
  async batchRead(statements: BatchStatement[]): Promise<Row[][]> {
    if (statements.length === 0) return [];
    await ensureSchema();
    const risultati = await tracciata("batchRead", `${statements.length} select`, () =>
      getClient().batch(
        statements.map((s) => ({
          sql: s.sql.replace(/@([A-Za-z0-9_]+)/g, ":$1"),
          args: normalizeArgs(s.params),
        })),
        "read"
      )
    );
    return risultati.map((r) => r.rows.map(toRow));
  },

  async exec(sql: string): Promise<void> {
    await ensureSchema();
    await tracciata("exec", sql, () => getClient().execute(sql));
  },
  async ping(): Promise<void> {
    await ensureSchema();
  },
};
