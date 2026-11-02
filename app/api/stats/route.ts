import { NextResponse } from "next/server";
import { getStats, getModuli } from "@/lib/tickets";
import { memo } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const operatorId = request.headers.get("x-operator-id");
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  // Due secondi: assorbe i poll sovrapposti (piu' schede, piu' operatori) senza
  // rendere vecchio il cruscotto. `getModuli` resta invariato per 60 s perche'
  // e' una `SELECT DISTINCT` su tutta la tabella che non cambia quasi mai.
  const [stats, moduli] = await Promise.all([
    memo("stats", 2000, getStats),
    memo("moduli", 60_000, getModuli),
  ]);
  return NextResponse.json({ stats, moduli });
}
