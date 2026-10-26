import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import {
  deleteAttivita,
  getAttivita,
  STATI_ATTIVITA,
  updateAttivita,
} from "@/lib/attivita";
import { getProgetto } from "@/lib/progetti";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";
import type { AttivitaUpdate, Priorita } from "@/lib/types";

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

  const attivita = await getAttivita(params.id);
  if (!attivita) {
    return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
  }
  return NextResponse.json(attivita);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const existing = await getAttivita(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as AttivitaUpdate;
    const patch: AttivitaUpdate = {};

    if (body.titolo !== undefined) {
      const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
      if (!titolo) {
        return NextResponse.json({ error: "Il titolo è obbligatorio." }, { status: 400 });
      }
      patch.titolo = titolo;
    }
    if (body.stato !== undefined) {
      if (!STATI_ATTIVITA.includes(body.stato)) {
        return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
      }
      patch.stato = body.stato;
    }
    if (body.priorita !== undefined) {
      if (!PRIORITA.includes(body.priorita)) {
        return NextResponse.json({ error: "Priorita' non valida." }, { status: 400 });
      }
      patch.priorita = body.priorita;
    }
    if (body.descrizione !== undefined) patch.descrizione = body.descrizione;
    if (body.assegnatario !== undefined) patch.assegnatario = body.assegnatario;

    // Spostamento tra contenitori: progetto e cliente restano mutuamente
    // esclusivi, e il nuovo contenitore deve esistere.
    if (body.progetto_id !== undefined || body.cliente_id !== undefined) {
      const progettoId = body.progetto_id !== undefined ? body.progetto_id : existing.progetto_id;
      const clienteId = body.cliente_id !== undefined ? body.cliente_id : existing.cliente_id;

      if (progettoId && clienteId) {
        return NextResponse.json(
          { error: "Un evento non può appartenere a un progetto e a un cliente insieme." },
          { status: 400 }
        );
      }
      if (progettoId && !(await getProgetto(progettoId))) {
        return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
      }
      if (clienteId && !(await getCliente(clienteId))) {
        return NextResponse.json({ error: "Cliente non trovato." }, { status: 400 });
      }
      if (body.progetto_id !== undefined) patch.progetto_id = progettoId || null;
      if (body.cliente_id !== undefined) patch.cliente_id = clienteId || null;
    }

    for (const campo of ["data_inizio", "data_scadenza"] as const) {
      const v = body[campo];
      if (v !== undefined) {
        if (v !== null && v !== "" && (typeof v !== "string" || !RE_DATETIME_LOCAL.test(v))) {
          return NextResponse.json({ error: "Formato data non valido." }, { status: 400 });
        }
        patch[campo] = v || null;
      }
    }

    const attivita = await updateAttivita(params.id, patch, existing);
    if (!attivita) {
      return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
    }
    return NextResponse.json(attivita);
  } catch (err) {
    console.error("PATCH /api/attivita/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const existing = await getAttivita(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
  }

  try {
    const ok = await deleteAttivita(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attivita/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
