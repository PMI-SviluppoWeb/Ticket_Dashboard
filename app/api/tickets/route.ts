import { NextResponse } from "next/server";
import { createTicket, listTickets, getTicketByNumero } from "@/lib/tickets";
import { getOperatorById } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailNuovoTicket } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { completaContatti, emailValida } from "@/lib/contatti";
import type { Priorita, StatoTicket, TicketInput } from "@/lib/types";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  const operatorRole = getOperatorRole(request);
  const url = new URL(request.url);

  const stato = (url.searchParams.get("stato") ?? "TUTTI") as StatoTicket | "TUTTI";
  const priorita = (url.searchParams.get("priorita") ?? "TUTTE") as Priorita | "TUTTE";
  const q = url.searchParams.get("q") ?? "";
  const modulo = url.searchParams.get("modulo") ?? "";
  let operatore = url.searchParams.get("operatore") ?? "";
  const pagina = parseInt(url.searchParams.get("pagina") ?? "1", 10);
  const paginaSize = parseInt(url.searchParams.get("paginaSize") ?? "25", 10);
  const ordina = url.searchParams.get("ordina") ?? "data_desc";

  if (operatore === "TUTTI") {
    operatore = "";
  } else if (operatorRole === "admin") {
    operatore = "";
  } else if (operatorId && !operatore) {
    const operator = await getOperatorById(operatorId);
    if (operator) {
      operatore = `__MY_AND_UNASSIGNED__:${operator.nome}`;
    }
  }

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
    const body = (await request.json()) as Partial<TicketInput> & { invia_conferma?: boolean };

    if (!body.cliente || !body.sommario_problema || !body.descrizione_dettagliata) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: cliente, sommario_problema, descrizione_dettagliata." },
        { status: 400 }
      );
    }

    // Email OPZIONALE: un ticket preso al telefono non ha sempre un indirizzo.
    // Se presente deve pero' essere valida, perche' e' la destinazione delle
    // risposte e dell'autorisposta. Email e telefono arrivano anche nascosti
    // dentro il testo libero del contatto: in quel caso li si estrae.
    const contatti = completaContatti(
      { contatto: body.contatto, email: body.email, telefono: body.telefono },
      body.contatto,
      body.descrizione_dettagliata
    );

    if (contatti.email && !emailValida(contatti.email)) {
      return NextResponse.json(
        { error: "L'email del cliente, se presente, deve essere valida." },
        { status: 400 }
      );
    }

    const priorita: Priorita = PRIORITA.includes(body.priorita as Priorita)
      ? (body.priorita as Priorita)
      : "BASSA";

    if (body.numero && (await getTicketByNumero(body.numero))) {
      return NextResponse.json(
        { error: `Numero ticket gia' esistente: ${body.numero}` },
        { status: 409 }
      );
    }

    const ticket = await createTicket({
      id: body.id,
      numero: body.numero,
      cliente: body.cliente,
      contatto: contatti.contatto,
      telefono: contatti.telefono,
      // La colonna email e' NOT NULL in DB: senza email (ticket da telefono)
      // si riprende lo stesso placeholder usato dalla migrazione storica.
      email: contatti.email ?? "sconosciuto@placeholder.it",
      modulo_software: body.modulo_software || "Generico",
      sommario_problema: body.sommario_problema,
      descrizione_dettagliata: body.descrizione_dettagliata,
      priorita,
      note: body.note,
      messaggi: body.messaggi,
    });

    await createNotification({
      titolo: "Nuovo ticket creato",
      messaggio: `${ticket.numero} - ${ticket.sommario_problema} (${ticket.cliente})`,
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
    });

    // Autorisposta al cliente: di default si, ma chi crea il ticket da UI
    // (telefono, senza email, o senza voler scrivere) puo' sceglierlo.
    const email = contatti.email;
    if (body.invia_conferma !== false && email) {
      const html = emailNuovoTicket({
        numero: ticket.numero,
        cliente: ticket.cliente,
        sommario: ticket.sommario_problema,
        descrizione: ticket.descrizione_dettagliata,
        priorita: ticket.priorita,
      });
      const result = await sendEmail({
        to: email,
        subject: `[Support Desk] Ticket ${ticket.numero} ricevuto`,
        html,
      });
      await logEmail({
        ticket_id: ticket.id,
        tipo: "nuovo_ticket",
        destinatario: email,
        oggetto: `[Support Desk] Ticket ${ticket.numero} ricevuto`,
        corpo: html,
        stato: result.ok ? "inviata" : "errore",
        errore: result.error ?? null,
      });
    }

    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    console.error("POST /api/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
