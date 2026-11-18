import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";
import { inlineConsentito, mimeDaFile, nomeOriginaleSicuro } from "@/lib/allegati";

const UPLOADS_DIR = join(process.cwd(), "uploads");

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const row = await db.prepare(
      `SELECT * FROM allegati WHERE id = @id`
    ).get({ id: params.id });

    if (!row) {
      return NextResponse.json({ error: "Allegato non trovato." }, { status: 404 });
    }

    const filePath = join(UPLOADS_DIR, row.nome_file as string);
    const fileBuffer = await readFile(filePath);

    // Il MIME si ricalcola dal nome originale, NON si usa quello salvato:
    // le righe vecchie possono avere un tipo scelto dal client (es. text/html).
    const nome = nomeOriginaleSicuro(row.nome_originale as string);
    const mime = mimeDaFile(nome);
    const inline = inlineConsentito(mime);
    const disposition = inline ? "inline" : "attachment";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mime,
        // filename* gestisce correttamente accenti e spazi (RFC 5987).
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(nome)}`,
        // Mai lasciare che il browser indovini il tipo: un file dichiarato
        // octet-stream deve restare un download, non diventare HTML.
        "X-Content-Type-Options": "nosniff",
        // Un documento caricato non deve poter eseguire script o incorporare
        // risorse esterne nemmeno se aperto direttamente.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/uploads/[id]", err);
    return NextResponse.json({ error: "Errore durante il download del file." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Eliminare un allegato e' irreversibile: solo amministratori.
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const row = await db.prepare(
      `SELECT * FROM allegati WHERE id = ?`
    ).get(params.id);

    if (!row) {
      return NextResponse.json({ error: "Allegato non trovato." }, { status: 404 });
    }

    // Delete file from disk
    const filePath = join(UPLOADS_DIR, row.nome_file as string);
    await unlink(filePath).catch(() => {});

    // Delete from DB
    await db.prepare(`DELETE FROM allegati WHERE id = @id`).run({ id: params.id });

    await registra({
      operatoreId: auth.operatore.id,
      azione: "allegato.eliminato",
      entita: "allegato",
      entitaId: params.id,
      dettagli: {
        nome: row.nome_originale,
        ticket_id: row.ticket_id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/uploads/[id]", err);
    return NextResponse.json({ error: "Errore durante l'eliminazione del file." }, { status: 500 });
  }
}
