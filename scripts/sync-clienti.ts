import dotenv from "dotenv";
import path from "path";

// Carica .env.local PRIMA di importare i moduli che leggono le env
const loaded = dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
console.log("📦 dotenv caricato:", loaded ? "successo" : "nessun file .env trovato");
console.log("   Risultato caricamento:", loaded?.error ? loaded.error.message : "ok");
console.log("   TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "IMPOSTATA" : "MANCANTE");
console.log("   TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "IMPOSTATA" : "MANCANTE");
console.log("   ARCA_API_KEY:", process.env.ARCA_API_KEY ? "IMPOSTATA" : "MANCANTE");
console.log("");

async function main() {
  // Import dinamico: solo DOPO dotenv.config(), così i moduli vedono le env
  const { syncConfig } = await import("../lib/sync/config");
  console.log("🔍 Config source:", syncConfig.source);
  console.log("🔍 Config api.idField:", syncConfig.api?.idField);
  console.log("🔍 Config sqlServer.idField:", syncConfig.sqlServer?.idField);
  console.log("🔍 Config api.baseUrl:", syncConfig.api?.baseUrl);
  console.log("");

  const { syncClienti, printReport } = await import("../lib/sync/sync-clienti");

  console.log("🚀 Avvio sincronizzazione anagrafiche clienti...\n");

  const result = await syncClienti();
  printReport(result);

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Errore fatale:", err);
  process.exit(1);
});
