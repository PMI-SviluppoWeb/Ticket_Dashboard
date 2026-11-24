import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";
import { createTicket, getTicket, getTicketByNumero, insertMessage, updateTicket } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { puoVedereCasella } from "@/lib/caselle";
import { registra } from "@/lib/registro";
import { completaContatti } from "@/lib/contatti";
import type { Priorita } from "@/lib/types";

export const dynamic = "force-dynamic";

type Azione = "crea_ticket" | "aggancia" | "ignora" | "recupera";

interface RigaInbox {
  id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  body_text: string | null;
  body_html: string | null;
  ticket_id: string | null;
  casella_id: string | null;
  esito_ai: string | null;
  confidenza: number | null;
  motivo: string | null;
}

// Azioni umane sulla posta in arrivo. Ogni correzione viene registrata in
// `correzione_umana` (materiale per migliorare il prompt) e nel registro.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json().catch(() => ({}))) as {
    azione?: Azione;
    ticketId?: string;
  };

  const azione = body.azione;
  if (!azione || !["crea_ticket", "aggancia", "ignora", "recupera"].includes(azione)) {
    return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
  }

  const riga = (await db
    .prepare(
      `SELECT id, from_email, from_nome, subject, body_preview, body_text, body_html,
              ticket_id, casella_id, esito_ai, confidenza, motivo
       FROM email_inbox WHERE id = ?`
    )
    .get(params.id)) as unknown as RigaInbox | undefined;

  if (!riga) {
    return NextResponse.json({ error: "Email non trovata." }, { status: 404 });
  }

  // Le azioni valgono solo sulle email delle caselle accessibili.
  if (!(await puoVedereCasella(auth.operatore, riga.casella_id))) {
    return NextResponse.json({ error: "Email non trovata." }, { status: 404 });
  }

  const correttoDa = auth.operatore.id;

  try {
    if (azione === "crea_ticket") {
      if (riga.ticket_id) {
        return NextResponse.json(
          { error: "Questa email ha gia' un ticket collegato." },
          { status: 409 }
        );
      }

      const cliente = await db
        .prepare("SELECT id, ragione_sociale FROM clienti WHERE email = ? AND attivo = 1")
        .get(riga.from_email);

      const contatto = riga.from_nome || riga.from_email;
      const contatti = completaContatti(
        { contatto, email: riga.from_email, telefono: null },
        contatto,
        riga.body_text ?? ""
      );
      const descrizione =
        riga.body_text || riga.body_preview || riga.subject || "(nessun contenuto)";

      const ticket = await createTicket({
        canale: "email",
        cliente: cliente ? String(cliente.ragione_sociale) : contatto,
        cliente_id: cliente ? String(cliente.id) : null,
        contatto: contatti.contatto,
        telefono: contatti.telefono,
        email: contatti.email ?? riga.from_email,
        modulo_software: "Generico",
        sommario_problema: (riga.subject || "Email senza oggetto").slice(0, 120),
        descrizione_dettagliata: descrizione,
        priorita: "MEDIA" as Priorita,
        note: `[triage] Creato manualmente da Posta in arrivo. Esito AI: ${riga.esito_ai ?? "n/d"} (${riga.confidenza ?? "?"}) - ${riga.motivo ?? ""}`,
        operatore_id: correttoDa,
        messaggi: [
          {
            ruolo: "user",
            contenuto: `Email ricevuta da ${riga.from_email}:\n\nOggetto: ${riga.subject}\n\n${descrizione}`,
            data_creazione: new Date().toISOString(),
          },
        ],
      });

      await db
        .prepare(
          `UPDATE email_inbox
           SET ticket_id = @ticket_id, stato = 'processata', stato_triage = 'ticket',
               correzione_umana = 'crea_ticket', corretto_da = @corretto_da
           WHERE id = @id`
        )
        .run({ ticket_id: ticket.id, corretto_da: correttoDa, id: params.id });

      await createNotification({
        titolo: "Ticket creato da email",
        messaggio: `${ticket.numero} - ${ticket.sommario_problema} (${ticket.cliente})`,
        ticket_id: ticket.id,
        tipo: "nuovo_ticket",
      });

      await registra({
        operatoreId: correttoDa,
        azione: "triage.crea_ticket",
        entita: "email_inbox",
        entitaId: params.id,
        dettagli: { ticket_id: ticket.id, esito_ai: riga.esito_ai },
      });

      return NextResponse.json({ ok: true, ticketId: ticket.id, numero: ticket.numero });
    }

    if (azione === "aggancia") {
      const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
      if (!ticketId) {
        return NextResponse.json(
          { error: "ticketId obbligatorio per agganciare." },
          { status: 400 }
        );
      }
      // Accetta sia l'id interno sia il numero visibile (TICK-xxxxx).
      let ticket = await getTicket(ticketId);
      if (!ticket) {
        const perNumero = await getTicketByNumero(ticketId);
        if (perNumero) ticket = await getTicket(perNumero.id);
      }
      if (!ticket) {
        return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
      }
      const ticketIdReale = ticket.id;

      const descrizione =
        riga.body_text || riga.body_preview || riga.subject || "(nessun contenuto)";
      await insertMessage(ticketIdReale, {
        ruolo: "user",
        contenuto: `Email ricevuta da ${riga.from_email}:\n\nOggetto: ${riga.subject}\n\n${descrizione}`,
        data_creazione: new Date().toISOString(),
      });

      let riaperto = false;
      if (ticket.stato === "CHIUSO" || ticket.stato === "RISOLTO") {
        await updateTicket(ticketIdReale, { stato: "IN_CORSO" }, ticket, {
          operatoreId: correttoDa,
          operatore: auth.operatore.nome,
        });
        riaperto = true;
        await createNotification({
          titolo: "Ticket riaperto dalla posta in arrivo",
          messaggio: `${ticket.numero} - ${ticket.sommario_problema} (${riga.from_email})`,
          ticket_id: ticketIdReale,
          tipo: "riapertura",
          destinatario_id: ticket.operatore_id ?? null,
        });
      }

      await db
        .prepare(
          `UPDATE email_inbox
           SET ticket_id = @ticket_id, stato = 'processata', stato_triage = 'ticket',
               correzione_umana = 'aggancia', corretto_da = @corretto_da
           WHERE id = @id`
        )
        .run({ ticket_id: ticketIdReale, corretto_da: correttoDa, id: params.id });

      await registra({
        operatoreId: correttoDa,
        azione: "triage.aggancia",
        entita: "email_inbox",
        entitaId: params.id,
        dettagli: { ticket_id: ticketId, riaperto, esito_ai: riga.esito_ai },
      });

      return NextResponse.json({ ok: true, ticketId: ticketIdReale, numero: ticket.numero, riaperto });
    }

    if (azione === "ignora") {
      await db
        .prepare(
          `UPDATE email_inbox
           SET stato = 'ignorata', stato_triage = 'ignora',
               correzione_umana = 'ignora', corretto_da = @corretto_da
           WHERE id = @id`
        )
        .run({ corretto_da: correttoDa, id: params.id });

      await registra({
        operatoreId: correttoDa,
        azione: "triage.ignora",
        entita: "email_inbox",
        entitaId: params.id,
        dettagli: { esito_ai: riga.esito_ai },
      });

      return NextResponse.json({ ok: true });
    }

    // recupera: riporta una email ignorata nella coda "Da verificare".
    await db
      .prepare(
        `UPDATE email_inbox
         SET stato = 'processata', stato_triage = 'da_verificare',
             correzione_umana = 'recupera', corretto_da = @corretto_da
         WHERE id = @id`
      )
      .run({ corretto_da: correttoDa, id: params.id });

    await registra({
      operatoreId: correttoDa,
      azione: "triage.recupera",
      entita: "email_inbox",
      entitaId: params.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/inbox/[id]/azione", azione, err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
