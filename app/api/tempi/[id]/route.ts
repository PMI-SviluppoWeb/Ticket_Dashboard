import { NextResponse } from "next/server";
import { eliminaVoce, fermaVoce } from "@/lib/tempi";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";

export const dynamic = "force-dynamic";

// Il cronometro e' personale: l'identita' viene dalla sessione.

// PATCH /api/tempi/[id] — ferma la voce.
// Andare a capo su una voce gia' chiusa e' idempotente: un doppio clic non
// sposta la fine.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;
  const operatorId = auth.operatore.id;

  try {
    const voce = await fermaVoce(params.id, operatorId);
    // null copre due casi distinti (voce inesistente e voce di un altro
    // operatore): la risposta e' la stessa di proposito, per non rivelare
    // quali id esistono.
    if (!voce) {
      return NextResponse.json({ error: "Voce di tempo non trovata." }, { status: 404 });
    }
    await registra({
      operatoreId: auth.operatore.id,
      azione: "voce_tempo.fermata",
      entita: "voce_tempo",
      entitaId: params.id,
    });
    return NextResponse.json(voce);
  } catch (err) {
    console.error("PATCH /api/tempi/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// DELETE /api/tempi/[id] — elimina una voce chiusa registrata per errore
// (tipicamente un timer dimenticato aperto per ore). Una voce in corso va
// fermata, non cancellata: il modulo rifiuta la DELETE.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;
  const operatorId = auth.operatore.id;

  try {
    const ok = await eliminaVoce(params.id, operatorId);
    if (!ok) {
      return NextResponse.json(
        { error: "Voce di tempo non trovata o ancora in corso." },
        { status: 404 }
      );
    }
    await registra({
      operatoreId: auth.operatore.id,
      azione: "voce_tempo.eliminata",
      entita: "voce_tempo",
      entitaId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tempi/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
