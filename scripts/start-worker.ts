import { config } from "dotenv";
import { resolve } from "path";
import { startImapWorker } from "../lib/imap-worker";

// Carica variabili d'ambiente da .env.local
config({ path: resolve(__dirname, "../.env.local") });

// Anche .env come fallback
config({ path: resolve(__dirname, "../.env") });

console.log("=================================");
console.log("  IMAP Email Worker - Avvio");
console.log("=================================");
console.log(`  Caselle DB: ${process.env.TURSO_DATABASE_URL ? "attive (lettura a ogni poll)" : "TURSO_DATABASE_URL assente"}`);
console.log(`  Casella env (fallback): ${process.env.IMAP_HOST ?? "(non configurata)"}`);
console.log(`  Poll interval: ${process.env.IMAP_POLL_INTERVAL_MS ?? "120000"}ms`);
console.log(`  Webhook: ${process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email"}`);
console.log(`  Webhook secret: ${process.env.WEBHOOK_SECRET ? "configurato" : "(non configurato - il server prod rifiuterà le richieste)"}`);
console.log(`  ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? "configurata" : "(assente - le caselle DB non saranno decifrabili)"}`);
console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY ? "configurato" : "(non configurato - fallback regex)"}`);
console.log("=================================");

startImapWorker().catch((err) => {
  console.error("Errore fatale nell'avvio del worker IMAP:", err);
  process.exit(1);
});
