import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email";
const POLL_INTERVAL_MS = parseInt(process.env.IMAP_POLL_INTERVAL_MS ?? "120000", 10);
// Segreto condiviso con l'app: senza questo header la rotta /api/hooks/email
// rifiuta le richieste. Deve essere IDENTICO alla variabile WEBHOOK_SECRET in .env.
// Lettura lazy: in start-worker.ts le import girano PRIMA di dotenv.config(),
// quindi una variabile catturata a livello di modulo resterebbe vuota.
function webhookHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) headers["x-webhook-secret"] = secret;
  return headers;
}

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

function getImapConfig(): ImapConfig {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Variabili IMAP mancanti. Configura IMAP_HOST, IMAP_USER, IMAP_PASS in .env.local"
    );
  }

  return {
    host,
    port: parseInt(process.env.IMAP_PORT ?? "993", 10),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user, pass },
  };
}

async function processEmail(raw: Uint8Array): Promise<void> {
  const parsed = await PostalMime.parse(raw);

  const fromAddress = parsed.from?.address ?? "";
  const fromName = parsed.from?.name ?? undefined;
  const subject = parsed.subject ?? "(nessun oggetto)";
  const body = parsed.text ?? "";
  const bodyHtml = parsed.html ?? undefined;
  const messageId = parsed.messageId ?? `<${Date.now()}@generated>`;

  // Filtra auto-reply e bounce
  const autoReplyHeaders = [
    "auto-reply", "auto_response", "donotreply", "noreply",
    "no-reply", "mailer-daemon", "postmaster",
  ];
  if (autoReplyHeaders.some((h) => fromAddress.toLowerCase().includes(h))) {
    console.log(`[IMAP] Ignorato auto-reply da: ${fromAddress}`);
    return;
  }

  const subjectLower = subject.toLowerCase();
  if (subjectLower.startsWith("re:") || subjectLower.startsWith("fw:")) {
    // Le reply/fw vengono comunque processate (potrebbero essere reply a ticket esistenti)
  }

  console.log(`[IMAP] Email ricevuta: "${subject}" da ${fromAddress}`);

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: webhookHeaders(),
    body: JSON.stringify({
      messageId,
      from: fromAddress,
      fromName,
      subject,
      body,
      bodyHtml,
      date: parsed.date ?? undefined,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook error ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(`[IMAP] Ticket creato: ${result.ticket ?? "N/A"}`);
}

let isPolling = false;
let highWaterMark: number = 0;

async function pollOnce(client: ImapFlow): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Primo poll: imposta high water mark all'UID piu' alto esistente
      // (ignora le email gia' presenti nella casella)
      if (highWaterMark === 0) {
        const allMessages = await client.search({ all: true });
        if (allMessages !== false && allMessages.length > 0) {
          highWaterMark = Math.max(...allMessages);
          console.log(`[IMAP] High water mark impostato a UID ${highWaterMark}. Solo le email successive verranno processate.`);
        }
        return;
      }

      // Cerca email non lette con UID > highWaterMark
      const searchResult = await client.search({ seen: false });
      const unseen = searchResult === false ? [] : searchResult;
      const newUids = unseen.filter((uid) => uid > highWaterMark);

      if (newUids.length === 0) {
        return; // Silenzioso se non ci sono nuove email
      }

      console.log(`[IMAP] Trovate ${newUids.length} email nuove da processare.`);

      for (const uid of newUids) {
        try {
          const msg = await client.fetchOne(uid, { source: true, uid: true });
          if (msg && msg.source) {
            await processEmail(msg.source);
          }
          // Segna come letta dopo l'elaborazione riuscita
          await client.messageFlagsAdd(uid, ["\\Seen"]);
          // Aggiorna high water mark
          if (uid > highWaterMark) {
            highWaterMark = uid;
          }
        } catch (err) {
          console.error(`[IMAP] Errore elaborazione UID ${uid}:`, err);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[IMAP] Errore durante il poll:", err);
  } finally {
    isPolling = false;
  }
}

export async function startImapWorker(): Promise<void> {
  const config = getImapConfig();
  if (!process.env.WEBHOOK_SECRET) {
    console.warn(
      "[IMAP] WEBHOOK_SECRET non impostata: in produzione il server rifiuterà le richieste webhook."
    );
  }
  console.log(`[IMAP] Connessione a ${config.host}:${config.port}...`);

  let client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();
  console.log("[IMAP] Connesso. Inizio polling ogni", POLL_INTERVAL_MS / 1000, "secondi.");

  // Poll iniziale
  await pollOnce(client);

  // Poll periodico
  const interval = setInterval(async () => {
    try {
      await pollOnce(client);
    } catch (err) {
      console.error("[IMAP] Errore nel poll periodico:", err);
      // Tentativo di riconnessione
      try {
        await client.logout();
      } catch {
        // Ignora errori di logout
      }
      try {
        const newClient = new ImapFlow({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.auth,
          logger: false,
          tls: { rejectUnauthorized: false },
        });
        await newClient.connect();
        client = newClient;
        console.log("[IMAP] Riconnesso con successo.");
      } catch (reconnectErr) {
        console.error("[IMAP] Riconnessione fallita:", reconnectErr);
      }
    }
  }, POLL_INTERVAL_MS);

  // Gestione graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[IMAP] Shutdown in corso...");
    clearInterval(interval);
    await client.logout();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("[IMAP] Shutdown in corso...");
    clearInterval(interval);
    await client.logout();
    process.exit(0);
  });
}
