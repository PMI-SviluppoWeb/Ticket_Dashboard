import { NextResponse } from "next/server";
import { join } from "path";
import { readFile } from "fs/promises";
import { getTicket, sanificaContatti } from "@/lib/tickets";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailAggiornamentoCliente } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { EMAIL_PLACEHOLDER } from "@/lib/contatti";
import { casellaPerTicket } from "@/lib/caselle";
import type { TechnicalNote, Allegato } from "@/lib/types";

const UPLOADS_DIR = join(process.cwd(), "uploads");

export async function POST(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const operatorId = request.headers.get("x-operator-id");

  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const found = await getTicket(params.id);
  if (!found) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  // Contatti estratti dal testo prima di controllare: senza questo il
  // messaggio al cliente viene rifiutato su un ticket creato dal centralino.
  const ticket = await sanificaContatti(found);

  if (!ticket.email || ticket.email === EMAIL_PLACEHOLDER) {
    return NextResponse.json(
      { error: "Il ticket non ha un indirizzo email valido: aggiungilo nei Dettagli Cliente." },
      { status: 400 }
    );
  }

  // Fetch the technical note
  const note = (await db
    .prepare(
      `SELECT id, ticket_id, titolo, problema, soluzione, operatore, data_creazione
       FROM technical_notes WHERE id = @noteId AND ticket_id = @ticketId`
    )
    .get({ noteId: params.noteId, ticketId: params.id })) as unknown as TechnicalNote | undefined;

  if (!note) {
    return NextResponse.json({ error: "Nota non trovata." }, { status: 404 });
  }

  // Fetch attachments for this note
  const allegati = (await db
    .prepare(
      `SELECT id, note_tecnica_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione
       FROM allegati WHERE note_tecnica_id = @noteId ORDER BY data_creazione ASC`
    )
    .all({ noteId: params.noteId })) as unknown as Allegato[];

  // Build email attachments from disk
  const emailAttachments: { filename: string; path: string }[] = [];
  for (const allegato of allegati) {
    const filePath = join(UPLOADS_DIR, allegato.nome_file);
    try {
      await readFile(filePath);
      emailAttachments.push({
        filename: allegato.nome_originale,
        path: filePath,
      });
    } catch {
      // File not found on disk, skip
    }
  }

  // Il testo per il cliente arriva dalla dialog di conferma (editato
  // dall'operatore): qui NON si riusa il contenuto tecnico della nota
  // (problema/soluzione), che e' pensato per il team, non per il cliente.
  const body = (await request.json().catch(() => ({}))) as {
    titolo?: string;
    messaggio?: string;
  };
  const messaggio = body.messaggio?.trim();
  if (!messaggio) {
    return NextResponse.json(
      { error: "Messaggio per il cliente obbligatorio." },
      { status: 400 }
    );
  }

  const html = emailAggiornamentoCliente({
    numero: ticket.numero,
    cliente: ticket.cliente,
    titolo: body.titolo?.trim() || note.titolo || "Aggiornamento",
    messaggio,
    allegati: allegati.map((a) => a.nome_originale),
  });

  const result = await sendEmail({
    to: ticket.email,
    subject: `[Support Desk] Aggiornamento ticket ${ticket.numero}`,
    html,
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    // Stesso account che ha ricevuto la mail del ticket.
    casellaId: (await casellaPerTicket(ticket.id)) ?? undefined,
  });

  await logEmail({
    ticket_id: ticket.id,
    tipo: "nuova_nota",
    destinatario: ticket.email,
    oggetto: `[Support Desk] Aggiornamento ticket ${ticket.numero}`,
    corpo: html,
    stato: result.ok ? "inviata" : "errore",
    errore: result.error ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, attachments: allegati.length });
}
