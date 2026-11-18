import { getTursoClient } from "./turso-client";
import { decifraSecret } from "./cifratura";

// Lettura caselle email per l'IMAP worker (processo separato da Next).
//
// Questo modulo NON importa lib/db.ts (server-only esploderebbe fuori da
// Next) ne lib/caselle.ts (che a sua volta importa db): usa direttamente il
// client Turso condiviso di lib/turso-client.ts.
//
// Nessuna garanzia che lo schema esista al primo ciclo del worker (l'app
// crea le tabelle lazy al primo accesso): un errore qui viene lasciato
// propagare al chiamante, che logga e riprova al ciclo successivo.

export interface CasellaWorker {
  id: string;
  indirizzo: string;
  tlsNonVerificato: boolean;
  // Cursore persistente: UID piu' alto gia' processato e UIDVALIDITY della
  // cartella al momento della scrittura. Se UIDVALIDITY cambia, gli UID non
  // sono piu' comparabili e il cursore va azzerato.
  ultimoUid: number | null;
  uidValidita: number | null;
  imap: { host: string; port: number; secure: boolean; user: string; pass: string };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
}

export async function caselleAbilitatePerWorker(): Promise<CasellaWorker[]> {
  const client = getTursoClient();
  // Solo caselle IMAP: quelle Gmail (tipo='gmail') non hanno credenziali
  // IMAP/SMTP valide e vengono pollate dal worker Gmail (lib/gmail-worker.ts).
  // Fallback: se la colonna tipo non esiste ancora (il worker e' partito
  // PRIMA che l'app crei lo schema lazy), si riprova senza il filtro — la
  // riga Gmail verrebbe poi scartata in fase di decrittografia della
  // password vuota, senza bloccare le IMAP.
  let result;
  try {
    result = await client.execute(
      `SELECT id, indirizzo, imap_host, imap_port, imap_secure,
              smtp_host, smtp_port, smtp_secure, utente, password_cifrata, tls_non_verificato,
              ultimo_uid, uid_validita
       FROM caselle_email
       WHERE abilitata = 1 AND tipo = 'imap'
       ORDER BY indirizzo`
    );
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : String(err);
    if (!messaggio.includes("tipo")) throw err;
    result = await client.execute(
      `SELECT id, indirizzo, imap_host, imap_port, imap_secure,
              smtp_host, smtp_port, smtp_secure, utente, password_cifrata, tls_non_verificato,
              ultimo_uid, uid_validita
       FROM caselle_email
       WHERE abilitata = 1
       ORDER BY indirizzo`
    );
  }

  const out: CasellaWorker[] = [];
  for (const row of result.rows) {
    const r = row as unknown as {
      id: string;
      indirizzo: string;
      imap_host: string;
      imap_port: number;
      imap_secure: number;
      smtp_host: string;
      smtp_port: number;
      smtp_secure: number;
      utente: string;
      password_cifrata: string;
      tls_non_verificato: number;
      ultimo_uid: number | null;
      uid_validita: number | null;
    };
    try {
      const pass = decifraSecret(r.password_cifrata);
      out.push({
        id: r.id,
        indirizzo: r.indirizzo,
        tlsNonVerificato: Number(r.tls_non_verificato) === 1,
        ultimoUid: r.ultimo_uid != null ? Number(r.ultimo_uid) : null,
        uidValidita: r.uid_validita != null ? Number(r.uid_validita) : null,
        imap: {
          host: r.imap_host,
          port: Number(r.imap_port),
          secure: Number(r.imap_secure) === 1,
          user: r.utente,
          pass,
        },
        smtp: {
          host: r.smtp_host,
          port: Number(r.smtp_port),
          secure: Number(r.smtp_secure) === 1,
          user: r.utente,
          pass,
        },
      });
    } catch (err) {
      // ENCRYPTION_KEY cambiata o dato corrotto: salta questa casella ma
      // non bloccare le altre.
      console.error(`[caselle] Password non decifrata per ${r.indirizzo}:`, err);
    }
  }
  return out;
}

// Salva il cursore UID della casella. Scrittura best-effort: se fallisce, il
// worker riprocessa qualche email in piu' (deduplicate dal webhook) ma non si
// ferma.
export async function salvaCursoreCasella(
  casellaId: string,
  ultimoUid: number,
  uidValidita: number | null
): Promise<void> {
  // La casella configurata da .env non ha una riga DB.
  if (!casellaId || casellaId === "env") return;
  try {
    const client = getTursoClient();
    await client.execute({
      sql: `UPDATE caselle_email
            SET ultimo_uid = @uid, uid_validita = COALESCE(@validita, uid_validita)
            WHERE id = @id`,
      args: {
        uid: ultimoUid,
        validita: uidValidita,
        id: casellaId,
      },
    });
  } catch (err) {
    console.error(`[caselle] Cursore non salvato per ${casellaId}:`, err);
  }
}

export interface CasellaGmailWorker {
  id: string;
  indirizzo: string;
  etichetta: string;
  // Refresh token DECIFRATO: resta in memoria del worker, mai loggato.
  refreshToken: string;
  // High water mark (epoch sec) del collegamento: la query di polling usa
  // "is:unread after:<epoch>" per non importare le email preesistenti.
  gmailDaEpoch: number | null;
}

// Caselle Gmail abilitate per il worker OAuth (lib/gmail-worker.ts).
// Stesse regole di caselleAbilitatePerWorker(): solo Turso client, nessun
// import di lib/db.ts (server-only) — il worker gira fuori da Next.
export async function caselleGmailPerWorker(): Promise<CasellaGmailWorker[]> {
  const client = getTursoClient();
  const result = await client.execute(
    `SELECT id, indirizzo, etichetta, oauth_refresh_token_cifrata, gmail_da_epoch
     FROM caselle_email
     WHERE abilitata = 1 AND tipo = 'gmail'
     ORDER BY indirizzo`
  );

  const out: CasellaGmailWorker[] = [];
  for (const row of result.rows) {
    const r = row as unknown as {
      id: string;
      indirizzo: string;
      etichetta: string;
      oauth_refresh_token_cifrata: string | null;
      gmail_da_epoch: number | null;
    };
    if (!r.oauth_refresh_token_cifrata) {
      console.error(`[gmail] Casella ${r.indirizzo} senza refresh token: collega di nuovo l'account.`);
      continue;
    }
    try {
      out.push({
        id: r.id,
        indirizzo: r.indirizzo,
        etichetta: r.etichetta,
        refreshToken: decifraSecret(r.oauth_refresh_token_cifrata),
        gmailDaEpoch: r.gmail_da_epoch != null ? Number(r.gmail_da_epoch) : null,
      });
    } catch (err) {
      // ENCRYPTION_KEY cambiata o dato corrotto: salta questa casella.
      console.error(`[gmail] Refresh token non decifrato per ${r.indirizzo}:`, err);
    }
  }
  return out;
}
