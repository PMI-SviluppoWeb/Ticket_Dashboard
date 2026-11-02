import { NextResponse } from "next/server";
import { caricaDashboard } from "@/lib/dashboard";
import { getModuli } from "@/lib/tickets";
import { memo } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const operatoreId = request.headers.get("x-operator-id");
  if (!operatoreId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  // Il batch della dashboard e i moduli (che cambiano raramente e sono
  // memoizzati) viaggiano in parallelo: a cache calda la richiesta e' UNA.
  const [dashboard, moduli] = await Promise.all([
    caricaDashboard(operatoreId),
    memo("moduli", 60_000, getModuli),
  ]);

  // L'id nell'header non corrisponde piu' a un operatore: la sessione e'
  // valida ma l'utente e' stato eliminato. 401 come le altre rotte.
  if (!dashboard) {
    return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
  }

  return NextResponse.json({ dashboard, moduli });
}
