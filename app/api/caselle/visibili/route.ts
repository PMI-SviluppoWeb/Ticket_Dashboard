import { NextResponse } from "next/server";
import { caselleVisibili } from "@/lib/caselle";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/caselle/visibili — elenco SICURO delle caselle che l'utente
// corrente puo' usare nella Posta in arrivo. Mai credenziali o server.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const caselle = await caselleVisibili(auth.operatore);
    return NextResponse.json(
      { caselle },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("GET /api/caselle/visibili", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
