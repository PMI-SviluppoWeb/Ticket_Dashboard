import { NextResponse } from "next/server";
import { eseguiAgente } from "@/lib/agenti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function richiediAdmin(request: Request): NextResponse | null {
  if (!request.headers.get("x-operator-id")) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (request.headers.get("x-operator-ruolo") !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

// POST /api/agenti/[id]/esegui — invoca l'agente con un input di prova e
// ritorna l'esecuzione completa (output, durata, token). Sincrona: la UI
// attende la risposta del modello.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      input?: string;
      contesto?: Record<string, unknown>;
    };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "Input obbligatorio." }, { status: 400 });
    }

    const esito = await eseguiAgente({
      agenteId: params.id,
      input: body.input,
      contesto:
        body.contesto && typeof body.contesto === "object" ? body.contesto : undefined,
      operatoreId: request.headers.get("x-operator-id") ?? undefined,
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ esecuzione: esito.esecuzione });
  } catch (err) {
    console.error("POST /api/agenti/[id]/esegui", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
