import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { getCommerciale, salvaCommerciale } from "@/lib/clienti-commerciale";
import { richiediOperatore } from "@/lib/auth";
import type { ClienteCommercialeInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const commerciale = await getCommerciale(params.id);
    return NextResponse.json({ commerciale });
  } catch (err) {
    console.error("GET /api/clienti/[id]/commerciale", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const cliente = await getCliente(params.id);
  if (!cliente) {
    return NextResponse.json({ error: "Cliente non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ClienteCommercialeInput;
    const esito = await salvaCommerciale(params.id, body, {
      operatoreId: auth.operatore.id,
    });
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ commerciale: esito.commerciale });
  } catch (err) {
    console.error("PATCH /api/clienti/[id]/commerciale", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
