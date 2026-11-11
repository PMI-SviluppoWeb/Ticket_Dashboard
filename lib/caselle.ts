import { db } from "./db";
import { cifraSecret, decifraSecret } from "./cifratura";
import "server-only";

// Accesso dati per le caselle email multi-account.
//
// Ogni riga = un account IMAP+SMTP pollato dall'IMAP worker e usato per le
// risposte. Le password viaggiano solo cifrate (lib/cifratura.ts): qui le
// funzioni di lettura "grezza" sono private e le API espongono solo righe
// senza password (ha_password booleano).

import type { CasellaEmail, CasellaEmailInput } from "./types";

interface CasellaRow {
  id: string;
  etichetta: string;
  indirizzo: string;
  imap_host: string;
  imap_port: number;
  imap_secure: number;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  utente: string;
  password_cifrata: string;
  abilitata: number;
  predefinita: number;
  data_creazione: string;
  data_aggiornamento: string;
}

const SELECT_CASELLE = `SELECT id, etichetta, indirizzo, imap_host, imap_port, imap_secure,
  smtp_host, smtp_port, smtp_secure, utente, password_cifrata, abilitata, predefinita,
  data_creazione, data_aggiornamento FROM caselle_email`;

function aTipo(r: CasellaRow): CasellaEmail {
  return {
    id: r.id,
    etichetta: r.etichetta,
    indirizzo: r.indirizzo,
    imap_host: r.imap_host,
    imap_port: Number(r.imap_port),
    imap_secure: Number(r.imap_secure) === 1,
    smtp_host: r.smtp_host,
    smtp_port: Number(r.smtp_port),
    smtp_secure: Number(r.smtp_secure) === 1,
    utente: r.utente,
    abilitata: Number(r.abilitata) === 1,
    predefinita: Number(r.predefinita) === 1,
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

export type EsitoSalvataggio = { ok: true; casella: CasellaEmail } | { ok: false; error: string };

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
        data_creazione, data_aggiornamento)
       VALUES (@id, @etichetta, @indirizzo, @imap_host, @imap_port, @imap_secure,
        @smtp_host, @smtp_port, @smtp_secure, @utente, @password_cifrata, @abilitata, @predefinita,
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
  };

  const errore = validaInput(merged, !corrente.ha_password);
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
  const params: Record<string, string | number> = {
    id,
    data_aggiornamento: new Date().toISOString(),
  };

  const assegna = (col: string, valore: string | number) => {
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
  await db.prepare("DELETE FROM caselle_email WHERE id = ?").run(id);
  // Se era quella predefinita, nessuna casella lo e' piu': le uscite
  // senza contesto cadranno sull'SMTP di env (fallback previsto).
  return { ok: true };
}
