import { NextResponse } from "next/server";
import { getTicket } from "@/lib/tickets";
import { getProgetto, linkTicket, listTicketsProgetto, unlinkTicket } from "@/lib/progetti";

export const dynamic = "force-dynamic";

// Nessun controllo di ruolo: vedi la nota in app/api/progetti/route.ts.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const progetto = await getProgetto(params.id);
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
  }

  try {
    const tickets = await listTicketsProgetto(params.id);
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("GET /api/progetti/[id]/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const progetto = await getProgetto(params.id);
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { ticket_id?: string };
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
    if (!ticketId) {
      return NextResponse.json({ error: "Il ticket è obbligatorio." }, { status: 400 });
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
    }

    // Il vincolo UNIQUE(progetto_id, ticket_id) fa lanciare l'insert sul
    // doppione: va tradotto in 409, non in 500.
    const esistente = await listTicketsProgetto(params.id);
    if (esistente.some((t) => t.id === ticketId)) {
      return NextResponse.json(
        { error: "Ticket già collegato a questo progetto." },
        { status: 409 }
      );
    }

    const link = await linkTicket(params.id, ticketId);
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    console.error("POST /api/progetti/[id]/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const ticketId = new URL(request.url).searchParams.get("ticket_id") ?? "";
  if (!ticketId) {
    return NextResponse.json({ error: "Parametro ticket_id obbligatorio." }, { status: 400 });
  }

  try {
    const ok = await unlinkTicket(params.id, ticketId);
    if (!ok) {
      return NextResponse.json({ error: "Collegamento non trovato." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/progetti/[id]/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
