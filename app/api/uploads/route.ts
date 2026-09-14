import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Il file supera la dimensione massima di 10MB." }, { status: 400 });
    }

    // Ensure uploads directory exists
    await mkdir(UPLOADS_DIR, { recursive: true });

    // Generate unique filename
    const id = randomUUID();
    const ext = file.name.split(".").pop() || "bin";
    const fileName = `${id}.${ext}`;

    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOADS_DIR, fileName), buffer);

    // Save metadata to DB
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO allegati (id, note_tecnica_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione)
       VALUES (@id, @noteId, @ticketId, @nomeFile, @nomeOriginale, @dimensione, @tipoMime, @dataCreazione)`
    ).run({
      id,
      noteId,
      ticketId,
      nomeFile: fileName,
      nomeOriginale: file.name,
      dimensione: file.size,
      tipoMime: file.type || "application/octet-stream",
      dataCreazione: now,
    });

    return NextResponse.json({
      id,
      nome_file: fileName,
      nome_originale: file.name,
      dimensione: file.size,
      tipo_mime: file.type,
      data_creazione: now,
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/uploads", err);
    return NextResponse.json({ error: "Errore durante il caricamento del file." }, { status: 500 });
  }
}