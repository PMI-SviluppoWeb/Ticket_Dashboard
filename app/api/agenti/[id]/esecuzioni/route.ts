import { NextResponse } from "next/server";
import { getAgente, listaEsecuzioni, puoUsareAgente } from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    const limitRaw = new URL(request.url).searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200) : 50;
    const esecuzioni = await listaEsecuzioni(params.id, limit);
    return NextResponse.json({ esecuzioni });
  } catch (err) {
    console.error("GET /api/agenti/[id]/esecuzioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
