import { NextResponse } from "next/server";
import { listaProposte } from "@/lib/proposte";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agenti/proposte — proposte dell'operatore corrente; l'admin vede
// tutte. Filtri: stato, conversazione_id.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const isAdmin = auth.operatore.ruolo === "admin";
    const limitRaw = searchParams.get("limit");
    const proposte = await listaProposte({
      operatoreId: isAdmin ? undefined : auth.operatore.id,
      stato: searchParams.get("stato") ?? undefined,
      conversazioneId: searchParams.get("conversazione_id") ?? undefined,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    });
    return NextResponse.json({ proposte });
  } catch (err) {
    console.error("GET /api/agenti/proposte", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
