import { NextResponse } from "next/server";
import { deleteTicket, getTicket, updateTicket } from "@/lib/tickets";
import { getOperatorById } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailAssegnazione, emailChiusura } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
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

  const existingTicket = await getTicket(params.id);
  if (!existingTicket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  const body = (await request.json()) as TicketUpdate;

  const patch: TicketUpdate = {};
  if (body.stato !== undefined) {
    if (!STATI.includes(body.stato)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    patch.stato = body.stato;

    if (body.stato === "IN_CORSO" && body.operatore === undefined) {
      patch.operatore = operator.nome;
    }
    if (body.stato === "NUOVO" && body.operatore === undefined) {
      patch.operatore = null;
    }
  }
  if (body.priorita !== undefined) {
    if (!PRIORITA.includes(body.priorita)) {
      return NextResponse.json({ error: "Priorita' non valida." }, { status: 400 });
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

  // Send email on status change
  if (body.stato && existingTicket.email) {
    const ticketEmail = existingTicket.email;

    if (body.stato === "IN_CORSO" && existingTicket.stato === "NUOVO") {
      const operatorName = patch.operatore ?? operator.nome;
      const html = emailAssegnazione({
        numero: ticket.numero,
        cliente: ticket.cliente,
        operatore: operatorName,
      });
      const result = await sendEmail({
        to: ticketEmail,
        subject: `[Support Desk] Ticket ${ticket.numero} preso in carico`,
        html,
      });
      await logEmail({
        ticket_id: ticket.id,
        tipo: "assegnazione",
        destinatario: ticketEmail,
        oggetto: `[Support Desk] Ticket ${ticket.numero} preso in carico`,
        corpo: html,
        stato: result.ok ? "inviata" : "errore",
        errore: result.error ?? null,
      });
    }

    if (body.stato === "CHIUSO") {
      const html = emailChiusura({
        numero: ticket.numero,
        cliente: ticket.cliente,
        sommario: ticket.sommario_problema,
        dataChiusura: ticket.data_chiusura ?? new Date().toLocaleString("it-IT"),
      });
      const result = await sendEmail({
        to: ticketEmail,
        subject: `[Support Desk] Ticket ${ticket.numero} chiuso`,
        html,
      });
      await logEmail({
        ticket_id: ticket.id,
        tipo: "chiusura",
        destinatario: ticketEmail,
        oggetto: `[Support Desk] Ticket ${ticket.numero} chiuso`,
        corpo: html,
        stato: result.ok ? "inviata" : "errore",
        errore: result.error ?? null,
      });
    }
  }

  return NextResponse.json(ticket);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);

  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const ok = await deleteTicket(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
