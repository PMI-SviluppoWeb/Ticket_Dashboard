import { NextResponse } from "next/server";
import { listaConversazioni } from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agenti/conversazioni — tutti i thread del Copilot dell'operatore
// corrente (usato dallo spazio /agenti).
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get("limit");
    const conversazioni = await listaConversazioni({
      operatoreId: auth.operatore.id,
      limit: limitRaw ? parseInt(limitRaw, 10) : 20,
    });
    return NextResponse.json({ conversazioni });
  } catch (err) {
    console.error("GET /api/agenti/conversazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
