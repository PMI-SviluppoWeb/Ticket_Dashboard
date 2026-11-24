import { NextResponse } from "next/server";
import { caricaDirezione } from "@/lib/direzione";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/direzione — vista "oggi" riservata all'admin.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const direzione = await caricaDirezione(auth.operatore.id);
    if (!direzione) {
      return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
    }
    return NextResponse.json(direzione);
  } catch (err) {
    console.error("GET /api/direzione", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
