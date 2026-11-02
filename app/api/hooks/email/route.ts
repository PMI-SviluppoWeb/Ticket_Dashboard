import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { createTicket } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailAutoReply } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { classifyEmail } from "@/lib/email-classifier";
import type { TicketInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingEmail {
  messageId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  date?: string;
}

async function isDuplicate(messageId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM email_inbox WHERE message_id = ?")
    .get(messageId);
  return !!row;
}

async function logIncomingEmail(data: {
  messageId: string;
  fromEmail: string;
  fromNome: string | null;
  subject: string;
  bodyPreview: string;
  bodyHtml: string | null;
  ticketId: string | null;
  stato: "processata" | "errore" | "ignorata";
}): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO email_inbox (id, message_id, from_email, from_nome, subject, body_preview, body_html, ticket_id, stato, data_creazione)
       VALUES (@id, @message_id, @from_email, @from_nome, @subject, @body_preview, @body_html, @ticket_id, @stato, @data_creazione)`
    )
    .run({
      id,
      message_id: data.messageId,
      from_email: data.fromEmail,
      from_nome: data.fromNome,
      subject: data.subject,
      body_preview: data.bodyPreview,
      body_html: data.bodyHtml,
      ticket_id: data.ticketId,
      stato: data.stato,
      data_creazione: new Date().toISOString(),
    });
}

async function findClienteByEmail(email: string): Promise<{ nome: string } | null> {
  const row = await db
    .prepare("SELECT ragione_sociale FROM clienti WHERE email = ? AND attivo = 1")
    .get(email);
  return row ? { nome: row.ragione_sociale as string } : null;
}

// L'endpoint resta pubblico (è un webhook, non una sessione) ma autenticato con
// un segreto condiviso con l'IMAP worker: senza, chiunque sulla rete creerebbe
// ticket e farrebbe partire autorisposte SMTP a indirizzi scelti.
// Fail-closed: in produzione un WEBHOOK_SECRET mancante blocca tutto.
function verificaSegreto(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const segreto = process.env.WEBHOOK_SECRET;
  if (!segreto) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: "WEBHOOK_SECRET non configurata sul server." };
    }
    // Solo in sviluppo locale il webhook gira senza segreto.
    return { ok: true };
  }
  const ricevuto = request.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(segreto, "utf8");
  const b = Buffer.from(ricevuto, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Segreto webhook non valido." };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const segreto = verificaSegreto(request);
    if (!segreto.ok) {
      return NextResponse.json({ error: segreto.error }, { status: segreto.status });
    }

    const email: IncomingEmail = await request.json();

    if (!email.messageId || !email.from || !email.subject) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: messageId, from, subject." },
        { status: 400 }
      );
    }

    // 1. Deduplicazione
    if (await isDuplicate(email.messageId)) {
      return NextResponse.json({ ok: true, skipped: "duplicato" });
    }

    // 2. Classificazione AI
    const classification = await classifyEmail({
      from: email.from,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
    });

    // 3. Cerca cliente in tabella clienti
    const cliente = await findClienteByEmail(email.from);
    const clienteNome = cliente?.nome ?? email.fromName ?? email.from.split("@")[0];
    const contatto = email.fromName || email.from;

    // 4. Crea ticket
    const ticket = await createTicket({
      cliente: clienteNome,
      contatto,
      telefono: null,
      email: email.from,
      modulo_software: classification.modulo_suggerito,
      sommario_problema: classification.sommario,
      descrizione_dettagliata: email.body || email.subject,
      priorita: classification.priorita,
      note: classification.requiresHumanReview
        ? `[AI] Revisione umana richiesta - Intent: ${classification.intent}`
        : `[AI] Intent: ${classification.intent}`,
      messaggi: [
        {
          id: crypto.randomUUID(),
          ruolo: "user" as const,
          contenuto: `Email ricevuta da ${email.from}:\n\nOggetto: ${email.subject}\n\n${email.body || "(nessun corpo testuale)"}`,
          data_creazione: new Date().toISOString(),
        },
      ],
    });

    // 5. Logga email in entrata
    await logIncomingEmail({
      messageId: email.messageId,
      fromEmail: email.from,
      fromNome: email.fromName ?? null,
      subject: email.subject,
      bodyPreview: (email.body || email.subject).slice(0, 500),
      bodyHtml: email.bodyHtml ?? null,
      ticketId: ticket.id,
      stato: "processata",
    });

    // 6. Notifica in-app per gli operatori
    const prioritaLabel = classification.priorita === "ALTA" ? " ALTA" : "";
    await createNotification({
      titolo: `Nuovo ticket da email${prioritaLabel}`,
      messaggio: `${ticket.numero} - ${classification.sommario} (${clienteNome})`,
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
    });

    // 7. Auto-reply al cliente
    const autoReplyHtml = emailAutoReply({
      numero: ticket.numero,
      cliente: clienteNome,
      oggettoOriginale: email.subject,
    });
    const replyResult = await sendEmail({
      to: email.from,
      subject: `[Support Desk] ${ticket.numero} - Ricevuto la tua richiesta`,
      html: autoReplyHtml,
    });
    await logEmail({
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
      destinatario: email.from,
      oggetto: `[Support Desk] ${ticket.numero} - Ricevuto la tua richiesta`,
      corpo: autoReplyHtml,
      stato: replyResult.ok ? "inviata" : "errore",
      errore: replyResult.error ?? null,
    });

    return NextResponse.json({
      ok: true,
      ticket: ticket.numero,
      classification: {
        intent: classification.intent,
        priorita: classification.priorita,
        requiresHumanReview: classification.requiresHumanReview,
      },
    });
  } catch (err) {
    console.error("POST /api/hooks/email", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
