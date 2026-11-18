import { NextResponse } from "next/server";
import { listKnowledgeLinks, insertKnowledgeLink } from "@/lib/knowledge-links";
import { richiediOperatore } from "@/lib/auth";
import type { KnowledgeLinkInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const categoria = searchParams.get("categoria") ?? undefined;

  const links = await listKnowledgeLinks(q, categoria);
  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json()) as KnowledgeLinkInput;
  if (!body.titolo?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: "Titolo e URL sono obbligatori." }, { status: 400 });
  }
  if (!urlHttp(body.url)) {
    return NextResponse.json({ error: "L'URL deve essere http o https." }, { status: 400 });
  }

  const link = await insertKnowledgeLink({
    titolo: body.titolo.trim(),
    url: body.url.trim(),
    descrizione: body.descrizione?.trim() || undefined,
    categoria: body.categoria?.trim() || "generale",
  });

  return NextResponse.json(link, { status: 201 });
}

function urlHttp(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
