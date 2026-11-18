import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { mkdir, writeFile } from "fs/promises";

// Backup del database Turso di produzione PRIMA di una migrazione.
//
// Produce un file SQL autonomo (schema + dati) in backups/, ripristinabile con
// il Turso CLI o con qualunque client SQLite:
//
//   turso db shell <database> < backups/<file>.sql
//
// Lo script e' di sola lettura: non scrive mai sul database. Va eseguito da una
// macchina che ha accesso a TURSO_DATABASE_URL e TURSO_AUTH_TOKEN (le stesse
// variabili usate dall'app). Se quelle variabili non sono presenti, esce senza
// creare file.

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const TABELLE_DI_SISTEMA = new Set(["sqlite_sequence", "sqlite_stat1", "sqlite_stat4"]);

type Valore = string | number | bigint | boolean | ArrayBuffer | null;

function ident(nome: string): string {
  return '"' + nome.replace(/"/g, '""') + '"';
}

function letterale(valore: Valore): string {
  if (valore === null || valore === undefined) return "NULL";
  if (typeof valore === "bigint") return valore.toString();
  if (typeof valore === "number") {
    if (Number.isNaN(valore) || !Number.isFinite(valore)) return "NULL";
    return valore.toString();
  }
  if (typeof valore === "boolean") return valore ? "1" : "0";
  if (valore instanceof ArrayBuffer) {
    const hex = Buffer.from(valore).toString("hex").toUpperCase();
    return `X'${hex}'`;
  }
  return "'" + String(valore).replace(/'/g, "''") + "'";
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "";
  if (!url) {
    console.error("TURSO_DATABASE_URL mancante: nessun backup eseguito.");
    console.error("Imposta le variabili in .env.local o .env e riprova.");
    process.exit(1);
  }

  const { getTursoClient } = await import("../lib/turso-client");
  const db = getTursoClient();

  console.log("Backup Turso");
  console.log("  Database: " + url.replace(/\/\/[^/]+/, "//***"));
  console.log("");

  const oggetti = await db.execute(
    "SELECT type, name FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name"
  );

  const tabelle = oggetti.rows
    .filter((r) => r.type === "table")
    .map((r) => String(r.name))
    .filter((n) => !TABELLE_DI_SISTEMA.has(n));

  const righe: string[] = [];
  righe.push("-- Backup Turso del " + new Date().toISOString());
  righe.push("-- Ripristino: turso db shell <database> < " + "questo-file.sql");
  righe.push("PRAGMA foreign_keys=OFF;");
  righe.push("BEGIN TRANSACTION;");
  righe.push("");

  let totaleRighe = 0;
  const riepilogo: Array<{ tabella: string; righe: number }> = [];

  for (const tabella of tabelle) {
    const schema = await db.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
      [tabella]
    );
    const sql = schema.rows[0]?.sql;
    if (typeof sql === "string" && sql.length > 0) {
      righe.push(sql + ";");
    }
  }

  righe.push("");

  for (const tabella of tabelle) {
    const risultato = await db.execute("SELECT * FROM " + ident(tabella));
    const colonne = risultato.columns;
    const conteggio = risultato.rows.length;
    riepilogo.push({ tabella, righe: conteggio });
    totaleRighe += conteggio;
    if (conteggio === 0) continue;

    const listaColonne = colonne.map(ident).join(", ");
    for (const riga of risultato.rows) {
      const valori = colonne.map((c) => letterale(riga[c] as Valore)).join(", ");
      righe.push(`INSERT INTO ${ident(tabella)} (${listaColonne}) VALUES (${valori});`);
    }
  }

  righe.push("");
  righe.push("COMMIT;");

  const cartella = resolve(process.cwd(), "backups");
  await mkdir(cartella, { recursive: true });
  const nomeFile = `turso-${timestamp()}.sql`;
  const percorso = resolve(cartella, nomeFile);
  await writeFile(percorso, righe.join("\n") + "\n", "utf8");

  for (const r of riepilogo) {
    console.log("  " + r.tabella.padEnd(32) + String(r.righe).padStart(7) + " righe");
  }
  console.log("");
  console.log("Tabelle: " + tabelle.length + " · righe: " + totaleRighe);
  console.log("Salvato in: " + percorso);
}

main().catch((err) => {
  console.error("Backup fallito:", err instanceof Error ? err.message : err);
  process.exit(1);
});
