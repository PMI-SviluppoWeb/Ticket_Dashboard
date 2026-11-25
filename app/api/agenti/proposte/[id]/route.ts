import { NextResponse } from "next/server";
import {
  aggiornaProposta,
  getProposta,
  puoGestireProposta,
} from "@/lib/proposte";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const proposta = await getProposta(params.id);
  if (!puoGestireProposta(proposta, auth.operatore)) {
    return NextResponse.json({ error: "Proposta non trovata." }, { status: 404 });
  }
  return NextResponse.json({ proposta });
}

// PATCH /api/agenti/proposte/[id] — modifica il payload mentre è in attesa.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as { payload?: unknown };
    const esito = await aggiornaProposta(params.id, body.payload, auth.operatore);
    if (!esito.ok) {
      const status = esito.error === "Proposta non trovata." ? 404 : 400;
      return NextResponse.json({ error: esito.error }, { status });
    }
    return NextResponse.json({ proposta: esito.proposta });
  } catch (err) {
    console.error("PATCH /api/agenti/proposte/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
