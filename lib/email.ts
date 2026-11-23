import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { credenzialiCasella, credenzialiGmail, getCasellaDefault } from "./caselle";
import { inviaEmailGmail, ottieniAccessToken } from "./gmail-oauth";
import { contestoThreading, oggettoConToken } from "./threading";

interface TransporterConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  tlsNonVerificato?: boolean;
}

// Timeout comuni: senza, un SMTP che non risponde lascia appesa la richiesta
// HTTP che sta aspettando l'invio (es. il cambio di stato di un ticket): il
// default di sistema di nodemailer e' di 2 minuti, troppo per una richiesta
// utente.
const TIMEOUT = {
  connectionTimeout: 8_000,
  greetingTimeout: 8_000,
  socketTimeout: 15_000,
};

function tlsOpzioni(nonVerificato?: boolean) {
  // Default sicuro: certificato non valido = connessione rifiutata.
  // La deroga e' per-casella (caselle_email.tls_non_verificato), non globale.
  return { rejectUnauthorized: !nonVerificato };
}

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
  tls: tlsOpzioni(false),
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
    tls: tlsOpzioni(cfg.tlsNonVerificato),
  });
}

export interface EmailResult {
  ok: boolean;
  error?: string;
  // Message-ID dell'email inviata: va salvato in email_log per agganciare la
  // risposta del cliente (In-Reply-To).
  messageId?: string;
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
        t = transporterPerConfig({ ...cred.smtp, tlsNonVerificato: cred.tlsNonVerificato });
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
        t = transporterPerConfig({ ...cred.smtp, tlsNonVerificato: cred.tlsNonVerificato });
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

function dominioMessageId(from: string): string {
  const at = from.lastIndexOf("@");
  const dominio = at >= 0 ? from.slice(at + 1).replace(/[^a-zA-Z0-9.-]/g, "") : "";
  return dominio || process.env.EMAIL_MESSAGE_DOMAIN || "support-desk.local";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
  casellaId?: string;
  // Ticket di riferimento: aggiunge [TICK-xxxx] all'oggetto e imposta
  // In-Reply-To/References sull'ultima email della conversazione.
  ticketId?: string;
  // Override espliciti (es. autorisposta alla email appena ricevuta).
  inReplyTo?: string | null;
  riferimenti?: string[];
  // RFC 3834: dichiara l'email come automatica. Serve a fermare i loop con
  // altri auto-responder e con la nostra stessa casella.
  autoSubmitted?: "auto-replied" | "auto-generated";
}): Promise<EmailResult> {
  try {
    const oggettoBase = opts.subject;
    let inReplyTo = opts.inReplyTo ?? null;
    let riferimenti = [...(opts.riferimenti ?? [])];
    let oggetto = oggettoBase;

    if (opts.ticketId) {
      const ctx = await contestoThreading(opts.ticketId);
      oggetto = oggettoConToken(oggettoBase, ctx.numero);
      if (!inReplyTo && ctx.lastMessageId) inReplyTo = ctx.lastMessageId;
      riferimenti = Array.from(
        new Set([
          ...ctx.references,
          ...riferimenti,
          ...(inReplyTo ? [inReplyTo] : []),
        ])
      );
    }

    // Caselle Gmail (OAuth): invio via Gmail API con il refresh token, nessun
    // SMTP e nessuna password. Vale sia per la risposta a una mail ricevuta
    // (casellaId esplicito) sia per il mittente predefinito.
    const idMittente =
      opts.casellaId ?? (await getCasellaDefault())?.id ?? null;
    if (idMittente && idMittente !== CASELLA_ENV_ID) {
      const gmail = await credenzialiGmail(idMittente);
      if (gmail) {
        const accessToken = await ottieniAccessToken(gmail.refreshToken);
        const messageId = `<${crypto.randomUUID()}@${dominioMessageId(gmail.indirizzo)}>`;
        await inviaEmailGmail(accessToken, {
          to: opts.to,
          subject: oggetto,
          html: opts.html,
          attachments: opts.attachments,
          from: gmail.etichetta && gmail.etichetta !== gmail.indirizzo
            ? `${gmail.etichetta} <${gmail.indirizzo}>`
            : gmail.indirizzo,
          messageId,
          inReplyTo,
          references: riferimenti,
          autoSubmitted: opts.autoSubmitted,
        });
        return { ok: true, messageId };
      }
      // Non e' una casella Gmail: si procede con la risoluzione SMTP sotto.
    }

    const mittente = await risolviMittente(opts.casellaId);
    if (!mittente) {
      return {
        ok: false,
        error: opts.casellaId
          ? "Casella email non disponibile per l'invio."
          : "Configurazione SMTP mancante.",
      };
    }

    const messageId = `<${crypto.randomUUID()}@${dominioMessageId(mittente.from)}>`;
    await mittente.transporter.sendMail({
      from: mittente.from,
      to: opts.to,
      subject: oggetto,
      html: opts.html,
      attachments: opts.attachments,
      messageId,
      headers: {
        ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
        ...(riferimenti.length > 0 ? { References: riferimenti.join(" ") } : {}),
        ...(opts.autoSubmitted
          ? {
              "Auto-Submitted": opts.autoSubmitted,
              "X-Auto-Response-Suppress": "All",
              Precedence: "auto_reply",
            }
          : {}),
      },
    });
    return { ok: true, messageId };
  } catch (err) {
    console.error("Errore invio email:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Errore sconosciuto." };
  }
}
