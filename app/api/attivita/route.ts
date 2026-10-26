import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { insertAttivita, listEventiSenzaProgetto, STATI_ATTIVITA } from "@/lib/attivita";
import { getProgetto } from "@/lib/progetti";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";
import type { AttivitaInput, Priorita, StatoAttivita } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

// Nessun controllo di ruolo: vedi la nota in app/api/progetti/route.ts.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

// Eventi fuori progetto (con o senza cliente collegato).
export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dal = searchParams.get("dal") || undefined;
  const al = searchParams.get("al") || undefined;
  const clienteId = searchParams.get("cliente_id") || undefined;

  try {
    const attivita = await listEventiSenzaProgetto({ dal, al, cliente_id: clienteId });
    return NextResponse.json({ attivita });
  } catch (err) {
    console.error("GET /api/attivita", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AttivitaInput>;

    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) {
      return NextResponse.json({ error: "Il titolo è obbligatorio." }, { status: 400 });
    }

    const progettoId = body.progetto_id || null;
    const clienteId = body.cliente_id || null;

    // Un evento appartiene a un progetto OPPURE a un cliente: se appartiene a
    // un progetto, il cliente e' quello del progetto.
    if (progettoId && clienteId) {
      return NextResponse.json(
        { error: "Un evento non può appartenere a un progetto e a un cliente insieme." },
        { status: 400 }
      );
    }

    // Le foreign key non sono applicate dal DB: esistenza verificata qui.
    if (progettoId && !(await getProgetto(progettoId))) {
      return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
    }
    if (clienteId && !(await getCliente(clienteId))) {
      return NextResponse.json({ error: "Cliente non trovato." }, { status: 400 });
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
      progetto_id: progettoId,
      cliente_id: clienteId,
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
    console.error("POST /api/attivita", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
