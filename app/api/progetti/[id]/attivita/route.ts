import { NextResponse } from "next/server";
import { insertAttivita, listAttivitaProgetto, STATI_ATTIVITA } from "@/lib/attivita";
import { getProgetto } from "@/lib/progetti";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";
import type { AttivitaInput, Priorita, StatoAttivita } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

// Nessun controllo di ruolo: vedi la nota in app/api/progetti/route.ts.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const attivita = await listAttivitaProgetto(params.id);
    return NextResponse.json({ attivita });
  } catch (err) {
    console.error("GET /api/progetti/[id]/attivita", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const progetto = await getProgetto(params.id);
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AttivitaInput>;

    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return NextResponse.json({ error: "Il titolo è obbligatorio." }, { status: 400 });
    }
    if (body.stato !== undefined && !STATI_ATTIVITA.includes(body.stato)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    if (body.priorita !== undefined && !PRIORITA.includes(body.priorita)) {
      return NextResponse.json({ error: "Priorita' non valida." }, { status: 400 });
    }
    for (const campo of ["data_inizio", "data_scadenza"] as const) {
      const v = body[campo];
      if (v !== undefined && v !== null && v !== "" && (typeof v !== "string" || !RE_DATETIME_LOCAL.test(v))) {
        return NextResponse.json({ error: "Formato data non valido." }, { status: 400 });
      }
    }

    const attivita = await insertAttivita({
      progetto_id: params.id,
      cliente_id: null,
      titolo,
      descrizione: body.descrizione ?? null,
      stato: body.stato as StatoAttivita | undefined,
      priorita: body.priorita,
      data_inizio: body.data_inizio || null,
      data_scadenza: body.data_scadenza || null,
      assegnatario: body.assegnatario ?? null,
    });

    return NextResponse.json(attivita, { status: 201 });
  } catch (err) {
    console.error("POST /api/progetti/[id]/attivita", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
