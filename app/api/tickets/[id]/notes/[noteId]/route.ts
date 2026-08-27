import { NextResponse } from "next/server";
import { deleteTechnicalNote, getTicket, updateTechnicalNote } from "@/lib/tickets";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
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

  return NextResponse.json(await getTicket(params.id));
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const ok = await deleteTechnicalNote(params.noteId);
  if (!ok) {
    return NextResponse.json({ error: "Nota tecnica non trovata." }, { status: 404 });
  }
  return NextResponse.json(await getTicket(params.id));
}
