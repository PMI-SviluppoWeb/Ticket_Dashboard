import { NextResponse } from "next/server";
import { join } from "path";
import { readFile } from "fs/promises";
import { deleteTicket, getTicket, updateTicket, sanificaContatti } from "@/lib/tickets";
import { getOperatorById } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { emailAssegnazione, emailChiusura } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { completaContatti, emailValida, EMAIL_PLACEHOLDER } from "@/lib/contatti";
import { casellaPerTicket } from "@/lib/caselle";
import type { Priorita, StatoTicket, Ticket, TicketUpdate, TechnicalNote } from "@/lib/types";

const UPLOADS_DIR = join(process.cwd(), "uploads");

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }
  // Prima di mostrarlo si estraggono i recapiti nascosti nel testo: il
  // centralino puo' non essere aggiornato e continua a scriverli dentro
  // `contatto`, e senza questo passaggio email/telefono restano vuoti.
  return NextResponse.json(await sanificaContatti(ticket));
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);

  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  // Operatore e ticket sono indipendenti: una lettura in parallelo invece di
  // due in serie.
  const [operator, existingTicket] = await Promise.all([
    getOperatorById(operatorId),
    getTicket(params.id),
  ]);
  if (!operator) {
    return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
  }

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
  if (body.cliente !== undefined) patch.cliente = body.cliente;
  // Contatti: se toccati si completano con quelli nascosti nel testo del
  // contatto e si normalizza il telefono, come alla creazione.
  if (
    body.contatto !== undefined ||
    body.telefono !== undefined ||
    body.email !== undefined
  ) {
    const contatti = completaContatti(
      {
        contatto: body.contatto !== undefined ? body.contatto : existingTicket.contatto,
        email: body.email !== undefined ? body.email : existingTicket.email,
        telefono: body.telefono !== undefined ? body.telefono : existingTicket.telefono,
      },
      body.contatto ?? existingTicket.contatto
    );
    if (contatti.email && !emailValida(contatti.email)) {
      return NextResponse.json(
        { error: "L'email del cliente, se presente, deve essere valida." },
        { status: 400 }
      );
    }
    patch.contatto = contatti.contatto;
    patch.telefono = contatti.telefono;
    patch.email = contatti.email;
  }
  if (body.tempo_effettivo_minuti !== undefined) patch.tempo_effettivo_minuti = body.tempo_effettivo_minuti;

  const ticket = await updateTicket(params.id, patch, existingTicket);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  // L'email e' un effetto collaterale, non parte della risposta: l'SMTP puo'
  // impiegare secondi e bloccava il cambio di stato. Parte in background e
  // l'esito resta tracciato in email_log (la dashboard lo mostra comunque).
  if (body.stato && existingTicket.email && existingTicket.email !== EMAIL_PLACEHOLDER) {
    notificaCambioStato({
      ticket,
      precedente: existingTicket,
      nuovoStato: body.stato,
      operatore: patch.operatore ?? operator.nome,
    });
  }

  return NextResponse.json(ticket);
}

function notificaCambioStato(opts: {
  ticket: Ticket;
  precedente: Ticket;
  nuovoStato: StatoTicket;
  operatore: string;
}): void {
  const { ticket, precedente, nuovoStato, operatore } = opts;
  const ticketEmail = precedente.email;
  // Il placeholder dei ticket senza email non e' un recapito: non si scrive.
  if (!ticketEmail || ticketEmail === EMAIL_PLACEHOLDER) return;

  void inviaNotifica(ticket, precedente, nuovoStato, operatore, ticketEmail).catch(
    (err) => console.error("Notifica ticket fallita:", ticket.id, err)
  );
}

async function inviaNotifica(
  ticket: Ticket,
  precedente: Ticket,
  nuovoStato: StatoTicket,
  operatore: string,
  ticketEmail: string
): Promise<void> {
  // La casella che ha ricevuto la mail del ticket: le notifiche partono dallo
  // stesso account. Null se il ticket non nasce da email -> mittente default.
  const casellaId = (await casellaPerTicket(ticket.id)) ?? undefined;

  if (nuovoStato === "IN_CORSO" && precedente.stato === "NUOVO") {
    const html = emailAssegnazione({
      numero: ticket.numero,
      cliente: ticket.cliente,
      operatore,
    });
    const result = await sendEmail({
      to: ticketEmail,
      subject: `[Support Desk] Ticket ${ticket.numero} preso in carico`,
      html,
      casellaId,
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
    return;
  }

  if (nuovoStato !== "CHIUSO") return;

  // Note tecniche e allegati in parallelo; una sola query per gli allegati
  // (prima erano due identiche di fila) e lettura dei file in parallelo.
  const [noteTecniche, allAllegati] = await Promise.all([
    db
      .prepare(
        `SELECT id, titolo, soluzione, operatore FROM technical_notes WHERE ticket_id = ? ORDER BY data_creazione ASC`
      )
      .all(ticket.id) as unknown as Promise<TechnicalNote[]>,
    db
      .prepare(
        `SELECT nome_file, nome_originale FROM allegati WHERE ticket_id = ? ORDER BY data_creazione ASC`
      )
      .all(ticket.id) as unknown as Promise<{ nome_file: string; nome_originale: string }[]>,
  ]);

  const esistenti = await Promise.all(
    allAllegati.map(async (a) => {
      const filePath = join(UPLOADS_DIR, a.nome_file);
      try {
        await readFile(filePath);
        return { filename: a.nome_originale, path: filePath };
      } catch {
        // File not found on disk, skip
        return null;
      }
    })
  );
  const emailAttachments = esistenti.filter(
    (a): a is { filename: string; path: string } => a !== null
  );

  const html = emailChiusura({
    numero: ticket.numero,
    cliente: ticket.cliente,
    sommario: ticket.sommario_problema,
    dataChiusura: ticket.data_chiusura ?? new Date().toLocaleString("it-IT"),
    noteTecniche: noteTecniche.map((n) => ({
      titolo: n.titolo,
      soluzione: n.soluzione,
      operatore: n.operatore ?? "Operatore",
    })),
    allegati: allAllegati.map((a) => a.nome_originale),
  });
  const result = await sendEmail({
    to: ticketEmail,
    subject: `[Support Desk] Ticket ${ticket.numero} chiuso`,
    html,
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    casellaId,
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
