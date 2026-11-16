import { NextResponse } from "next/server";
import { aggiornaAgente, eliminaAgente, getAgente } from "@/lib/agenti";
import type { AgenteInput } from "@/lib/types";

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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const agente = await getAgente(params.id);
    if (!agente) return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
    return NextResponse.json({ agente });
  } catch (err) {
    console.error("GET /api/agenti/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AgenteInput>;
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
  const negato = richiediAdmin(request);
  if (negato) return negato;

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
