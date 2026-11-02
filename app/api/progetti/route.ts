import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { insertProgetto, listProgetti, STATI_PROGETTO } from "@/lib/progetti";
import { parsePersone } from "@/lib/persone";
import type { Priorita, ProgettoInput, StatoProgetto } from "@/lib/types";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";

export const dynamic = "force-dynamic";

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

// Nessun controllo di ruolo su questa area: la scelta "tutti gli utenti
// autenticati creano e modificano" e' deliberata e diverge dal resto del repo
// (es. /api/knowledge e' admin-only).
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const statoParam = searchParams.get("stato") ?? "TUTTI";
  const clienteId = searchParams.get("cliente_id") ?? "";
  const pagina = parseInt(searchParams.get("pagina") ?? "1", 10);
  const paginaSize = parseInt(searchParams.get("paginaSize") ?? "25", 10);

  const stato: StatoProgetto | "TUTTI" = STATI_PROGETTO.includes(statoParam as StatoProgetto)
    ? (statoParam as StatoProgetto)
    : "TUTTI";

  try {
    const result = await listProgetti({
      q,
      stato,
      cliente_id: clienteId || undefined,
      pagina: Number.isNaN(pagina) ? 1 : pagina,
      paginaSize: Number.isNaN(paginaSize) ? 25 : paginaSize,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/progetti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ProgettoInput>;

    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return NextResponse.json(
        { error: "Il nome del progetto è obbligatorio." },
        { status: 400 }
      );
    }

    const clienteId = typeof body.cliente_id === "string" ? body.cliente_id.trim() : "";
    if (!clienteId) {
      return NextResponse.json({ error: "Il cliente è obbligatorio." }, { status: 400 });
    }

    // Le foreign key non sono applicate dal DB: l'esistenza del cliente va
    // verificata esplicitamente prima di scrivere.
    const cliente = await getCliente(clienteId);
    if (!cliente) {
      return NextResponse.json({ error: "Cliente non trovato." }, { status: 400 });
    }

    if (body.stato !== undefined && !STATI_PROGETTO.includes(body.stato)) {
      return NextResponse.json({ error: "Stato non valido." }, { status: 400 });
    }
    if (body.priorita !== undefined && !PRIORITA.includes(body.priorita)) {
      return NextResponse.json({ error: "Priorita' non valida." }, { status: 400 });
    }
    if (body.persone !== undefined && !Array.isArray(body.persone)) {
      return NextResponse.json({ error: "Formato persone non valido." }, { status: 400 });
    }
    for (const campo of ["data_inizio", "data_fine"] as const) {
      const v = body[campo];
      if (v !== undefined && v !== null && v !== "" && (typeof v !== "string" || !RE_DATETIME_LOCAL.test(v))) {
        return NextResponse.json({ error: "Formato data non valido." }, { status: 400 });
      }
    }

    const progetto = await insertProgetto({
      nome,
      descrizione: body.descrizione ?? null,
      cliente_id: clienteId,
      stato: body.stato,
      priorita: body.priorita,
      responsabile: body.responsabile ?? null,
      persone: parsePersone(body.persone),
      data_inizio: body.data_inizio || null,
      data_fine: body.data_fine || null,
      note: body.note ?? null,
    });

    return NextResponse.json(progetto, { status: 201 });
  } catch (err) {
    console.error("POST /api/progetti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
