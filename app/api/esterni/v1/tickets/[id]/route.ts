import { NextResponse } from "next/server";
import { richiediChiaveApi } from "@/lib/chiavi-api";
import { getTicket, getTicketByNumero } from "@/lib/tickets";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/esterni/v1/tickets/{id}
// Il bot riceve SOLO lo stato del ticket che ha creato (canale whatsapp):
// nessun contenuto, nessun dato di altri canali o clienti.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediChiaveApi(request, "tickets:read");
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

    await registra({
      origine: "api",
      azione: "api.ticket.letto",
      entita: "ticket",
      entitaId: ticket.id,
      dettagli: { chiave_id: auth.chiave.id },
    });

    return NextResponse.json({
      id: ticket.id,
      numero: ticket.numero,
      stato: ticket.stato,
      aggiornato_il: ticket.aggiornato_il ?? ticket.data_aggiornamento,
    });
  } catch (err) {
    console.error("GET /api/esterni/v1/tickets/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
