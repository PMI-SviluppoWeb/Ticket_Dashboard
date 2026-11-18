import { NextResponse } from "next/server";
import { deleteKnowledgeDoc, getKnowledgeDoc, updateKnowledgeDoc } from "@/lib/knowledge";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

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
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json()) as { links?: Array<{ url: string; title: string }> };

  // Link della knowledge base: solo http/https. Un "javascript:" salvato qui
  // verrebbe reso cliccabile nella pagina e diventerebbe uno script.
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) {
      return NextResponse.json({ error: "Formato links non valido." }, { status: 400 });
    }
    for (const link of body.links) {
      if (!link || typeof link.url !== "string" || !urlHttp(link.url)) {
        return NextResponse.json(
          { error: "I link devono essere http o https." },
          { status: 400 }
        );
      }
    }
  }

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
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const ok = await deleteKnowledgeDoc(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
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
