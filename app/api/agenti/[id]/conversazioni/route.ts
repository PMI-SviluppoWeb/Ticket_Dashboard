import { NextResponse } from "next/server";
import {
  creaConversazione,
  getAgente,
  listaConversazioni,
  puoUsareAgente,
} from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agenti/[id]/conversazioni — thread del Copilot per agente.
export async function GET(
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
    const limitRaw = new URL(request.url).searchParams.get("limit");
    const conversazioni = await listaConversazioni({
      operatoreId: auth.operatore.id,
      agenteId: params.id,
      limit: limitRaw ? parseInt(limitRaw, 10) : 30,
    });
    return NextResponse.json({ conversazioni });
  } catch (err) {
    console.error("GET /api/agenti/[id]/conversazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// POST /api/agenti/[id]/conversazioni — apre un nuovo thread.
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
      titolo?: string;
      contesto?: Record<string, unknown>;
    };
    const conversazione = await creaConversazione({
      agenteId: params.id,
      operatoreId: auth.operatore.id,
      titolo: typeof body.titolo === "string" ? body.titolo : undefined,
      contesto:
        body.contesto && typeof body.contesto === "object" ? body.contesto : undefined,
    });
    return NextResponse.json({ conversazione }, { status: 201 });
  } catch (err) {
    console.error("POST /api/agenti/[id]/conversazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
