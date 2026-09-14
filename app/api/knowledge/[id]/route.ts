import { NextResponse } from "next/server";
import { deleteKnowledgeDoc, getKnowledgeDoc, updateKnowledgeDoc } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  
  const doc = await getKnowledgeDoc(params.id);
  if (!doc) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const body = (await request.json()) as { links?: Array<{ url: string; title: string }> };
  
  const updated = await updateKnowledgeDoc(params.id, body);
  if (!updated) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  const operatorRole = getOperatorRole(request);
  
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  
  // Only admins can delete knowledge docs
  if (operatorRole !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  const ok = await deleteKnowledgeDoc(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
