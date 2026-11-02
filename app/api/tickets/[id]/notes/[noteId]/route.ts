import { NextResponse } from "next/server";
import { deleteTechnicalNote, updateTechnicalNote } from "@/lib/tickets";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

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
  return NextResponse.json({ nota: note });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const operatorId = getOperatorId(request);
  const operatorRole = getOperatorRole(request);
  
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  
  // Only admins can delete notes
  if (operatorRole !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  const ok = await deleteTechnicalNote(params.noteId);
  if (!ok) {
    return NextResponse.json({ error: "Nota tecnica non trovata." }, { status: 404 });
  }
  // Niente rilettura del ticket: il client ricarica da se' dopo un'eliminazione.
  return NextResponse.json({ ok: true });
}
