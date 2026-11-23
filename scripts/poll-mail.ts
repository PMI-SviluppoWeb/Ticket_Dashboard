import { config } from "dotenv";
import { resolve } from "path";

// Carica l'ambiente PRIMA di importare i worker: i moduli leggono le env in
// modo lazy, ma le connessioni usano i valori al momento della chiamata.
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

async function main() {
  const { pollOnce: pollImap } = await import("../lib/imap-worker");
  const { pollOnce: pollGmail } = await import("../lib/gmail-worker");

  console.log("[poll-mail] Controllo IMAP...");
  await pollImap();
  console.log("[poll-mail] Controllo Gmail...");
  await pollGmail();
  console.log("[poll-mail] Controllo completato.");
  // Le connessioni IMAP restano aperte di proposito nel worker; qui il
  // processo e' one-shot e deve uscire subito.
  process.exit(0);
}

main().catch((err) => {
  console.error("[poll-mail] Errore:", err);
  process.exit(1);
});
