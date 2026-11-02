import { db } from "./db";
import type { Etichetta } from "./types";

// ===========================================================================
// ETICHETTE PERSONALIZZATE DEL CALENDARIO.
//
// Due tabelle: `etichette` (anagrafica nome+colore) e `attivita_etichette`
// (assegnazione N:N). Le scritture sulla pivot qui NON passano da
// lib/attivita.ts perche' la sincronizzazione Google Calendar non le
// riguarda: Google non ha il concetto di etichetta, e l'assenza di una
// etichetta non cambia l'evento sincronizzato.
// ===========================================================================

const RE_HEX = /^#[0-9A-Fa-f]{6}$/;

export function validaColore(colore: string): boolean {
  return RE_HEX.test(colore);
}

const ROW_FIELDS = "id, nome, colore, data_creazione";

export async function listEtichette(): Promise<Etichetta[]> {
  const rows = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM etichette ORDER BY nome ASC`)
    .all();
  return rows as unknown as Etichetta[];
}

export async function getEtichetta(id: string): Promise<Etichetta | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM etichette WHERE id = ?`)
    .get(id);
  return (row as unknown as Etichetta | undefined) ?? null;
}

export async function getEtichettePerAttivita(
  attivitaIds: string[]
): Promise<Map<string, Etichetta[]>> {
  const mappa = new Map<string, Etichetta[]>();
  if (attivitaIds.length === 0) return mappa;

  // Un solo round-trip: il DB e' remoto e ogni execute costa una rete.
  // SQLite non ha un limite pratico di parametri qui (massimo 999 variabili
  // per statement): si raggruppa a 500 id per stare larghi. L'adapter db
  // accetta l'array come SINGOLO argomento (.all(chunk)), non spreadato.
  const CHUNK = 500;
  for (let i = 0; i < attivitaIds.length; i += CHUNK) {
    const chunk = attivitaIds.slice(i, i + CHUNK);
    const segnaposto = chunk.map(() => "?").join(", ");
    const rows = await db
      .prepare(
        `SELECT ae.attivita_id, e.id, e.nome, e.colore, e.data_creazione
         FROM attivita_etichette ae
         JOIN etichette e ON e.id = ae.etichetta_id
         WHERE ae.attivita_id IN (${segnaposto})
         ORDER BY e.nome ASC`
      )
      .all(chunk);
    for (const r of rows as unknown as ({ attivita_id: string } & Etichetta)[]) {
      const lista = mappa.get(r.attivita_id) ?? [];
      lista.push({
        id: r.id,
        nome: r.nome,
        colore: r.colore,
        data_creazione: r.data_creazione,
      });
      mappa.set(r.attivita_id, lista);
    }
  }
  return mappa;
}

export async function createEtichetta(
  nome: string,
  colore: string
): Promise<Etichetta> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO etichette (id, nome, colore, data_creazione)
       VALUES (@id, @nome, @colore, @data_creazione)`
    )
    .run({
      id,
      nome,
      colore,
      data_creazione: new Date().toISOString(),
    });
  const row = await getEtichetta(id);
  if (!row) throw new Error("Creazione etichetta non riuscita.");
  return row;
}

export async function updateEtichetta(
  id: string,
  patch: { nome?: string; colore?: string }
): Promise<Etichetta | null> {
  const sets: string[] = [];
  const params: Record<string, string> = { id };
  if (patch.nome !== undefined) {
    sets.push("nome = @nome");
    params.nome = patch.nome;
  }
  if (patch.colore !== undefined) {
    sets.push("colore = @colore");
    params.colore = patch.colore;
  }
  if (sets.length === 0) return getEtichetta(id);

  await db.prepare(`UPDATE etichette SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getEtichetta(id);
}

// Elimina l'etichetta e TUTTE le sue assegnazioni (la pivot non ha cascata
// applicata dal DB, quindi si pulisce qui).
export async function deleteEtichetta(id: string): Promise<boolean> {
  const risultati = await db.batch([
    { sql: "DELETE FROM attivita_etichette WHERE etichetta_id = ?", params: [id] },
    { sql: "DELETE FROM etichette WHERE id = ?", params: [id] },
  ]);
  // La seconda riga del batch e' la DELETE sull'anagrafica.
  return (risultati[1]?.changes ?? 0) > 0;
}

// Sostituisce l'intero set di etichette di un'attivita': DELETE + INSERT in
// batch (una richiesta sola). Id non validati qui: le rotte API verificano
// l'esistenza prima di chiamare.
export async function setEtichetteAttivita(
  attivitaId: string,
  etichettaIds: string[]
): Promise<void> {
  // Dedup conservando l'ordine: la pivot ha chiave primaria composta.
  const unici = Array.from(new Set(etichettaIds));
  const statements = [
    { sql: "DELETE FROM attivita_etichette WHERE attivita_id = ?", params: [attivitaId] },
    ...unici.map((eid) => ({
      sql: "INSERT INTO attivita_etichette (attivita_id, etichetta_id) VALUES (?, ?)",
      params: [attivitaId, eid],
    })),
  ];
  await db.batch(statements);
}

export async function esistonoEtichette(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const segnaposto = ids.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT COUNT(*) AS n FROM etichette WHERE id IN (${segnaposto})`)
    .all(ids);
  const n = (rows[0] as { n?: number } | undefined)?.n ?? 0;
  return n === ids.length;
}
