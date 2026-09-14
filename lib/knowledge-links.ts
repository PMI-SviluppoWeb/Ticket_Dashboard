import { db } from "./db";
import type { KnowledgeLinkItem, KnowledgeLinkInput } from "./types";

function now(): string {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function listKnowledgeLinks(q?: string, categoria?: string): Promise<KnowledgeLinkItem[]> {
  const where: string[] = [];
  const params: Record<string, string> = {};
  const search = q?.trim();
  if (search) {
    where.push("(titolo LIKE @q OR url LIKE @q OR descrizione LIKE @q)");
    params.q = `%${search}%`;
  }
  if (categoria && categoria !== "tutte") {
    where.push("categoria = @categoria");
    params.categoria = categoria;
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT id, titolo, url, descrizione, categoria, data_creazione
       FROM knowledge_links ${whereSql}
       ORDER BY data_creazione DESC, rowid DESC`
    )
    .all(params);
  return rows as unknown as KnowledgeLinkItem[];
}

export async function insertKnowledgeLink(input: KnowledgeLinkInput): Promise<KnowledgeLinkItem> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO knowledge_links (id, titolo, url, descrizione, categoria, data_creazione)
       VALUES (@id, @titolo, @url, @descrizione, @categoria, @data_creazione)`
    )
    .run({
      id,
      titolo: input.titolo,
      url: input.url,
      descrizione: input.descrizione ?? null,
      categoria: input.categoria ?? "generale",
      data_creazione: now(),
    });
  const row = await db
    .prepare(
      `SELECT id, titolo, url, descrizione, categoria, data_creazione
       FROM knowledge_links WHERE id = ?`
    )
    .get(id);
  return row as unknown as KnowledgeLinkItem;
}

export async function updateKnowledgeLink(
  id: string,
  patch: Partial<KnowledgeLinkInput>
): Promise<KnowledgeLinkItem | null> {
  const sets: string[] = [];
  const params: Record<string, string | null> = { id };
  if (patch.titolo !== undefined) { sets.push("titolo = @titolo"); params.titolo = patch.titolo; }
  if (patch.url !== undefined) { sets.push("url = @url"); params.url = patch.url; }
  if (patch.descrizione !== undefined) { sets.push("descrizione = @descrizione"); params.descrizione = patch.descrizione ?? null; }
  if (patch.categoria !== undefined) { sets.push("categoria = @categoria"); params.categoria = patch.categoria; }
  if (sets.length === 0) return getKnowledgeLink(id);
  await db.prepare(`UPDATE knowledge_links SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getKnowledgeLink(id);
}

export async function getKnowledgeLink(id: string): Promise<KnowledgeLinkItem | null> {
  const row = await db
    .prepare(
      `SELECT id, titolo, url, descrizione, categoria, data_creazione
       FROM knowledge_links WHERE id = ?`
    )
    .get(id);
  return (row as KnowledgeLinkItem | undefined) ?? null;
}

export async function deleteKnowledgeLink(id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM knowledge_links WHERE id = ?").run(id);
  return res.changes > 0;
}

export async function countKnowledgeLinks(): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM knowledge_links").get();
  return (row?.n as number) ?? 0;
}
