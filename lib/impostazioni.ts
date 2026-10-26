import { db } from "./db";
import "server-only";

// Store chiave/valore generico per la configurazione modificabile a runtime.
//
// Non contiene SEGRETI: le credenziali Google stanno in variabili d'ambiente
// (il DB e' Turso, remoto e condiviso). Qui solo dati non sensibili.

function nowISO(): string {
  return new Date().toISOString();
}

export async function leggiImpostazione(chiave: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT valore FROM impostazioni WHERE chiave = ?")
    .get(chiave);
  const valore = row?.valore;
  return typeof valore === "string" ? valore : null;
}

export async function leggiImpostazioni(
  chiavi: string[]
): Promise<Record<string, string>> {
  if (chiavi.length === 0) return {};
  // Una query sola con IN: i segnaposto sono generati dal numero di chiavi,
  // cosi' nessun valore finisce mai dentro l'SQL.
  const segnaposto = chiavi.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT chiave, valore FROM impostazioni WHERE chiave IN (${segnaposto})`)
    .all(chiavi);

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (typeof r.chiave === "string" && typeof r.valore === "string") {
      out[r.chiave] = r.valore;
    }
  }
  return out;
}

// Upsert: SQLite supporta ON CONFLICT ... DO UPDATE, quindi non serve
// leggere prima. La tabella e' piccola e non transazionale (come il resto).
export async function scriviImpostazione(
  chiave: string,
  valore: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO impostazioni (chiave, valore, data_aggiornamento)
       VALUES (@chiave, @valore, @data_aggiornamento)
       ON CONFLICT (chiave) DO UPDATE SET
         valore = @valore,
         data_aggiornamento = @data_aggiornamento`
    )
    .run({ chiave, valore, data_aggiornamento: nowISO() });
}

export async function scriviImpostazioni(
  valori: Record<string, string>
): Promise<void> {
  const chiavi = Object.keys(valori);
  if (chiavi.length === 0) return;
  if (chiavi.length === 1) {
    await scriviImpostazione(chiavi[0], valori[chiavi[0]]);
    return;
  }

  // Un solo round-trip per tutte le chiavi: prima erano N UPSERT in serie.
  // Il batch e' atomico (transaction) se il server lo supporta, altrimenti
  // resta una sequenza di statement in una sola richiesta.
  const ts = nowISO();
  await db.batch(
    chiavi.map((chiave) => ({
      sql: `INSERT INTO impostazioni (chiave, valore, data_aggiornamento)
            VALUES (:chiave, :valore, :data_aggiornamento)
            ON CONFLICT (chiave) DO UPDATE SET
              valore = :valore,
              data_aggiornamento = :data_aggiornamento`,
      params: { chiave, valore: valori[chiave], data_aggiornamento: ts },
    }))
  );
}
