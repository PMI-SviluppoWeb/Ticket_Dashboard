import { NextResponse } from "next/server";
import { createTicket, listTickets, getTicketByNumero } from "@/lib/tickets";
import type { Priorita, StatoTicket, TicketInput } from "@/lib/types";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];

export async function GET(request: Request) {
  const url = new URL(request.url);

  const stato = (url.searchParams.get("stato") ?? "TUTTI") as StatoTicket | "TUTTI";
  const priorita = (url.searchParams.get("priorita") ?? "TUTTE") as Priorita | "TUTTE";
  const q = url.searchParams.get("q") ?? "";
  const modulo = url.searchParams.get("modulo") ?? "";
  const operatore = url.searchParams.get("operatore") ?? "";
  const pagina = parseInt(url.searchParams.get("pagina") ?? "1", 10);
  const paginaSize = parseInt(url.searchParams.get("paginaSize") ?? "25", 10);
  const ordina = url.searchParams.get("ordina") ?? "data_desc";

  const result = await listTickets({
    stato: STATI.includes(stato as StatoTicket) ? (stato as StatoTicket) : "TUTTI",
    priorita: PRIORITA.includes(priorita as Priorita)
      ? (priorita as Priorita)
      : "TUTTE",
    q,
    modulo,
    operatore,
    pagina,
    paginaSize,
    ordina,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<TicketInput>;

    if (!body.cliente || !body.sommario_problema || !body.descrizione_dettagliata) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: cliente, sommario_problema, descrizione_dettagliata." },
        { status: 400 }
      );
    }

    const priorita: Priorita = PRIORITA.includes(body.priorita as Priorita)
      ? (body.priorita as Priorita)
      : "BASSA";

    if (body.numero && (await getTicketByNumero(body.numero))) {
      return NextResponse.json(
        { error: `Numero ticket già esistente: ${body.numero}` },
        { status: 409 }
      );
    }

    const ticket = await createTicket({
      id: body.id,
      numero: body.numero,
      cliente: body.cliente,
      contatto: body.contatto ?? "Non fornito",
      telefono: body.telefono,
      email: body.email,
      modulo_software: body.modulo_software || "Generico",
      sommario_problema: body.sommario_problema,
      descrizione_dettagliata: body.descrizione_dettagliata,
      priorita,
      note: body.note,
      messaggi: body.messaggi,
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    console.error("POST /api/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
