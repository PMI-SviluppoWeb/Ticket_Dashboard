import { NextResponse } from "next/server";
import { eseguiAgente, getAgente, puoUsareAgente } from "@/lib/agenti";
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
  if (!puoUsareAgente(agente, auth.operatore)) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      input?: string;
      contesto?: Record<string, unknown>;
    };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "Input obbligatorio." }, { status: 400 });
    }

    const esito = await eseguiAgente({
      agenteId: params.id,
      input: body.input,
      contesto:
        body.contesto && typeof body.contesto === "object" ? body.contesto : undefined,
      operatoreId: auth.operatore.id,
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
