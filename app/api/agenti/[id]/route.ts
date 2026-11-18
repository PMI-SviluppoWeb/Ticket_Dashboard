import { NextResponse } from "next/server";
import {
  aggiornaAgente,
  eliminaAgente,
  getAgente,
  puoGestireAgente,
  puoUsareAgente,
} from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";
import type { AgenteInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!puoUsareAgente(agente, auth.operatore)) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }
  return NextResponse.json({ agente });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!puoGestireAgente(agente, auth.operatore)) {
    return NextResponse.json(
      { error: "Puoi modificare solo i tuoi agenti personali." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AgenteInput>;
    // Un non-admin non puo' trasformare un agente personale in libreria.
    if (auth.operatore.ruolo !== "admin") delete body.visibilita;
    const esito = await aggiornaAgente(params.id, body);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ agente: esito.agente });
  } catch (err) {
    console.error("PATCH /api/agenti/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!puoGestireAgente(agente, auth.operatore)) {
    return NextResponse.json(
      { error: "Puoi eliminare solo i tuoi agenti personali." },
      { status: 403 }
    );
  }

  try {
    const esito = await eliminaAgente(params.id);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error ?? "Errore." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/agenti/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
