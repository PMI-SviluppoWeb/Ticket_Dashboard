import { db } from "./db";
import { cifraSecret, decifraSecret, encryptionKeyConfigurata } from "./cifratura";
import "server-only";

// Accesso dati per le caselle email multi-account.
//
// Ogni riga = un account IMAP+SMTP pollato dall'IMAP worker e usato per le
// risposte. Le password viaggiano solo cifrate (lib/cifratura.ts): qui le
// funzioni di lettura "grezza" sono private e le API espongono solo righe
// senza password (ha_password booleano).

import type {
  AccessoCasellaOperatore,
  CasellaEmail,
  CasellaEmailInput,
  CasellaVisibile,
} from "./types";

interface CasellaRow {
  id: string;
  etichetta: string;
  indirizzo: string;
  tipo: string;
  imap_host: string;
  imap_port: number;
  imap_secure: number;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  utente: string;
  password_cifrata: string;
  oauth_refresh_token_cifrata: string | null;
  gmail_da_epoch: number | null;
  abilitata: number;
  predefinita: number;
  tls_non_verificato: number;
  triage_attivo: number;
  triage_soglia: number;
  triage_priorita: string | null;
  triage_operatore: string | null;
  triage_osservazione: number;
  data_creazione: string;
  data_aggiornamento: string;
}

const SELECT_CASELLE = `SELECT id, etichetta, indirizzo, tipo, imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure, utente, password_cifrata, oauth_refresh_token_cifrata,
  gmail_da_epoch, abilitata, predefinita, tls_non_verificato,
  triage_attivo, triage_soglia, triage_priorita, triage_operatore, triage_osservazione,
  data_creazione, data_aggiornamento FROM caselle_email`;

function aTipo(r: CasellaRow): CasellaEmail {
  return {
    id: r.id,
    etichetta: r.etichetta,
    indirizzo: r.indirizzo,
    tipo: r.tipo === "gmail" ? "gmail" : "imap",
    imap_host: r.imap_host,
    imap_port: Number(r.imap_port),
    imap_secure: Number(r.imap_secure) === 1,
    smtp_host: r.smtp_host,
    smtp_port: Number(r.smtp_port),
    smtp_secure: Number(r.smtp_secure) === 1,
    utente: r.utente,
    abilitata: Number(r.abilitata) === 1,
    predefinita: Number(r.predefinita) === 1,
    tls_non_verificato: Number(r.tls_non_verificato) === 1,
    triage_attivo: Number(r.triage_attivo ?? 1) === 1,
    triage_soglia: Number(r.triage_soglia ?? 0.7),
    triage_priorita:
      r.triage_priorita === "BASSA" || r.triage_priorita === "MEDIA" || r.triage_priorita === "ALTA"
        ? r.triage_priorita
        : null,
    triage_operatore: r.triage_operatore ?? null,
    triage_osservazione: Number(r.triage_osservazione ?? 0) === 1,
    ha_password: Boolean(r.password_cifrata),
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
  };
}

// Elenco per la UI/API: nessuna password, nemmeno cifrata.
export async function listaCaselle(): Promise<CasellaEmail[]> {
  const rows = await db.prepare(`${SELECT_CASELLE} ORDER BY predefinita DESC, indirizzo`).all();
  return (rows as unknown as CasellaRow[]).map(aTipo);
}

// Le caselle abilitate per l'IMAP worker vivono in lib/caselle-worker.ts:
// quel modulo NON puo' passare da lib/db.ts (server-only), quindi ha un
// accesso diretto al client Turso condiviso.

export async function getCasella(id: string): Promise<CasellaEmail | null> {
  const row = await db.prepare(`${SELECT_CASELLE} WHERE id = ?`).get(id);
  return row ? aTipo(row as unknown as CasellaRow) : null;
}

// Casella predefinita per le uscite non collegate a una mail in entrata.
export async function getCasellaDefault(): Promise<CasellaEmail | null> {
  const row = await db
    .prepare(`${SELECT_CASELLE} WHERE predefinita = 1 AND abilitata = 1 LIMIT 1`)
    .get();
  return row ? aTipo(row as unknown as CasellaRow) : null;
}

