import { NextResponse } from "next/server";
import { richiediChiaveApi } from "@/lib/chiavi-api";
import { getTicket, getTicketByNumero, insertMessage, updateTicket } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { registra } from "@/lib/registro";
import type { RuoloMessaggio } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/esterni/v1/tickets/{id}/messaggi
// Aggiunge un messaggio alla conversazione WhatsApp di un ticket. Solo ticket
// con canale=whatsapp: il bot non puo' scrivere nelle conversazioni email.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediChiaveApi(request, "tickets:write");
  if (!auth.ok) return auth.risposta;

  try {
    let ticket = await getTicket(params.id);
    if (!ticket) {
      const perNumero = await getTicketByNumero(params.id);
      if (perNumero) ticket = await getTicket(perNumero.id);
    }
    if (!ticket || ticket.canale !== "whatsapp") {
      return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      contenuto?: string;
      ruolo?: string;
    };
    const contenuto = typeof body.contenuto === "string" ? body.contenuto.trim() : "";
    if (!contenuto) {
      return NextResponse.json({ error: "contenuto obbligatorio." }, { status: 400 });
    }
    const ruolo: RuoloMessaggio = body.ruolo === "assistant" ? "assistant" : "user";

    const messaggioId = await insertMessage(ticket.id, {
      ruolo,
      contenuto,
      data_creazione: new Date().toISOString(),
    });

    let riaperto = false;
    if (ruolo === "user" && (ticket.stato === "CHIUSO" || ticket.stato === "RISOLTO")) {
      await updateTicket(ticket.id, { stato: "IN_CORSO" }, ticket, {
        origine: "api",
        operatore: ticket.operatore,
      });
      riaperto = true;
      await createNotification({
        titolo: "Ticket WhatsApp riaperto",
        messaggio: `${ticket.numero} - ${ticket.sommario_problema}`,
        ticket_id: ticket.id,
        tipo: "riapertura",
        destinatario_id: ticket.operatore_id ?? null,
      });
    }

    await registra({
      origine: "api",
      azione: "api.messaggio.aggiunto",
      entita: "ticket",
      entitaId: ticket.id,
      dettagli: { chiave_id: auth.chiave.id, messaggio_id: messaggioId, ruolo, riaperto },
    });

    return NextResponse.json({ ok: true, messaggio_id: messaggioId, riaperto }, { status: 201 });
  } catch (err) {
    console.error("POST /api/esterni/v1/tickets/[id]/messaggi", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
