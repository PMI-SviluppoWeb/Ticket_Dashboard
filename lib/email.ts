import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { credenzialiCasella, getCasellaDefault } from "./caselle";

interface TransporterConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

// Timeout comuni: senza, un SMTP che non risponde lascia appesa la richiesta
// HTTP che sta aspettando l'invio (es. il cambio di stato di un ticket): il
// default di sistema di nodemailer e' di 2 minuti, troppo per una richiesta
// utente.
const TIMEOUT = {
  connectionTimeout: 8_000,
  greetingTimeout: 8_000,
  socketTimeout: 15_000,
  tls: { rejectUnauthorized: false },
};

// Transporter di fallback: SMTP globale in .env. Usato quando nessuna casella
// del DB e' applicabile (nessuna predefinita, oppure ENCRYPTION_KEY mancante).
const transporterEnv = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT ?? 587) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  ...TIMEOUT,
});

// Cache dei transporter per casella: crearne uno per invio farebbe aprire e
// chiudere un socket SMTP a ogni messaggio. La cache viene invalidata quando
// una casella viene salvata/eliminata (invalidaTransporter).
const transporterCache = new Map<string, Transporter>();

export function invalidaTransporter(casellaId?: string): void {
  if (casellaId) {
    transporterCache.delete(casellaId);
    return;
  }
  transporterCache.clear();
}

function transporterPerConfig(cfg: TransporterConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    ...TIMEOUT,
  });
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

// Id sintetico della casella configurata in .env: non esiste nel DB, quindi
// l'invio deve cadere sull'SMTP globale di env (coincide con il mittente).
const CASELLA_ENV_ID = "env";

// Risolve il mittente, in ordine:
//  1. casellaId esplicito (risposta a una mail ricevuta: stesso account);
//  2. casella predefinita dal DB (ticket creati manualmente);
//  3. SMTP globale di env (fallback retrocompatibile).
async function risolviMittente(
  casellaId?: string
): Promise<{ transporter: Transporter; from: string } | null> {
  if (casellaId === CASELLA_ENV_ID) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
    return {
      transporter: transporterEnv,
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    };
  }

  const id =
    casellaId ??
    (await getCasellaDefault())?.id ??
    null;

  if (id) {
    const cred = await credenzialiCasella(id);
    if (cred) {
      let t = transporterCache.get(id);
      if (!t) {
        t = transporterPerConfig(cred.smtp);
        transporterCache.set(id, t);
      }
      return { transporter: t, from: cred.indirizzo };
    }
    // Casella indicata ma non risolvibile (eliminata o password non
    // decifrabile): si scende al mittente successivo invece di bloccare
    // l'invio, ma si logga per non perdere il problema di vista.
    if (casellaId) {
      console.error(`[email] Casella ${casellaId} non risolvibile, uso il mittente di fallback.`);
    }
  }

  const predefinita = casellaId ? await getCasellaDefault() : null;
  if (predefinita) {
    const cred = await credenzialiCasella(predefinita.id);
    if (cred) {
      let t = transporterCache.get(predefinita.id);
      if (!t) {
        t = transporterPerConfig(cred.smtp);
        transporterCache.set(predefinita.id, t);
      }
      return { transporter: t, from: cred.indirizzo };
    }
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return {
    transporter: transporterEnv,
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
  casellaId?: string;
}): Promise<EmailResult> {
  try {
    const mittente = await risolviMittente(opts.casellaId);
    if (!mittente) {
      return {
        ok: false,
        error: opts.casellaId
          ? "Casella email non disponibile per l'invio."
          : "Configurazione SMTP mancante.",
      };
    }

    await mittente.transporter.sendMail({
      from: mittente.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    return { ok: true };
  } catch (err) {
    console.error("Errore invio email:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Errore sconosciuto." };
  }
}
