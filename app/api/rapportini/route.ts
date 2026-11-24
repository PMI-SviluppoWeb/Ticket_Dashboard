import { NextResponse } from "next/server";
import { generaRapportinoDaTicket, listaRapportini } from "@/lib/rapportini";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/rapportini — elenco con filtri (ticket, stato, cliente, testo).
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get("limit");
    const rapportini = await listaRapportini({
      ticketId: searchParams.get("ticket_id") ?? undefined,
      stato: searchParams.get("stato") ?? undefined,
      clienteId: searchParams.get("cliente_id") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    });
    return NextResponse.json({ rapportini });
  } catch (err) {
    console.error("GET /api/rapportini", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// POST /api/rapportini — genera (o rigenera in bozza) il rapportino di un
// ticket chiuso. Body: { ticketId }.
export async function POST(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as { ticketId?: string };
    if (typeof body.ticketId !== "string" || !body.ticketId) {
      return NextResponse.json({ error: "ticketId obbligatorio." }, { status: 400 });
    }
    const esito = await generaRapportinoDaTicket(body.ticketId, {
      operatoreId: auth.operatore.id,
      operatore: auth.operatore.nome,
    });
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ rapportino: esito.rapportino }, { status: 201 });
  } catch (err) {
    console.error("POST /api/rapportini", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
