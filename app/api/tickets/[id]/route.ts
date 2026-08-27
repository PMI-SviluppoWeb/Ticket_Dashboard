import { NextResponse } from "next/server";
import { deleteTicket, getTicket, updateTicket } from "@/lib/tickets";
import type { Priorita, StatoTicket, TicketUpdate } from "@/lib/types";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  return NextResponse.json(ticket);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as TicketUpdate;

  const patch: TicketUpdate = {};
  if (body.stato !== undefined) {
    if (!STATI.includes(body.stato)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    patch.stato = body.stato;
  }
  if (body.priorita !== undefined) {
    if (!PRIORITA.includes(body.priorita)) {
      return NextResponse.json({ error: "Priorità non valida." }, { status: 400 });
    }
    patch.priorita = body.priorita;
  }
  if (body.note !== undefined) patch.note = body.note;
  if (body.operatore !== undefined) patch.operatore = body.operatore;
  if (body.contatto !== undefined) patch.contatto = body.contatto;
  if (body.telefono !== undefined) patch.telefono = body.telefono;
  if (body.email !== undefined) patch.email = body.email;

  const ticket = await updateTicket(params.id, patch);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  return NextResponse.json(ticket);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const ok = await deleteTicket(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
