import nodemailer from "nodemailer";
import { join } from "path";

const port = Number(process.env.SMTP_PORT ?? 587);
const UPLOADS_DIR = join(process.cwd(), "uploads");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export interface EmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
}): Promise<EmailResult> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: false, error: "Configurazione SMTP mancante." };
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
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
