import { syncConfig } from "./config";
import { syncDb } from "./db";
import { fetchClientiFromSqlServer, closeSqlServer } from "./sources/sql-server-source";
import { fetchClientiFromApi } from "./sources/api-source";

interface SyncResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Mappa i campi grezzi dalla sorgente (SQL Server o API) al formato Turso.
 */
function mapCliente(raw: Record<string, unknown>, id: string): Record<string, unknown> {
  const { fieldMap } = syncConfig.sqlServer;

  const mapped: Record<string, unknown> = {
    id,
    attivo: 1,
    data_creazione: new Date().toISOString(),
  };

  for (const [tursoField, sourceField] of Object.entries(fieldMap)) {
    if (sourceField && raw[sourceField] !== undefined && raw[sourceField] !== null) {
      mapped[tursoField] = String(raw[sourceField]).trim() || null;
    } else {
      mapped[tursoField] = null;
    }
  }

  return mapped;
}

/**
 * Verifica se un cliente esiste già in Turso.
 */
async function clienteExists(id: string): Promise<boolean> {
  const row = await syncDb.prepare("SELECT id FROM clienti WHERE id = :id").get({ id });
  return row !== undefined;
}

/**
 * Inserisce un nuovo cliente in Turso.
 */
async function insertCliente(cliente: Record<string, unknown>): Promise<void> {
  const fields = Object.keys(cliente);
  const placeholders = fields.map((f) => `:${f}`);
  const sql = `INSERT INTO clienti (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`;
  await syncDb.prepare(sql).run(cliente);
}

/**
 * Aggiorna un cliente esistente in Turso.
 */
async function updateCliente(id: string, cliente: Record<string, unknown>): Promise<void> {
  const fields = Object.keys(cliente).filter((f) => f !== "id");
  const setClauses = fields.map((f) => `${f} = :${f}`);
  const sql = `UPDATE clienti SET ${setClauses.join(", ")} WHERE id = :id`;
  await syncDb.prepare(sql).run({ ...cliente, id });
}

/**
 * Funzione principale di sincronizzazione.
 */
export async function syncClienti(): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 1. Recupera i dati dalla sorgente
    console.log(`📥 Recupero clienti da ${syncConfig.source}...`);
    let rawClienti: Record<string, unknown>[];

    if (syncConfig.source === "sql-server") {
      rawClienti = await fetchClientiFromSqlServer();
    } else {
      rawClienti = await fetchClientiFromApi();
    }

    result.total = rawClienti.length;
    console.log(`   Trovati ${result.total} clienti`);

    // 2. Assicura che il DB Turso sia inizializzato
    await syncDb.ping();

    // 3. Sincronizza ogni cliente
    const { idField } = syncConfig.source === "sql-server"
      ? syncConfig.sqlServer
      : syncConfig.sqlServer; // fallback

    for (const raw of rawClienti) {
      const rawId = raw[idField];
      if (!rawId) {
        result.errors.push(`Cliente senza ID (${idField}): ${JSON.stringify(raw)}`);
        continue;
      }

      const id = String(rawId).trim();
      const cliente = mapCliente(raw, id);

      try {
        const exists = await clienteExists(id);
        if (exists) {
          await updateCliente(id, cliente);
          result.updated++;
        } else {
          await insertCliente(cliente);
          result.inserted++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Errore cliente ${id}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Errore fatale: ${msg}`);
  } finally {
    // Chiudi connessione SQL Server
    if (syncConfig.source === "sql-server") {
      await closeSqlServer();
    }
  }

  return result;
}

/**
 * Stampa il report di sincronizzazione.
 */
export function printReport(result: SyncResult): void {
  console.log("\n" + "=".repeat(50));
  console.log("  REPORT SINCRONIZZAZIONE ANAGRAFICHE");
  console.log("=".repeat(50));
  console.log(`  Totale clienti trovati:  ${result.total}`);
  console.log(`  Nuovi inseriti:          ${result.inserted}`);
  console.log(`  Aggiornati:              ${result.updated}`);
  console.log(`  Saltati (senza ID):      ${result.skipped}`);
  console.log(`  Errori:                  ${result.errors.length}`);
  console.log("=".repeat(50));

  if (result.errors.length > 0) {
    console.log("\n⚠️  Errori:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log("\n✅ Sincronizzazione completata!\n");
}
