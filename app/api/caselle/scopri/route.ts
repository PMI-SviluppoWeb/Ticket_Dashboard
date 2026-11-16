import { NextResponse } from "next/server";
import { scopriConfigurazione } from "@/lib/autoconfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stesso criterio di /api/caselle: le intestazioni x-operator-* le inietta
// il middleware dopo la verifica della sessione.
function richiediAdmin(request: Request): NextResponse | null {
  if (!request.headers.get("x-operator-id")) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (request.headers.get("x-operator-ruolo") !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

// GET /api/caselle/scopri?indirizzo=a@b.c
// Auto-scoperta IMAP/SMTP da un indirizzo email (stile Outlook/Thunderbird):
// l'utente inserisce solo email + password, i server li trova la pipeline
// di lib/autoconfig.ts (provider noti → ISPDB → MX → SRV → indovinelli).
export async function GET(request: Request) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  const indirizzo = new URL(request.url).searchParams.get("indirizzo") ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo.trim())) {
    return NextResponse.json({ error: "Indirizzo email non valido." }, { status: 400 });
  }

  try {
    const config = await scopriConfigurazione(indirizzo);
    return NextResponse.json(config);
  } catch (err) {
    console.error("GET /api/caselle/scopri", err);
    return NextResponse.json(
      { error: "Errore durante il rilevamento delle impostazioni." },
      { status: 500 }
    );
  }
}
