import { NextResponse } from "next/server";
import { caricaTaskTeam } from "@/lib/dashboard";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Task di tutto il team, per il toggle "Team" della dashboard.
// Admin-only: la lista nomina i colleghi e il loro carico di lavoro.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const task = await caricaTaskTeam();
    return NextResponse.json({ task }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("GET /api/attivita/team", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