// Credential complete di UNA casella (per l'invio SMTP): serve solo a
// lib/email.ts, mai alle API.
export async function credenzialiCasella(id: string): Promise<{
  id: string;
  indirizzo: string;
  tlsNonVerificato: boolean;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
} | null> {
  const row = (await db.prepare(`${SELECT_CASELLE} WHERE id = ?`).get(id)) as
    | unknown as CasellaRow
    | undefined;
  if (!row) return null;
  try {
    const pass = decifraSecret(row.password_cifrata);
    return {
      id: row.id,
      indirizzo: row.indirizzo,
      tlsNonVerificato: Number(row.tls_non_verificato) === 1,
      smtp: {
        host: row.smtp_host,
        port: Number(row.smtp_port),
        secure: Number(row.smtp_secure) === 1,
        user: row.utente,
        pass,
      },
    };
  } catch (err) {
    console.error(`[caselle] Decrittografia fallita per ${row.indirizzo}:`, err);
    return null;
  }
}

// Casella che ha ricevuto le email di un ticket: le risposte partono dallo
// stesso account. Null se il ticket non nasce da email.
export async function casellaPerTicket(ticketId: string): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT casella_id FROM email_inbox WHERE ticket_id = ? AND casella_id IS NOT NULL ORDER BY data_creazione DESC LIMIT 1"
    )
    .get(ticketId);
  const id = row?.casella_id;
  return typeof id === "string" && id ? id : null;
}

// ---------------------------------------------------------------------------
// Caselle Gmail (OAuth 2.0)
// ---------------------------------------------------------------------------

// Credenziali OAuth di una casella Gmail: serve a lib/email.ts (invio via
// Gmail API al posto di SMTP) e alla route di test. Mai esposte alle API.
export async function credenzialiGmail(id: string): Promise<{
  id: string;
  indirizzo: string;
  etichetta: string;
  refreshToken: string;
  gmailDaEpoch: number | null;
} | null> {
  const row = (await db.prepare(`${SELECT_CASELLE} WHERE id = ?`).get(id)) as
    | unknown as CasellaRow
    | undefined;
  if (!row || row.tipo !== "gmail" || !row.oauth_refresh_token_cifrata) return null;
  try {
    return {
      id: row.id,
      indirizzo: row.indirizzo,
      etichetta: row.etichetta,
      refreshToken: decifraSecret(row.oauth_refresh_token_cifrata),
      gmailDaEpoch: row.gmail_da_epoch != null ? Number(row.gmail_da_epoch) : null,
    };
  } catch (err) {
    console.error(`[caselle] Refresh token non decifrato per ${row.indirizzo}:`, err);
    return null;
  }
}

