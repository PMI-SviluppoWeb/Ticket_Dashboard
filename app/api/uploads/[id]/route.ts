import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile, unlink } from "fs/promises";
import { join } from "path";

const UPLOADS_DIR = join(process.cwd(), "uploads");

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const row = await db.prepare(
      `SELECT * FROM allegati WHERE id = @id`
    ).get({ id: params.id });

    if (!row) {
      return NextResponse.json({ error: "Allegato non trovato." }, { status: 404 });
    }

    const filePath = join(UPLOADS_DIR, row.nome_file as string);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": row.tipo_mime as string,
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.nome_originale as string)}"`,
        "Cache-Control": "private, max-age=3600",
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/uploads/[id]", err);
    return NextResponse.json({ error: "Errore durante l'eliminazione del file." }, { status: 500 });
  }
}