import { db } from "./db";
import type { KnowledgeDoc, KnowledgeDocInput, KnowledgeDocRow } from "./types";

const ROW_FIELDS = `id, nome_file, dimensione, pagine, data_creazione`;
const FULL_FIELDS = `id, nome_file, dimensione, pagine, testo, data_creazione`;

function now(): string {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function insertKnowledgeDoc(
  input: KnowledgeDocInput
): Promise<KnowledgeDoc> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO knowledge_docs (id, nome_file, dimensione, pagine, testo, data_creazione)
       VALUES (@id, @nome_file, @dimensione, @pagine, @testo, @data_creazione)`
    )
    .run({
      id,
      nome_file: input.nome_file,
      dimensione: input.dimensione,
      pagine: input.pagine,
      testo: input.testo,
      data_creazione: now(),
    });
  return (await getKnowledgeDoc(id))!;
}

export async function listKnowledgeDocs(q?: string): Promise<KnowledgeDocRow[]> {
  const where: string[] = [];
  const params: Record<string, string> = {};
  const search = q?.trim();
  if (search) {
    where.push("(nome_file LIKE @q OR testo LIKE @q)");
    params.q = `%${search}%`;
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT ${ROW_FIELDS} FROM knowledge_docs ${whereSql}
       ORDER BY data_creazione DESC, rowid DESC`
    )
    .all(params);
  return rows as unknown as KnowledgeDocRow[];
}

export async function getKnowledgeDoc(id: string): Promise<KnowledgeDoc | null> {
  const row = await db
    .prepare(`SELECT ${FULL_FIELDS} FROM knowledge_docs WHERE id = ?`)
    .get(id);
  return (row as KnowledgeDoc | undefined) ?? null;
}

export async function deleteKnowledgeDoc(id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM knowledge_docs WHERE id = ?").run(id);
  return res.changes > 0;
}

export async function countKnowledgeDocs(): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM knowledge_docs").get();
  return (row?.n as number) ?? 0;
}
