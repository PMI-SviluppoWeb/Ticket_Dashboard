import { NextResponse } from "next/server";
import { listaEsecuzioni } from "@/lib/agenti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function richiediAdmin(request: Request): NextResponse | null {
  if (!request.headers.get("x-operator-id")) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (request.headers.get("x-operator-ruolo") !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

// Storico esecuzioni di un agente (più recenti prima): è la sorgente dati
// del pannello storico in UI.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

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
