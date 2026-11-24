import { NextResponse } from "next/server";
import {
  eliminaConversazione,
  getConversazione,
  getAgente,
  listaEsecuzioni,
  puoUsareAgente,
} from "@/lib/agenti";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Solo il proprietario della conversazione (o un admin) può leggerla/chiuderla.
function puoVedereConversazione(
  operatoreId: string,
  ruolo: string,
  conversazioneOperatoreId: string
): boolean {
  return ruolo === "admin" || operatoreId === conversazioneOperatoreId;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string; conversazioneId: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const agente = await getAgente(params.id);
  if (!(await puoUsareAgente(agente, auth.operatore))) {
    return NextResponse.json({ error: "Agente non trovato." }, { status: 404 });
  }

  try {
    const conversazione = await getConversazione(params.conversazioneId);
    if (
      !conversazione ||
      conversazione.agente_id !== params.id ||
      !puoVedereConversazione(
        auth.operatore.id,
        auth.operatore.ruolo,
        conversazione.operatore_id
      )
    ) {
      return NextResponse.json(
        { error: "Conversazione non trovata." },
        { status: 404 }
      );
    }
    // I turni sono il log delle esecuzioni: input = messaggio utente,
    // output = risposta dell'agente.
    const messaggi = await listaEsecuzioni(
      params.id,
      200,
      conversazione.id
    );
    return NextResponse.json({ conversazione, messaggi });
  } catch (err) {
    console.error("GET /api/agenti/[id]/conversazioni/[conversazioneId]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; conversazioneId: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const conversazione = await getConversazione(params.conversazioneId);
  if (
    !conversazione ||
    conversazione.agente_id !== params.id ||
    !puoVedereConversazione(
      auth.operatore.id,
      auth.operatore.ruolo,
      conversazione.operatore_id
    )
  ) {
    return NextResponse.json({ error: "Conversazione non trovata." }, { status: 404 });
  }

  try {
    await eliminaConversazione(params.conversazioneId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/agenti/[id]/conversazioni/[conversazioneId]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
