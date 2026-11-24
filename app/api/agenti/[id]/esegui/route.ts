import { NextResponse } from "next/server";
import {
  eseguiAgente,
  getAgente,
  getConversazione,
  puoUsareAgente,
} from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agenti/[id]/esegui — invoca l'agente. Aperto agli operatori per
// gli agenti di libreria e per i propri agenti personali.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!(await puoUsareAgente(agente, auth.operatore))) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      input?: string;
      contesto?: Record<string, unknown>;
      conversazioneId?: string;
    };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "Input obbligatorio." }, { status: 400 });
    }

    // Se il turno appartiene a una conversazione, deve essere dell'operatore
    // corrente (o l'operatore e' admin) e dello stesso agente.
    let conversazioneId: string | undefined;
    if (typeof body.conversazioneId === "string" && body.conversazioneId) {
      const conversazione = await getConversazione(body.conversazioneId);
      if (
        !conversazione ||
        conversazione.agente_id !== params.id ||
        (conversazione.operatore_id !== auth.operatore.id &&
          auth.operatore.ruolo !== "admin")
      ) {
        return NextResponse.json(
          { error: "Conversazione non trovata." },
          { status: 404 }
        );
      }
      conversazioneId = conversazione.id;
    }

    const esito = await eseguiAgente({
      agenteId: params.id,
      input: body.input,
      contesto:
        body.contesto && typeof body.contesto === "object" ? body.contesto : undefined,
      operatoreId: auth.operatore.id,
      conversazioneId,
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ esecuzione: esito.esecuzione });
  } catch (err) {
    console.error("POST /api/agenti/[id]/esegui", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
