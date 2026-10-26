import { NextResponse } from "next/server";
import { eliminaVoce, fermaVoce } from "@/lib/tempi";

export const dynamic = "force-dynamic";

// Il cronometro e' personale: l'id dell'operatore arriva dal middleware.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

// PATCH /api/tempi/[id] — ferma la voce.
// Andare a capo su una voce gia' chiusa e' idempotente: un doppio clic non
// sposta la fine.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const voce = await fermaVoce(params.id, operatorId);
    // null copre due casi distinti (voce inesistente e voce di un altro
    // operatore): la risposta e' la stessa di proposito, per non rivelare
    // quali id esistono.
    if (!voce) {
      return NextResponse.json({ error: "Voce di tempo non trovata." }, { status: 404 });
    }
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
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const ok = await eliminaVoce(params.id, operatorId);
    if (!ok) {
      return NextResponse.json(
        { error: "Voce di tempo non trovata o ancora in corso." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tempi/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
