import { NextResponse } from "next/server";
import {
  aggiornaRapportino,
  eliminaRapportino,
  getRapportino,
} from "@/lib/rapportini";
import { richiediOperatore } from "@/lib/auth";
import type { RapportinoInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const rapportino = await getRapportino(params.id);
  if (!rapportino) {
    return NextResponse.json({ error: "Rapportino non trovato." }, { status: 404 });
  }
  return NextResponse.json({ rapportino });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as RapportinoInput;
    const esito = await aggiornaRapportino(
      params.id,
      {
        attivita: typeof body.attivita === "string" ? body.attivita : undefined,
        note_aggiuntive:
          typeof body.note_aggiuntive === "string" ? body.note_aggiuntive : undefined,
        minuti_totali:
          typeof body.minuti_totali === "number" ? body.minuti_totali : undefined,
        stato: body.stato === "bozza" || body.stato === "confermato" ? body.stato : undefined,
      },
      { operatoreId: auth.operatore.id }
    );
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ rapportino: esito.rapportino });
  } catch (err) {
    console.error("PATCH /api/rapportini/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const esito = await eliminaRapportino(params.id, {
      operatoreId: auth.operatore.id,
    });
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error ?? "Errore." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/rapportini/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
