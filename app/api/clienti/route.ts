import { NextResponse } from "next/server";
import { listClienti } from "@/lib/clienti";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const clienti = await listClienti(q, Number.isNaN(limit) ? 50 : limit);
    // Dato di riferimento per le select: un cliente nuovo compare entro due
    // minuti, che e' il compromesso accettato in cambio di non rifare la query
    // a ogni pagina. La ricerca (`q`) non si cachea: li' il testo cambia a ogni
    // tasto e la risposta deve essere quella esatta.
    const headers: Record<string, string> = q
      ? {}
      : { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" };
    return NextResponse.json({ clienti }, { headers });
  } catch (err) {
    console.error("GET /api/clienti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
