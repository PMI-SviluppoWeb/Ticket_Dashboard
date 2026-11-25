import { NextResponse } from "next/server";
import { listaClientiPanoramica } from "@/lib/clienti-commerciale";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/clienti/panoramica — elenco clienti con metriche, solo admin.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const limitRaw = searchParams.get("limit");
    const clienti = await listaClientiPanoramica({
      q,
      limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    });
    return NextResponse.json({ clienti });
  } catch (err) {
    console.error("GET /api/clienti/panoramica", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
