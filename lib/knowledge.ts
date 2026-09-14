import { db } from "./db";
import type { KnowledgeDoc, KnowledgeDocInput, KnowledgeDocRow, KnowledgeLink } from "./types";

const ROW_FIELDS = `id, nome_file, dimensione, pagine, links, data_creazione`;
const FULL_FIELDS = `id, nome_file, dimensione, pagine, testo, links, data_creazione`;

function now(): string {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseLinks(links: unknown): KnowledgeLink[] {
  if (typeof links === "string") {
    try {
      return JSON.parse(links);
    } catch {
      return [];
    }
  }
  if (Array.isArray(links)) return links as KnowledgeLink[];
  return [];
}

export async function insertKnowledgeDoc(
  input: KnowledgeDocInput
): Promise<KnowledgeDoc> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO knowledge_docs (id, nome_file, dimensione, pagine, testo, links, data_creazione)
       VALUES (@id, @nome_file, @dimensione, @pagine, @testo, @links, @data_creazione)`
    )
    .run({
      id,
      nome_file: input.nome_file,
      dimensione: input.dimensione,
      pagine: input.pagine,
      testo: input.testo,
      links: JSON.stringify(input.links ?? []),
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
  return (rows as unknown as Array<Omit<KnowledgeDocRow, "links"> & { links: unknown }>).map((r) => ({
    ...r,
    links: parseLinks(r.links),
  }));
}

export async function getKnowledgeDoc(id: string): Promise<KnowledgeDoc | null> {
  const row = await db
    .prepare(`SELECT ${FULL_FIELDS} FROM knowledge_docs WHERE id = ?`)
    .get(id) as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, links: parseLinks(row.links) } as KnowledgeDoc;
}

export async function updateKnowledgeDoc(
  id: string,
  patch: { links?: Array<{ url: string; title: string }> }
): Promise<KnowledgeDoc | null> {
  if (patch.links !== undefined) {
    await db
      .prepare(`UPDATE knowledge_docs SET links = @links WHERE id = @id`)
      .run({ id, links: JSON.stringify(patch.links) });
  }
  return getKnowledgeDoc(id);
}

export async function deleteKnowledgeDoc(id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM knowledge_docs WHERE id = ?").run(id);
  return res.changes > 0;
}

export async function countKnowledgeDocs(): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM knowledge_docs").get();
  return (row?.n as number) ?? 0;
}
