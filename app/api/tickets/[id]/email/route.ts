import { NextResponse } from "next/server";
import { getTicket, sanificaContatti } from "@/lib/tickets";
import { sendEmail } from "@/lib/email";
import { emailManuale } from "@/lib/email-templates";
import { logEmail, getEmailLog } from "@/lib/email-log";
import { EMAIL_PLACEHOLDER } from "@/lib/contatti";
import { casellaPerTicket } from "@/lib/caselle";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const log = await getEmailLog(params.id);
    return NextResponse.json({ log });
  } catch (err) {
    console.error("GET /api/tickets/[id]/email", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = request.headers.get("x-operator-id");
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const found = await getTicket(params.id);
    if (!found) {
      return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
    }
    // Anche qui si estraggono i recapiti dal testo, cosi' l'invio funziona
    // senza dover prima passare dalla pagina del ticket.
    const ticket = await sanificaContatti(found);

    if (!ticket.email || ticket.email === EMAIL_PLACEHOLDER) {
      return NextResponse.json(
        {
          error:
            "Il ticket non ha un indirizzo email valido: aggiungilo nei Dettagli Cliente e riprova.",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      oggetto?: string;
      messaggio?: string;
    };

    const oggetto = body.oggetto?.trim();
    const messaggio = body.messaggio?.trim();

    if (!oggetto || !messaggio) {
      return NextResponse.json(
        { error: "Oggetto e messaggio sono obbligatori." },
        { status: 400 }
      );
    }

    const html = emailManuale({
      numero: ticket.numero,
      cliente: ticket.cliente,
      oggetto,
      messaggio,
    });

    const result = await sendEmail({
      to: ticket.email,
      subject: `[Support Desk] ${oggetto} - ${ticket.numero}`,
      html,
      // Risponde dalla casella che ha ricevuto la mail del ticket.
      casellaId: (await casellaPerTicket(ticket.id)) ?? undefined,
    });

    await logEmail({
      ticket_id: ticket.id,
      tipo: "manuale",
      destinatario: ticket.email,
      oggetto: `[Support Desk] ${oggetto} - ${ticket.numero}`,
      corpo: html,
      stato: result.ok ? "inviata" : "errore",
      errore: result.error ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `Errore invio email: ${result.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/tickets/[id]/email", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
