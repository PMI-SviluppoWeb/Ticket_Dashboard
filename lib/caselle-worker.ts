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
  imap: { host: string; port: number; secure: boolean; user: string; pass: string };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
}

export async function caselleAbilitatePerWorker(): Promise<CasellaWorker[]> {
  const client = getTursoClient();
  const result = await client.execute(
    `SELECT id, indirizzo, imap_host, imap_port, imap_secure,
            smtp_host, smtp_port, smtp_secure, utente, password_cifrata
     FROM caselle_email
     WHERE abilitata = 1
     ORDER BY indirizzo`
  );

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
    };
    try {
      const pass = decifraSecret(r.password_cifrata);
      out.push({
        id: r.id,
        indirizzo: r.indirizzo,
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
