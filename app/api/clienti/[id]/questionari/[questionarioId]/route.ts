import { NextResponse } from "next/server";
import { annullaQuestionario, getQuestionario } from "@/lib/questionari";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/clienti/[id]/questionari/[questionarioId] — annulla il link.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; questionarioId: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const questionario = await getQuestionario(params.questionarioId);
  if (!questionario || questionario.cliente_id !== params.id) {
    return NextResponse.json({ error: "Questionario non trovato." }, { status: 404 });
  }

  try {
    const esito = await annullaQuestionario(params.questionarioId, {
      operatoreId: auth.operatore.id,
    });
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error ?? "Errore." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/clienti/[id]/questionari/[questionarioId]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
