import { NextResponse } from "next/server";
import { deleteTicket, getTicket, updateTicket } from "@/lib/tickets";
import { getOperatorById } from "@/lib/auth";
import type { Priorita, StatoTicket, TicketUpdate } from "@/lib/types";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

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
  const operatorId = getOperatorId(request);
  const operatorRole = getOperatorRole(request);
  
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const operator = await getOperatorById(operatorId);
  if (!operator) {
    return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
  }

  const body = (await request.json()) as TicketUpdate;

  const patch: TicketUpdate = {};
  if (body.stato !== undefined) {
    if (!STATI.includes(body.stato)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    patch.stato = body.stato;
    
    // Auto-assign operator when taking a ticket (NUOVO -> IN_CORSO)
    if (body.stato === "IN_CORSO" && body.operatore === undefined) {
      patch.operatore = operator.nome;
    }
    // Auto-clear operator when releasing a ticket (IN_CORSO -> NUOVO)
    if (body.stato === "NUOVO" && body.operatore === undefined) {
      patch.operatore = null;
    }
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
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  const operatorRole = getOperatorRole(request);
  
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  
  // Only admins can delete tickets
  if (operatorRole !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  const ok = await deleteTicket(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
