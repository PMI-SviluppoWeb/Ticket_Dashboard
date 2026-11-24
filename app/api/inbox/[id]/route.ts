import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";
import { stripHtml } from "@/lib/email-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dettaglio di una singola email in arrivo. Serve alla Posta in arrivo per
// mostrare il messaggio completo prima di decidere se creare il ticket.
// Il corpo HTML non viene restituito al client: viene convertito in testo
// (niente HTML non fidato renderizzato nell'app).
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const row = await db
      .prepare(
        `SELECT i.id, i.message_id, i.from_email, i.from_nome, i.subject,
                i.body_preview, i.body_text, i.body_html, i.ticket_id, i.casella_id,
                i.stato, i.stato_triage, i.esito_ai, i.confidenza, i.motivo,
                i.in_reply_to, i.riferimenti, i.correzione_umana, i.corretto_da,
                i.data_creazione,
                t.numero AS numero_ticket,
                c.indirizzo AS casella_indirizzo
         FROM email_inbox i
         LEFT JOIN tickets t ON t.id = i.ticket_id
         LEFT JOIN caselle_email c ON c.id = i.casella_id
         WHERE i.id = ?`
      )
      .get(params.id);

    if (!row) {
      return NextResponse.json({ error: "Email non trovata." }, { status: 404 });
    }

    const bodyText = String(row.body_text ?? "").trim();
    const bodyHtml = row.body_html ? String(row.body_html) : "";
    const testo = bodyText || (bodyHtml ? stripHtml(bodyHtml) : String(row.body_preview ?? ""));

    return NextResponse.json({
      email: {
        id: String(row.id),
        message_id: String(row.message_id),
        from_email: String(row.from_email),
        from_nome: row.from_nome ? String(row.from_nome) : null,
        subject: String(row.subject),
        body_preview: row.body_preview ? String(row.body_preview) : null,
        body_text: testo,
        body_html_disponibile: Boolean(bodyHtml),
        html_convertito: !bodyText && Boolean(bodyHtml),
        ticket_id: row.ticket_id ? String(row.ticket_id) : null,
        numero_ticket: row.numero_ticket ? String(row.numero_ticket) : null,
        casella_id: row.casella_id ? String(row.casella_id) : null,
        casella_indirizzo: row.casella_indirizzo ? String(row.casella_indirizzo) : null,
        stato: String(row.stato),
        stato_triage: row.stato_triage ? String(row.stato_triage) : null,
        esito_ai: row.esito_ai ? String(row.esito_ai) : null,
        confidenza: row.confidenza != null ? Number(row.confidenza) : null,
        motivo: row.motivo ? String(row.motivo) : null,
        in_reply_to: row.in_reply_to ? String(row.in_reply_to) : null,
        riferimenti: row.riferimenti ? String(row.riferimenti) : null,
        correzione_umana: row.correzione_umana ? String(row.correzione_umana) : null,
        corretto_da: row.corretto_da ? String(row.corretto_da) : null,
        data_creazione: String(row.data_creazione),
      },
    });
  } catch (err) {
    console.error("GET /api/inbox/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
