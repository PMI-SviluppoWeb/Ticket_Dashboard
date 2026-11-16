import { NextResponse } from "next/server";
import { creaAgente, listaAgenti } from "@/lib/agenti";
import type { AgenteInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stesso criterio di /api/caselle: intestazioni x-operator-* iniettate dal
// middleware dopo la verifica della sessione.
function richiediAdmin(request: Request): NextResponse | null {
  if (!request.headers.get("x-operator-id")) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (request.headers.get("x-operator-ruolo") !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const agenti = await listaAgenti();
    return NextResponse.json({ agenti });
  } catch (err) {
    console.error("GET /api/agenti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AgenteInput>;
    const esito = await creaAgente(
      {
        nome: String(body.nome ?? ""),
        descrizione: typeof body.descrizione === "string" ? body.descrizione : undefined,
        ruolo: body.ruolo,
        modello: typeof body.modello === "string" ? body.modello : undefined,
        system_prompt: String(body.system_prompt ?? ""),
        strumenti: Array.isArray(body.strumenti)
          ? body.strumenti.filter((s): s is string => typeof s === "string")
          : undefined,
        attivo: body.attivo,
      },
      request.headers.get("x-operator-id") ?? undefined
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
