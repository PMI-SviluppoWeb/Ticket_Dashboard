import { NextResponse } from "next/server";
import { creaAgente, listaAgenti, listaAgentiPerOperatore } from "@/lib/agenti";
import { providerAttivo } from "@/lib/ai-provider";
import { richiediOperatore } from "@/lib/auth";
import type { AgenteInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    // L'admin vede tutto (configurazione e supervisione); l'operatore vede i
    // propri agenti personali e la libreria non disabilitata per lui, con il
    // flag `pinnato` usato dalla barra rapida del Copilot. `?vista=miei`
    // forza la vista personale anche per l'admin (pagina /agenti).
    const vistaMiei = new URL(request.url).searchParams.get("vista") === "miei";
    const agenti =
      auth.operatore.ruolo === "admin" && !vistaMiei
        ? await listaAgenti()
        : await listaAgentiPerOperatore(auth.operatore.id);
    return NextResponse.json({ agenti, provider: providerAttivo() });
  } catch (err) {
    console.error("GET /api/agenti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AgenteInput>;
    const isAdmin = auth.operatore.ruolo === "admin";

    // Un operatore puo' creare SOLO agenti personali; la libreria e' dell'admin.
    const visibilita = isAdmin
      ? body.visibilita === "personale"
        ? "personale"
        : "libreria"
      : "personale";

    const esito = await creaAgente(
      {
        nome: String(body.nome ?? ""),
        descrizione: typeof body.descrizione === "string" ? body.descrizione : undefined,
        ruolo: body.ruolo,
        modello: typeof body.modello === "string" ? body.modello : undefined,
        system_prompt: String(body.system_prompt ?? ""),
        istruzioni_default:
          typeof body.istruzioni_default === "string" ? body.istruzioni_default : undefined,
        messaggio_iniziale:
          typeof body.messaggio_iniziale === "string" ? body.messaggio_iniziale : undefined,
        strumenti: Array.isArray(body.strumenti)
          ? body.strumenti.filter((s): s is string => typeof s === "string")
          : undefined,
        provider: body.provider,
        attivo: body.attivo,
        visibilita,
      },
      auth.operatore.id
    );

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ agente: esito.agente }, { status: 201 });
  } catch (err) {
    console.error("POST /api/agenti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}