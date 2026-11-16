import { config } from "dotenv";
import { resolve } from "path";
import { startImapWorker } from "../lib/imap-worker";
import { startGmailWorker } from "../lib/gmail-worker";

// Carica variabili d'ambiente da .env.local
config({ path: resolve(__dirname, "../.env.local") });

// Anche .env come fallback
config({ path: resolve(__dirname, "../.env") });

console.log("=================================");
console.log("  Email Worker (IMAP + Gmail) - Avvio");
console.log("=================================");
console.log(`  Caselle DB: ${process.env.TURSO_DATABASE_URL ? "attive (lettura a ogni poll)" : "TURSO_DATABASE_URL assente"}`);
console.log(`  Casella env (fallback): ${process.env.IMAP_HOST ?? "(non configurata)"}`);
console.log(`  Poll interval IMAP: ${process.env.IMAP_POLL_INTERVAL_MS ?? "120000"}ms`);
console.log(`  Poll interval Gmail: ${process.env.GMAIL_POLL_INTERVAL_MS ?? "300000"}ms`);
console.log(`  Webhook: ${process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email"}`);
console.log(`  Webhook secret: ${process.env.WEBHOOK_SECRET ? "configurato" : "(non configurato - il server prod rifiuterà le richieste)"}`);
console.log(`  ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? "configurata" : "(assente - le caselle DB non saranno decifrabili)"}`);
console.log(`  OAuth Gmail: ${process.env.GOOGLE_GMAIL_CLIENT_ID ? "configurato" : "(non configurato - il collegamento nuovi account non funzionerà)"}`);
console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY ? "configurato" : "(non configurato - fallback regex)"}`);
console.log("=================================");

// I due worker girano nello stesso processo con i rispettivi setInterval:
// le caselle IMAP restano in carico a imap-worker, quelle Gmail (OAuth) a
// gmail-worker. Un crash gestito dell'uno non tocca l'altro (pollOnce
// cattura sempre i propri errori).
Promise.all([
  startImapWorker(),
  startGmailWorker(),
]).catch((err) => {
  console.error("Errore fatale nell'avvio dei worker email:", err);
  process.exit(1);
});
