import { NextResponse } from "next/server";
import { getTicket, insertTechnicalNote } from "@/lib/tickets";
import { sendEmail } from "@/lib/email";
import { emailNuovaNota } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = request.headers.get("x-operator-id");
  const operatorName = request.headers.get("x-operator-email")?.split("@")[0];

  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const body = (await request.json()) as {
    titolo?: string;
    problema?: string;
    soluzione?: string;
    operatore?: string | null;
  };

  const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
  const problema = typeof body.problema === "string" ? body.problema.trim() : "";
  const soluzione = typeof body.soluzione === "string" ? body.soluzione.trim() : "";

  if (!titolo || !soluzione) {
    return NextResponse.json(
      { error: "Campi obbligatori mancanti: titolo e soluzione." },
      { status: 400 }
    );
  }

  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  await insertTechnicalNote(params.id, {
    titolo,
    problema,
    soluzione,
    operatore: body.operatore ?? operatorName ?? null,
  });

  // Send email to client about new note
  if (ticket.email) {
    const noteOperatore = body.operatore ?? operatorName ?? "Operatore";
    const html = emailNuovaNota({
      numero: ticket.numero,
      cliente: ticket.cliente,
      titoloNota: titolo,
      operatore: noteOperatore,
    });
    const result = await sendEmail({
      to: ticket.email,
      subject: `[Support Desk] Aggiornamento ticket ${ticket.numero}`,
      html,
    });
    await logEmail({
      ticket_id: ticket.id,
      tipo: "nuova_nota",
      destinatario: ticket.email,
      oggetto: `[Support Desk] Aggiornamento ticket ${ticket.numero}`,
      corpo: html,
      stato: result.ok ? "inviata" : "errore",
      errore: result.error ?? null,
    });
  }

  return NextResponse.json(await getTicket(params.id));
}
