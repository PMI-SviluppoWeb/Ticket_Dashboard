import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { insertKnowledgeDoc, listKnowledgeDocs } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024;

export async function GET(request: Request) {
  const operatorId = request.headers.get("x-operator-id");
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const docs = await listKnowledgeDocs(q);
  return NextResponse.json({ docs, totale: docs.length });
}

export async function POST(request: Request) {
  const operatorId = request.headers.get("x-operator-id");
  const operatorRole = request.headers.get("x-operator-ruolo");
  
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  
  // Only admins can upload knowledge docs
  if (operatorRole !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Campo 'file' mancante." }, { status: 400 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'file' mancante." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Sono ammessi solo file PDF." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Il file è vuoto." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Il file supera la dimensione massima di 25 MB." },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    let testo = "";
    let pagine: number | null = null;
    try {
      const proxy = await getDocumentProxy(buffer);
      pagine = proxy.numPages;
      const result = await extractText(proxy, { mergePages: true });
      testo = (result.text ?? "").trim();
    } catch {
      return NextResponse.json(
        { error: "Impossibile leggere il contenuto del PDF." },
        { status: 400 }
      );
    }

    if (!testo) {
      return NextResponse.json(
        { error: "Il PDF non contiene testo estraibile (potrebbe essere scansionato o protetto)." },
        { status: 400 }
      );
    }

    const doc = await insertKnowledgeDoc({
      nome_file: file.name,
      dimensione: file.size,
      pagine,
      testo,
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error("Errore durante l'upload del documento:", err);
    return NextResponse.json(
      { error: "Errore interno durante l'elaborazione del file." },
      { status: 500 }
    );
  }
}
