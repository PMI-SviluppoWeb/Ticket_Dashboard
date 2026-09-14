import { NextResponse } from "next/server";
import { getKnowledgeLink, updateKnowledgeLink, deleteKnowledgeLink } from "@/lib/knowledge-links";

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

  const link = await getKnowledgeLink(params.id);
  if (!link) {
    return NextResponse.json({ error: "Link non trovato." }, { status: 404 });
  }
  return NextResponse.json(link);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const body = (await request.json()) as { titolo?: string; url?: string; descrizione?: string | null; categoria?: string };

  if (body.url) {
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: "URL non valido." }, { status: 400 });
    }
  }

  const updated = await updateKnowledgeLink(params.id, body);
  if (!updated) {
    return NextResponse.json({ error: "Link non trovato." }, { status: 404 });
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

  if (operatorRole !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  const ok = await deleteKnowledgeLink(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Link non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
