import { NextResponse } from "next/server";
import { scopriConfigurazione } from "@/lib/autoconfig";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stesso criterio di /api/caselle: solo amministratori.
async function richiediAdmin(request: Request): Promise<NextResponse | null> {
  const esito = await richiediOperatore(request, { ruolo: "admin" });
  return esito.ok ? null : esito.risposta;
}

// GET /api/caselle/scopri?indirizzo=a@b.c
// Auto-scoperta IMAP/SMTP da un indirizzo email (stile Outlook/Thunderbird):
// l'utente inserisce solo email + password, i server li trova la pipeline
// di lib/autoconfig.ts (provider noti → ISPDB → MX → SRV → indovinelli).
export async function GET(request: Request) {
  const negato = await richiediAdmin(request);
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
