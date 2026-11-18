import { NextResponse } from "next/server";
import { deleteTechnicalNote, updateTechnicalNote } from "@/lib/tickets";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json()) as {
    titolo?: string;
    problema?: string;
    soluzione?: string;
    operatore?: string | null;
  };

  const note = await updateTechnicalNote(params.noteId, {
    titolo: body.titolo,
    problema: body.problema,
    soluzione: body.soluzione,
    operatore: body.operatore,
  });

  if (!note) {
    return NextResponse.json({ error: "Nota tecnica non trovata." }, { status: 404 });
  }

  // Solo la nota: il client ha gia' il ticket e ricarica lui quando serve
  // (dopo gli allegati). Restituire l'intero ticket era un batch di quattro
  // SELECT il cui risultato veniva scartato.
  await registra({
    operatoreId: auth.operatore.id,
    azione: "nota_tecnica.aggiornata",
    entita: "nota_tecnica",
    entitaId: params.noteId,
    dettagli: { ticket_id: params.id, campi: Object.keys(body) },
  });

  return NextResponse.json({ nota: note });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  // Only admins can delete notes
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const ok = await deleteTechnicalNote(params.noteId);
  if (!ok) {
    return NextResponse.json({ error: "Nota tecnica non trovata." }, { status: 404 });
  }

  await registra({
    operatoreId: auth.operatore.id,
    azione: "nota_tecnica.eliminata",
    entita: "nota_tecnica",
    entitaId: params.noteId,
    dettagli: { ticket_id: params.id },
  });

  // Niente rilettura del ticket: il client ricarica da se' dopo un'eliminazione.
  return NextResponse.json({ ok: true });
}
