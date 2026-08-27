import { NextResponse } from "next/server";
import { deleteKnowledgeDoc, getKnowledgeDoc } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const doc = await getKnowledgeDoc(params.id);
  if (!doc) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const ok = await deleteKnowledgeDoc(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
