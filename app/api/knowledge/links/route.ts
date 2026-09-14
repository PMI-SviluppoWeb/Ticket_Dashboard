import { NextResponse } from "next/server";
import { listKnowledgeLinks, insertKnowledgeLink } from "@/lib/knowledge-links";
import type { KnowledgeLinkInput } from "@/lib/types";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const categoria = searchParams.get("categoria") ?? undefined;

  const links = await listKnowledgeLinks(q, categoria);
  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const body = (await request.json()) as KnowledgeLinkInput;
  if (!body.titolo?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: "Titolo e URL sono obbligatori." }, { status: 400 });
  }

  try {
    new URL(body.url);
  } catch {
    return NextResponse.json({ error: "URL non valido." }, { status: 400 });
  }

  const link = await insertKnowledgeLink({
    titolo: body.titolo.trim(),
    url: body.url.trim(),
    descrizione: body.descrizione?.trim() || undefined,
    categoria: body.categoria?.trim() || "generale",
  });

  return NextResponse.json(link, { status: 201 });
}
