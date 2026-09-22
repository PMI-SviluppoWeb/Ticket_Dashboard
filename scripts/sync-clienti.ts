import "dotenv/config";
import { syncClienti, printReport } from "../lib/sync/sync-clienti";

async function main() {
  console.log("🚀 Avvio sincronizzazione anagrafiche clienti...\n");

  const result = await syncClienti();
  printReport(result);

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Errore fatale:", err);
  process.exit(1);
});
