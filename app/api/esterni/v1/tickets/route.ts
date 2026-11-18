import { NextResponse } from "next/server";
import {
  richiediChiaveApi,
  rispostaIdempotente,
  salvaRispostaIdempotente,
} from "@/lib/chiavi-api";
import { createTicket } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { cercaClientePerTelefono } from "@/lib/esterni";
import { completaContatti } from "@/lib/contatti";
import { registra } from "@/lib/registro";
import type { Priorita } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

// POST /api/esterni/v1/tickets
// Crea un ticket dal bot WhatsApp. Il ticket nasce con canale=whatsapp.
export async function POST(request: Request) {
  const auth = await richiediChiaveApi(request, "tickets:write");
  if (!auth.ok) return auth.risposta;

  const idempotencyKey = request.headers.get("idempotency-key");
  const gia = await rispostaIdempotente(idempotencyKey);
  if (gia) return gia;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      telefono?: string;
      contatto?: string;
      cliente?: string;
      email?: string;
      modulo_software?: string;
      sommario_problema?: string;
      descrizione_dettagliata?: string;
      priorita?: string;
    };

    const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
    const sommario = typeof body.sommario_problema === "string" ? body.sommario_problema.trim() : "";
    const descrizione =
      typeof body.descrizione_dettagliata === "string" ? body.descrizione_dettagliata.trim() : "";

    if (!telefono || !sommario || !descrizione) {
      return NextResponse.json(
        { error: "Campi obbligatori: telefono, sommario_problema, descrizione_dettagliata." },
        { status: 400 }
      );
    }

    const cliente = await cercaClientePerTelefono(telefono);
    const contattoBase =
      (typeof body.contatto === "string" && body.contatto.trim()) ||
      cliente?.nome_contatto ||
      `WhatsApp ${telefono}`;
    const contatti = completaContatti(
      { contatto: contattoBase, email: cliente?.email ?? body.email ?? null, telefono },
      contattoBase,
      descrizione
    );

    const priorita: Priorita = PRIORITA.includes(body.priorita as Priorita)
      ? (body.priorita as Priorita)
      : "MEDIA";

    const ticket = await createTicket({
      canale: "whatsapp",
      cliente: cliente?.ragione_sociale || body.cliente?.trim() || contattoBase,
      cliente_id: cliente?.id ?? null,
      contatto: contatti.contatto,
      telefono: contatti.telefono ?? telefono,
      email: contatti.email ?? cliente?.email ?? "sconosciuto@placeholder.it",
      modulo_software:
        (typeof body.modulo_software === "string" && body.modulo_software.trim()) || "Generico",
      sommario_problema: sommario.slice(0, 200),
      descrizione_dettagliata: descrizione,
      priorita,
      note: `[WhatsApp] Richiesta ricevuta dal bot (chiave ${auth.chiave.nome}).`,
      messaggi: [
        {
          ruolo: "user",
          contenuto: descrizione,
          data_creazione: new Date().toISOString(),
        },
      ],
    });

    await createNotification({
      titolo: "Nuovo ticket da WhatsApp",
      messaggio: `${ticket.numero} - ${ticket.sommario_problema} (${ticket.cliente})`,
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
    });

    await registra({
      origine: "api",
      azione: "api.ticket.creato",
      entita: "ticket",
      entitaId: ticket.id,
      dettagli: { chiave_id: auth.chiave.id, canale: "whatsapp" },
    });

    const risposta = {
      id: ticket.id,
      numero: ticket.numero,
      stato: ticket.stato,
      cliente: ticket.cliente,
    };
    await salvaRispostaIdempotente(idempotencyKey, risposta);
    return NextResponse.json(risposta, { status: 201 });
  } catch (err) {
    console.error("POST /api/esterni/v1/tickets", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
