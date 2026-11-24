import { NextResponse } from "next/server";
import {
  getAgente,
  impostaAssegnazione,
  listaAssegnazioni,
  rimuoviAssegnazione,
} from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/agenti/[id]/assegnazioni — righe di assegnazione dell'agente
// (solo admin: è la configurazione della libreria).
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!agente) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }

  try {
    const assegnazioni = await listaAssegnazioni(params.id);
    return NextResponse.json({ assegnazioni });
  } catch (err) {
    console.error("GET /api/agenti/[id]/assegnazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// PUT /api/agenti/[id]/assegnazioni — abilita/disabilita e pinna l'agente per
// un operatore. Body: { operatoreId, abilitato?, pinnato?, ordine? }.
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!agente) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      operatoreId?: string;
      abilitato?: boolean;
      pinnato?: boolean;
      ordine?: number;
    };
    if (typeof body.operatoreId !== "string" || !body.operatoreId) {
      return NextResponse.json({ error: "operatoreId obbligatorio." }, { status: 400 });
    }
    const assegnazione = await impostaAssegnazione({
      agenteId: params.id,
      operatoreId: body.operatoreId,
      abilitato: typeof body.abilitato === "boolean" ? body.abilitato : undefined,
      pinnato: typeof body.pinnato === "boolean" ? body.pinnato : undefined,
      ordine: typeof body.ordine === "number" ? body.ordine : undefined,
    });
    return NextResponse.json({ assegnazione });
  } catch (err) {
    console.error("PUT /api/agenti/[id]/assegnazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// DELETE /api/agenti/[id]/assegnazioni?operatoreId=... — torna al default
// (libreria visibile a tutti per quell'operatore).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const operatoreId = new URL(request.url).searchParams.get("operatoreId");
    if (!operatoreId) {
      return NextResponse.json({ error: "operatoreId obbligatorio." }, { status: 400 });
    }
    await rimuoviAssegnazione(params.id, operatoreId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/agenti/[id]/assegnazioni", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
