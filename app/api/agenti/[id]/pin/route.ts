import { NextResponse } from "next/server";
import { getAgente, impostaAssegnazione, puoUsareAgente } from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agenti/[id]/pin — l'operatore pinna/sblocca un agente nella barra
// rapida del Copilot. Body: { pinnato: boolean }.
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
    const body = (await request.json().catch(() => ({}))) as { pinnato?: boolean };
    const assegnazione = await impostaAssegnazione({
      agenteId: params.id,
      operatoreId: auth.operatore.id,
      pinnato: body.pinnato === true,
    });
    return NextResponse.json({ assegnazione });
  } catch (err) {
    console.error("POST /api/agenti/[id]/pin", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
