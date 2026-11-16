import { startImapWorker } from "../lib/imap-worker";
import { startGmailWorker } from "../lib/gmail-worker";

console.log("=================================");
console.log("  Email Worker (IMAP + Gmail) - Docker");
console.log("=================================");
console.log(`  Caselle DB: ${process.env.TURSO_DATABASE_URL ? "attive (lettura a ogni poll)" : "TURSO_DATABASE_URL assente"}`);
console.log(`  Casella env (fallback): ${process.env.IMAP_HOST ?? "(non configurata)"}`);
console.log(`  Poll interval IMAP: ${process.env.IMAP_POLL_INTERVAL_MS ?? "300000"}ms`);
console.log(`  Poll interval Gmail: ${process.env.GMAIL_POLL_INTERVAL_MS ?? "300000"}ms`);
console.log(`  Webhook: ${process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email"}`);
console.log(`  ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? "configurata" : "(assente - le caselle DB non saranno decifrabili)"}`);
console.log(`  OAuth Gmail: ${process.env.GOOGLE_GMAIL_CLIENT_ID ? "configurato" : "(non configurato - il collegamento nuovi account non funzionerà)"}`);
console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY ? "configurato" : "(non configurato - fallback regex)"}`);
console.log("=================================");

// Vedi scripts/start-worker.ts: stesso processo, due loop indipendenti.
Promise.all([
  startImapWorker(),
  startGmailWorker(),
]).catch((err) => {
  console.error("Errore fatale nell'avvio dei worker email:", err);
  process.exit(1);
});
