import { NextResponse } from "next/server";
import { caricaDashboard } from "@/lib/dashboard";
import { getModuli } from "@/lib/tickets";
import { memo } from "@/lib/cache";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const operatoreId = auth.operatore.id;

  // Il batch della dashboard e i moduli (che cambiano raramente e sono
  // memoizzati) viaggiano in parallelo: a cache calda la richiesta e' UNA.
  const [dashboard, moduli] = await Promise.all([
    caricaDashboard(operatoreId),
    memo("moduli", 60_000, getModuli),
  ]);

  if (!dashboard) {
    return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
  }

  return NextResponse.json({ dashboard, moduli });
}
