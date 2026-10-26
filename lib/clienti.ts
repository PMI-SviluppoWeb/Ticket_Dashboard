import { db } from "./db";
import type { Cliente } from "./types";

const ROW_FIELDS = `
  id, ragione_sociale, nome_contatto, email, telefono, indirizzo,
  citta, provincia, cap, partita_iva, note, attivo, data_creazione
`;

// Gli id cliente sono eterogenei: le righe seed sono 'CLI-001'...'CLI-005',
// quelle sincronizzate da Arca sono stringhe numeriche. Vanno sempre trattati
// come TEXT opaco, mai parsati.

export async function listClienti(q?: string, limit = 50): Promise<Cliente[]> {
  const where: string[] = ["attivo = 1"];
  const params: Record<string, string | number> = { limit };

  const search = q?.trim();
  if (search) {
    where.push("(ragione_sociale LIKE @q OR partita_iva LIKE @q OR citta LIKE @q)");
    params.q = `%${search}%`;
  }

  const rows = await db
    .prepare(
      `SELECT ${ROW_FIELDS} FROM clienti
       WHERE ${where.join(" AND ")}
       ORDER BY ragione_sociale ASC LIMIT @limit`
    )
    .all(params);
  return rows as unknown as Cliente[];
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM clienti WHERE id = ?`)
    .get(id);
  return (row as unknown as Cliente | undefined) ?? null;
}

export async function countClienti(): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM clienti WHERE attivo = 1").get();
  return (row?.n as number) ?? 0;
}
