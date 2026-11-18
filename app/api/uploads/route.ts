import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";
import {
  estensione,
  mimeDaNome,
  nomeOriginaleSicuro,
} from "@/lib/allegati";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const noteId = formData.get("noteId") as string | null;
    const ticketId = formData.get("ticketId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Nessun file fornito." }, { status: 400 });
    }

    if (!noteId || !ticketId) {
      return NextResponse.json({ error: "noteId e ticketId sono obbligatori." }, { status: 400 });
    }

    // La nota deve esistere E appartenere al ticket dichiarato: senza questo
    // controllo un allegato poteva essere agganciato a una nota qualsiasi.
    const nota = await db
      .prepare(`SELECT id, ticket_id FROM technical_notes WHERE id = ?`)
      .get(noteId);
    if (!nota) {
      return NextResponse.json({ error: "Nota tecnica non trovata." }, { status: 404 });
    }
    if (nota.ticket_id !== ticketId) {
      return NextResponse.json(
        { error: "La nota non appartiene al ticket indicato." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Il file supera la dimensione massima di 10MB." }, { status: 400 });
    }

    // Il tipo si decide dal nome su una lista chiusa: file di altro tipo non
    // entrano proprio. Il MIME dichiarato dal client viene ignorato.
    const nomeOriginale = nomeOriginaleSicuro(file.name);
    const tipoMime = mimeDaNome(nomeOriginale);
    if (!tipoMime) {
      return NextResponse.json(
        {
          error:
            "Tipo di file non consentito. Ammessi: PDF, immagini (PNG/JPG/GIF/WEBP), TXT, CSV, DOC(X), XLS(X), ODT, ODS, ZIP, RAR, 7Z.",
        },
        { status: 400 }
      );
    }

    await mkdir(UPLOADS_DIR, { recursive: true });

    const id = randomUUID();
    const ext = estensione(nomeOriginale);
    const fileName = `${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOADS_DIR, fileName), buffer);

    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO allegati (id, note_tecnica_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione)
       VALUES (@id, @noteId, @ticketId, @nomeFile, @nomeOriginale, @dimensione, @tipoMime, @dataCreazione)`
    ).run({
      id,
      noteId,
      ticketId,
      nomeFile: fileName,
      nomeOriginale,
      dimensione: file.size,
      tipoMime,
      dataCreazione: now,
    });

    await registra({
      operatoreId: auth.operatore.id,
      azione: "allegato.caricato",
      entita: "allegato",
      entitaId: id,
      dettagli: {
        ticket_id: ticketId,
        note_tecnica_id: noteId,
        nome: nomeOriginale,
        dimensione: file.size,
        tipo: tipoMime,
      },
    });

    return NextResponse.json({
      id,
      nome_file: fileName,
      nome_originale: nomeOriginale,
      dimensione: file.size,
      tipo_mime: tipoMime,
      data_creazione: now,
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/uploads", err);
    return NextResponse.json({ error: "Errore durante il caricamento del file." }, { status: 500 });
  }
}