// Collega (o ricollega) un account Gmail dopo il consenso OAuth.
// UPSERT su indirizzo: ricollegare lo stesso account aggiorna il refresh
// token senza creare una seconda riga. Se l'indirizzo esisteva come casella
// IMAP, viene convertita in Gmail (stessa casella, stesso id: i ticket e
// l'email_inbox.casella_id storici restano validi).
export async function collegaGmail(input: {
  indirizzo: string;
  etichetta?: string;
  refreshToken: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!encryptionKeyConfigurata()) {
    return { ok: false, error: "ENCRYPTION_KEY non configurata." };
  }
  const indirizzo = input.indirizzo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo)) {
    return { ok: false, error: "Indirizzo email non valido." };
  }

  const tokenCifrato = cifraSecret(input.refreshToken);
  const now = new Date().toISOString();
  // High water mark: al primo poll non importano le email non lette gia'
  // presenti. -5s di margine per non perdere messaggi arrivati durante il
  // consenso.
  const daEpoch = Math.floor(Date.now() / 1000) - 5;

  const esistente = (await db
    .prepare("SELECT id, tipo FROM caselle_email WHERE indirizzo = ?")
    .get(indirizzo)) as { id: string; tipo: string } | undefined;

  if (esistente) {
    await db
      .prepare(
        `UPDATE caselle_email
         SET tipo = 'gmail',
             oauth_refresh_token_cifrata = @token,
             gmail_da_epoch = @epoch,
             -- Password IMAP non piu' usata: si azzera per non lasciare
             -- credenziali obsolete accanto al refresh token.
             password_cifrata = '',
             utente = @utente,
             abilitata = 1,
             data_aggiornamento = @now
         WHERE id = @id`
      )
      .run({ token: tokenCifrato, epoch: daEpoch, utente: indirizzo, now, id: esistente.id });
    return { ok: true, id: esistente.id };
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO caselle_email (id, etichetta, indirizzo, tipo, imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure, utente, password_cifrata,
        oauth_refresh_token_cifrata, gmail_da_epoch, abilitata, predefinita,
        data_creazione, data_aggiornamento)
       VALUES (@id, @etichetta, @indirizzo, 'gmail', 'imap.gmail.com', 993, 1,
        'smtp.gmail.com', 587, 0, @utente, '',
        @token, @epoch, 1, 0,
        @now, @now)`
    )
    .run({
      id,
      etichetta: (input.etichetta ?? indirizzo).trim(),
      indirizzo,
      utente: indirizzo,
      token: tokenCifrato,
      epoch: daEpoch,
      now,
    });
  return { ok: true, id };
}

export type EsitoSalvataggio = { ok: true; casella: CasellaEmail } | { ok: false; error: string };

// Impostazioni di triage della casella. Default prudenti: triage attivo,
// soglia alta, modalita' osservazione attiva (classifica ma crea comunque il
// ticket) finche' un admin non la disattiva.
export interface ConfigTriageCasella {
  attivo: boolean;
  soglia: number;
  priorita: "BASSA" | "MEDIA" | "ALTA" | null;
  operatore: string | null;
  osservazione: boolean;
}

export async function configTriageCasella(
  casellaId: string | null | undefined
): Promise<ConfigTriageCasella> {
  const predefinita: ConfigTriageCasella = {
    attivo: true,
    soglia: 0.7,
    priorita: null,
    operatore: null,
    osservazione: false,
  };
  if (!casellaId) return predefinita;
  try {
    const row = await db
      .prepare(
        `SELECT triage_attivo, triage_soglia, triage_priorita, triage_operatore, triage_osservazione
         FROM caselle_email WHERE id = ?`
      )
      .get(casellaId);
    if (!row) return predefinita;
    const priorita = row.triage_priorita;
    return {
      attivo: Number(row.triage_attivo ?? 1) === 1,
      soglia: Number(row.triage_soglia ?? 0.7),
      priorita:
        priorita === "BASSA" || priorita === "MEDIA" || priorita === "ALTA"
          ? priorita
          : null,
      operatore: typeof row.triage_operatore === "string" && row.triage_operatore
        ? row.triage_operatore
        : null,
      osservazione: Number(row.triage_osservazione ?? 0) === 1,
    };
  } catch {
    return predefinita;
  }
}

function validaInput(input: Partial<CasellaEmailInput>, richiediPassword: boolean): string | null {
  const stringa = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  if (!stringa(input.etichetta) || input.etichetta.length > 200) return "Etichetta non valida.";
  if (!stringa(input.indirizzo) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.indirizzo)) {
    return "Indirizzo email non valido.";
  }
  if (!stringa(input.imap_host)) return "Host IMAP obbligatorio.";
  if (!stringa(input.smtp_host)) return "Host SMTP obbligatorio.";
  if (!stringa(input.utente)) return "Utente obbligatorio.";
  if (
    !Number.isInteger(input.imap_port) ||
    (input.imap_port as number) < 1 ||
    (input.imap_port as number) > 65535
  ) {
    return "Porta IMAP non valida.";
  }
  if (
    !Number.isInteger(input.smtp_port) ||
    (input.smtp_port as number) < 1 ||
    (input.smtp_port as number) > 65535
  ) {
    return "Porta SMTP non valida.";
  }
  if (richiediPassword && (!input.password || input.password.length === 0)) {
    return "Password obbligatoria.";
  }
  if (input.password && input.password.length > 500) return "Password troppo lunga.";
  return null;
}

// Un solo account predefinito: prima si rimuove il flag dalle altre righe,
// poi si salva. Non e' una transazione (Turso qui non la richiede), ma la
// finestra e' minima e l'operatore che salva e' uno solo.
async function impostaDefault(idDaSalvare: string | null): Promise<void> {
  await db
    .prepare(
      "UPDATE caselle_email SET predefinita = 0, data_aggiornamento = ? WHERE predefinita = 1"
    )
    .run(new Date().toISOString());
  if (idDaSalvare) {
    await db
      .prepare(
        "UPDATE caselle_email SET predefinita = 1, data_aggiornamento = ? WHERE id = ?"
      )
      .run([new Date().toISOString(), idDaSalvare]);
  }
}

export async function creaCasella(input: CasellaEmailInput): Promise<EsitoSalvataggio> {
  const errore = validaInput(input, true);
  if (errore) return { ok: false, error: errore };

  const esistente = await db
    .prepare("SELECT id FROM caselle_email WHERE indirizzo = ?")
    .get(input.indirizzo.trim().toLowerCase());
  if (esistente) return { ok: false, error: "Esiste già una casella con questo indirizzo." };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.predefinita) await impostaDefault(null);

  await db
    .prepare(
      `INSERT INTO caselle_email (id, etichetta, indirizzo, imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure, utente, password_cifrata, abilitata, predefinita,
        tls_non_verificato, triage_attivo, triage_soglia, triage_priorita, triage_operatore, triage_osservazione,
        data_creazione, data_aggiornamento)
       VALUES (@id, @etichetta, @indirizzo, @imap_host, @imap_port, @imap_secure,
        @smtp_host, @smtp_port, @smtp_secure, @utente, @password_cifrata, @abilitata, @predefinita,
        @tls_non_verificato, @triage_attivo, @triage_soglia, @triage_priorita, @triage_operatore, @triage_osservazione,
        @data_creazione, @data_aggiornamento)`
    )
    .run({
      id,
      etichetta: input.etichetta.trim(),
      indirizzo: input.indirizzo.trim().toLowerCase(),
      imap_host: input.imap_host.trim(),
      imap_port: input.imap_port,
      imap_secure: input.imap_secure ? 1 : 0,
      smtp_host: input.smtp_host.trim(),
      smtp_port: input.smtp_port,
      smtp_secure: input.smtp_secure ? 1 : 0,
      utente: input.utente.trim(),
      password_cifrata: cifraSecret(input.password as string),
      abilitata: input.abilitata ? 1 : 0,
      predefinita: input.predefinita ? 1 : 0,
      tls_non_verificato: input.tls_non_verificato ? 1 : 0,
      triage_attivo: input.triage_attivo === false ? 0 : 1,
      triage_soglia: Number(input.triage_soglia ?? 0.7),
      triage_priorita: input.triage_priorita ?? null,
      triage_operatore: input.triage_operatore?.trim() || null,
      triage_osservazione: input.triage_osservazione ? 1 : 0,
      data_creazione: now,
      data_aggiornamento: now,
    });

  const casella = await getCasella(id);
  if (!casella) return { ok: false, error: "Errore durante il salvataggio." };
  return { ok: true, casella };
}

export async function aggiornaCasella(
  id: string,
  input: Partial<CasellaEmailInput>
): Promise<EsitoSalvataggio> {
  const corrente = await getCasella(id);
  if (!corrente) return { ok: false, error: "Casella non trovata." };

  // Campi opzionali in patch: si validano solo quelli presenti, completati
  // con i valori correnti per la validazione complessiva.
  const merged: CasellaEmailInput = {
    etichetta: input.etichetta ?? corrente.etichetta,
    indirizzo: input.indirizzo ?? corrente.indirizzo,
    imap_host: input.imap_host ?? corrente.imap_host,
    imap_port: input.imap_port ?? corrente.imap_port,
    imap_secure: input.imap_secure ?? corrente.imap_secure,
    smtp_host: input.smtp_host ?? corrente.smtp_host,
    smtp_port: input.smtp_port ?? corrente.smtp_port,
    smtp_secure: input.smtp_secure ?? corrente.smtp_secure,
    utente: input.utente ?? corrente.utente,
    // Password opzionale: vuota/assente = resta quella salvata.
    password: input.password && input.password.length > 0 ? input.password : undefined,
    abilitata: input.abilitata ?? corrente.abilitata,
    predefinita: input.predefinita ?? corrente.predefinita,
    tls_non_verificato: input.tls_non_verificato ?? corrente.tls_non_verificato,
    triage_attivo: input.triage_attivo ?? corrente.triage_attivo,
    triage_soglia: input.triage_soglia ?? corrente.triage_soglia,
    triage_priorita: input.triage_priorita !== undefined ? input.triage_priorita : corrente.triage_priorita,
    triage_operatore: input.triage_operatore !== undefined ? input.triage_operatore : corrente.triage_operatore,
    triage_osservazione: input.triage_osservazione ?? corrente.triage_osservazione,
  };

  // Le caselle Gmail non hanno password (solo refresh token): la richiesta
  // di password di validazione salta, altrimenti i toggle abilitata/
  // predefinita dalla UI fallirebbero con "Password obbligatoria".
  const errore = validaInput(merged, !corrente.ha_password && corrente.tipo !== "gmail");
  if (errore) return { ok: false, error: errore };

  if (input.indirizzo && input.indirizzo.trim().toLowerCase() !== corrente.indirizzo) {
    const occupato = await db
      .prepare("SELECT id FROM caselle_email WHERE indirizzo = ? AND id != ?")
      .get([input.indirizzo.trim().toLowerCase(), id]);
    if (occupato) return { ok: false, error: "Esiste già una casella con questo indirizzo." };
  }

  if (merged.predefinita && !corrente.predefinita) await impostaDefault(id);
  if (!merged.predefinita && corrente.predefinita) await impostaDefault(null);

  const campi: string[] = ["data_aggiornamento = @data_aggiornamento"];
  const params: Record<string, string | number | null> = {
    id,
    data_aggiornamento: new Date().toISOString(),
  };

  const assegna = (col: string, valore: string | number | null) => {
    campi.push(`${col} = @${col}`);
    params[col] = valore;
  };

  assegna("etichetta", merged.etichetta.trim());
  assegna("indirizzo", merged.indirizzo.trim().toLowerCase());
  assegna("imap_host", merged.imap_host.trim());
  assegna("imap_port", merged.imap_port);
  assegna("imap_secure", merged.imap_secure ? 1 : 0);
  assegna("smtp_host", merged.smtp_host.trim());
  assegna("smtp_port", merged.smtp_port);
  assegna("smtp_secure", merged.smtp_secure ? 1 : 0);
  assegna("utente", merged.utente.trim());
  assegna("abilitata", merged.abilitata ? 1 : 0);
  assegna("predefinita", merged.predefinita ? 1 : 0);
  assegna("tls_non_verificato", merged.tls_non_verificato ? 1 : 0);
  assegna("triage_attivo", merged.triage_attivo === false ? 0 : 1);
  assegna("triage_soglia", Number(merged.triage_soglia ?? 0.7));
  assegna("triage_priorita", merged.triage_priorita ?? null);
  assegna("triage_operatore", merged.triage_operatore?.trim() || null);
  assegna("triage_osservazione", merged.triage_osservazione === false ? 0 : 1);
  if (merged.password) assegna("password_cifrata", cifraSecret(merged.password));

  await db
    .prepare(`UPDATE caselle_email SET ${campi.join(", ")} WHERE id = @id`)
    .run(params);

  const casella = await getCasella(id);
  if (!casella) return { ok: false, error: "Casella non trovata dopo l'aggiornamento." };
  return { ok: true, casella };
}

export async function eliminaCasella(id: string): Promise<{ ok: boolean; error?: string }> {
  const corrente = await getCasella(id);
  if (!corrente) return { ok: false, error: "Casella non trovata." };
  // La pivot non ha cascata applicata dal DB: si pulisce esplicitamente,
  // altrimenti restano accessi orfani verso una casella che non esiste piu'.
  await db.batch([
    { sql: "DELETE FROM caselle_operatori WHERE casella_id = @id", params: { id } },
    { sql: "DELETE FROM caselle_email WHERE id = @id", params: { id } },
  ]);
  // Se era quella predefinita, nessuna casella lo e' piu': le uscite
  // senza contesto cadranno sull'SMTP di env (fallback previsto).
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Accesso degli operatori alle caselle
// ---------------------------------------------------------------------------

interface CasellaVisibileRow {
  id: string;
  etichetta: string;
  indirizzo: string;
  abilitata: number;
}

// Elenco SICURO per la UI: niente host, utente o credenziali. L'admin vede
// tutte le caselle; l'operatore solo quelle assegnate.
export async function caselleVisibili(operatore: {
  id: string;
  ruolo: string;
}): Promise<CasellaVisibile[]> {
  const rows =
    operatore.ruolo === "admin"
      ? await db
          .prepare(
            `SELECT id, etichetta, indirizzo, abilitata
             FROM caselle_email ORDER BY predefinita DESC, indirizzo`
          )
          .all()
      : await db
          .prepare(
            `SELECT c.id, c.etichetta, c.indirizzo, c.abilitata
             FROM caselle_email c
             JOIN caselle_operatori co ON co.casella_id = c.id
             WHERE co.operatore_id = @operatore_id
             ORDER BY c.predefinita DESC, c.indirizzo`
          )
          .all({ operatore_id: operatore.id });

  return (rows as unknown as CasellaVisibileRow[]).map((r) => ({
    id: String(r.id),
    etichetta: String(r.etichetta),
    indirizzo: String(r.indirizzo),
    abilitata: Number(r.abilitata) === 1,
  }));
}

// Un admin vede tutto; un operatore solo le caselle assegnate. Una email
// senza casella (storico) non e' mai visibile a un operatore.
export async function puoVedereCasella(
  operatore: { id: string; ruolo: string },
  casellaId: string | null
): Promise<boolean> {
  // L'admin vede anche le email storiche senza casella; per un operatore
  // un'email senza casella non e' mai accessibile.
  if (operatore.ruolo === "admin") return true;
  if (!casellaId) return false;
  const row = await db
    .prepare(
      "SELECT 1 AS uno FROM caselle_operatori WHERE casella_id = ? AND operatore_id = ?"
    )
    .get([casellaId, operatore.id]);
  return Boolean(row);
}

// Pannello admin di una casella: tutti gli operatori con il flag di accesso.
export async function operatoriConAccesso(
  casellaId: string
): Promise<AccessoCasellaOperatore[]> {
  const rows = await db
    .prepare(
      `SELECT o.id AS operatore_id, o.nome, o.email, o.attivo,
              CASE WHEN o.ruolo = 'admin' THEN 1 ELSE 0 END AS admin,
              CASE WHEN co.operatore_id IS NULL THEN 0 ELSE 1 END AS abilitato
       FROM operatori o
       LEFT JOIN caselle_operatori co
         ON co.casella_id = @casella_id AND co.operatore_id = o.id
       ORDER BY o.nome`
    )
    .all({ casella_id: casellaId });

  return (rows as unknown as Array<{
    operatore_id: string;
    nome: string;
    email: string;
    attivo: number;
    admin: number;
    abilitato: number;
  }>).map((r) => ({
    operatore_id: String(r.operatore_id),
    nome: String(r.nome),
    email: String(r.email),
    admin: Number(r.admin) === 1,
    attivo: Number(r.attivo) === 1,
    abilitato: Number(r.abilitato) === 1,
  }));
}

export async function impostaAccessoCasella(
  casellaId: string,
  operatoreId: string,
  abilitato: boolean
): Promise<void> {
  if (abilitato) {
    await db
      .prepare(
        `INSERT INTO caselle_operatori (casella_id, operatore_id, data_creazione)
         VALUES (@casella_id, @operatore_id, @now)
         ON CONFLICT (casella_id, operatore_id) DO NOTHING`
      )
      .run({
        casella_id: casellaId,
        operatore_id: operatoreId,
        now: new Date().toISOString(),
      });
    return;
  }
  await db
    .prepare(
      "DELETE FROM caselle_operatori WHERE casella_id = ? AND operatore_id = ?"
    )
    .run([casellaId, operatoreId]);
}
