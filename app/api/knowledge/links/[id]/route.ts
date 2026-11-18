import { NextResponse } from "next/server";
import { getKnowledgeLink, updateKnowledgeLink, deleteKnowledgeLink } from "@/lib/knowledge-links";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

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
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json()) as { titolo?: string; url?: string; descrizione?: string | null; categoria?: string };

  if (body.url && !urlHttp(body.url)) {
    return NextResponse.json({ error: "L'URL deve essere http o https." }, { status: 400 });
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
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const ok = await deleteKnowledgeLink(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Link non trovato." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function urlHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
