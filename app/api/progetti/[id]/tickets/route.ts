import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { linkTicket, listTicketsProgetto, unlinkTicket } from "@/lib/progetti";

export const dynamic = "force-dynamic";

// Nessun controllo di ruolo: vedi la nota in app/api/progetti/route.ts.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

// L'esistenza del progetto si verifica con una SELECT che non legge nulla.
// `getProgetto` carica anche tutte le attivita' e tutti i ticket collegati:
// costava 3 richieste e migliaia di righe per rispondere "esiste".
async function progettoEsiste(id: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS uno FROM progetti WHERE id = ?`).get(id);
  return !!row;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    if (!(await progettoEsiste(params.id))) {
      return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
    }
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

  try {
    if (!(await progettoEsiste(params.id))) {
      return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { ticket_id?: string };
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
    if (!ticketId) {
      return NextResponse.json({ error: "Il ticket è obbligatorio." }, { status: 400 });
    }

    try {
      const link = await linkTicket(params.id, ticketId);
      return NextResponse.json(link, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Il doppione lo intercetta il vincolo UNIQUE(progetto_id, ticket_id):
      // non serve leggere tutta la lista dei ticket collegati per scoprirlo.
      if (msg.includes("UNIQUE") || msg.includes("constraint")) {
        return NextResponse.json(
          { error: "Ticket già collegato a questo progetto." },
          { status: 409 }
        );
      }
      throw err;
    }
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
