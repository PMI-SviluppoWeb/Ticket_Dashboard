import { startImapWorker } from "../lib/imap-worker";

console.log("=================================");
console.log("  IMAP Email Worker (Docker)");
console.log("=================================");
console.log(`  Host: ${process.env.IMAP_HOST ?? "(non configurato)"}`);
console.log(`  User: ${process.env.IMAP_USER ?? "(non configurato)"}`);
console.log(`  Port: ${process.env.IMAP_PORT ?? "993"}`);
console.log(`  Poll interval: ${process.env.IMAP_POLL_INTERVAL_MS ?? "300000"}ms`);
console.log(`  Webhook: ${process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email"}`);
console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY ? "configurato" : "(non configurato - fallback regex)"}`);
console.log("=================================");

startImapWorker().catch((err) => {
  console.error("Errore fatale nell'avvio del worker IMAP:", err);
  process.exit(1);
});
