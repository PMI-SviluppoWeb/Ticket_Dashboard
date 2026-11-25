import { NextResponse } from "next/server";
import { rifiutaProposta } from "@/lib/proposte";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const esito = await rifiutaProposta(params.id, auth.operatore);
    if (!esito.ok) {
      const status = esito.error === "Proposta non trovata." ? 404 : 400;
      return NextResponse.json({ error: esito.error }, { status });
    }
    return NextResponse.json({ proposta: esito.proposta });
  } catch (err) {
    console.error("POST /api/agenti/proposte/[id]/rifiuta", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
