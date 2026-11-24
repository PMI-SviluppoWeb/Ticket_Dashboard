import { NextResponse } from "next/server";
import { listaAttivitaAgenti } from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agenti/attivita — timeline delle esecuzioni.
// Un operatore vede solo le proprie; l'admin può vedere tutto con ?tutti=1.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const tutti = auth.operatore.ruolo === "admin" && searchParams.get("tutti") === "1";
    const limitRaw = searchParams.get("limit");
    const esecuzioni = await listaAttivitaAgenti({
      operatoreId: tutti ? undefined : auth.operatore.id,
      agenteId: searchParams.get("agente_id") ?? undefined,
      stato: searchParams.get("stato") ?? undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : 50,
    });
    return NextResponse.json({ esecuzioni });
  } catch (err) {
    console.error("GET /api/agenti/attivita", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
