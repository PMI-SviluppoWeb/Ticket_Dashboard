import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { deleteProgetto, getProgetto, STATI_PROGETTO, updateProgetto } from "@/lib/progetti";
import { parsePersone } from "@/lib/persone";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";
import type { Priorita, ProgettoUpdate } from "@/lib/types";

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

  const progetto = await getProgetto(params.id);
  if (!progetto) {
    return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
  }
  return NextResponse.json(progetto);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const existing = await getProgetto(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ProgettoUpdate;
    const patch: ProgettoUpdate = {};

    if (body.nome !== undefined) {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nome) {
        return NextResponse.json(
          { error: "Il nome del progetto è obbligatorio." },
          { status: 400 }
        );
      }
      patch.nome = nome;
    }
    if (body.cliente_id !== undefined) {
      const cliente = await getCliente(body.cliente_id);
      if (!cliente) {
        return NextResponse.json({ error: "Cliente non trovato." }, { status: 400 });
      }
      patch.cliente_id = body.cliente_id;
    }
    if (body.stato !== undefined) {
      if (!STATI_PROGETTO.includes(body.stato)) {
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
    if (body.responsabile !== undefined) patch.responsabile = body.responsabile;
    if (body.persone !== undefined) {
      if (!Array.isArray(body.persone)) {
        return NextResponse.json({ error: "Formato persone non valido." }, { status: 400 });
      }
      patch.persone = parsePersone(body.persone);
    }
    if (body.note !== undefined) patch.note = body.note;
    if (body.attivo !== undefined) patch.attivo = !!body.attivo;

    for (const campo of ["data_inizio", "data_fine"] as const) {
      const v = body[campo];
      if (v !== undefined) {
        if (v !== null && v !== "" && (typeof v !== "string" || !RE_DATETIME_LOCAL.test(v))) {
          return NextResponse.json({ error: "Formato data non valido." }, { status: 400 });
        }
        patch[campo] = v || null;
      }
    }

    const progetto = await updateProgetto(params.id, patch);
    if (!progetto) {
      return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
    }
    return NextResponse.json(progetto);
  } catch (err) {
    console.error("PATCH /api/progetti/[id]", err);
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

  try {
    const ok = await deleteProgetto(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/progetti/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
