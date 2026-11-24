import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCasella,
  impostaAccessoCasella,
  operatoriConAccesso,
} from "@/lib/caselle";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accesso degli operatori a una casella: configurazione riservata all'admin.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const casella = await getCasella(params.id);
  if (!casella) {
    return NextResponse.json({ error: "Casella non trovata." }, { status: 404 });
  }

  try {
    const operatori = await operatoriConAccesso(params.id);
    return NextResponse.json({ operatori });
  } catch (err) {
    console.error("GET /api/caselle/[id]/accessi", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// PUT /api/caselle/[id]/accessi — abilita/disabilita un operatore.
// Body: { operatoreId, abilitato }.
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const casella = await getCasella(params.id);
  if (!casella) {
    return NextResponse.json({ error: "Casella non trovata." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      operatoreId?: string;
      abilitato?: boolean;
    };
    if (typeof body.operatoreId !== "string" || !body.operatoreId) {
      return NextResponse.json({ error: "operatoreId obbligatorio." }, { status: 400 });
    }
    if (typeof body.abilitato !== "boolean") {
      return NextResponse.json({ error: "abilitato obbligatorio." }, { status: 400 });
    }

    const operatore = await db
      .prepare("SELECT id FROM operatori WHERE id = ?")
      .get(body.operatoreId);
    if (!operatore) {
      return NextResponse.json({ error: "Operatore non trovato." }, { status: 404 });
    }

    await impostaAccessoCasella(params.id, body.operatoreId, body.abilitato);

    await registra({
      operatoreId: auth.operatore.id,
      azione: body.abilitato
        ? "casella.accesso_aggiunto"
        : "casella.accesso_rimosso",
      entita: "casella_email",
      entitaId: params.id,
      dettagli: { operatore_id: body.operatoreId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/caselle/[id]/accessi", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
