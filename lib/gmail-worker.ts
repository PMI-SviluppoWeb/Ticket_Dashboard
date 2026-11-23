import { caselleGmailPerWorker, type CasellaGmailWorker } from "./caselle-worker";
import {
  ErroreGmail,
  listaNonLette,
  ottieniAccessToken,
  scaricaMessaggio,
  segnaLetta,
} from "./gmail-oauth";

// Worker di polling Gmail via OAuth 2.0 + Gmail API (affianca l'IMAP worker:
// le caselle IMAP restano pollate da lib/imap-worker.ts, quelle Gmail qui).
//
// Stesso flusso di consegna: ogni email scaricata viene POSTata al webhook
// /api/hooks/email (dedup, classificazione AI, creazione ticket, autorisposta
// — tutta la pipeline esistente), poi marcata letta via Gmail API
// (removeLabelIds UNREAD). Una email il cui POST fallisce resta non letta e
// viene riprovata al ciclo successivo; il dedup su email_inbox.message_id
// rende inin un eventuale doppio invio.
//
// Lettura lazy dell'env: come in lib/imap-worker.ts, in start-worker.ts le
// import girano PRIMA di dotenv.config(), quindi le variabili vanno lette
// dentro le funzioni, non a livello di modulo.

function pollIntervalMs(): number {
  const n = parseInt(process.env.GMAIL_POLL_INTERVAL_MS ?? "300000", 10);
  // Minimo difensivo: sotto i 5s si rischia di esaurire la quota Gmail API
  // (users.messages.list = 10 unita' per chiamata) e di martellare Turso.
  return Number.isFinite(n) && n >= 5000 ? n : 300000;
}

function webhookUrl(): string {
  return process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email";
}

// Segreto condiviso con l'app (stesso identico header dell'IMAP worker).
function webhookHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) headers["x-webhook-secret"] = secret;
  return headers;
}

// Backoff per caselle con errori ripetuti (token revocato, quota, rete):
// delay = min(15s * 2^n, 5 min), azzerato alla prima riuscita — stesso
// schema dell'IMAP worker per non martellare Google a ogni ciclo.
const tentativiFalliti = new Map<string, number>();
const prossimoTentativo = new Map<string, number>();
let isPolling = false;

function backoffMs(tentativi: number): number {
  return Math.min(15_000 * 2 ** tentativi, 300_000);
}

// Filtra auto-reply/bounce: identico alla lista dell'IMAP worker.
function eAutoReply(fromAddress: string): boolean {
  const autoReplyHeaders = [
    "auto-reply", "auto_response", "donotreply", "noreply",
    "no-reply", "mailer-daemon", "postmaster",
  ];
  return autoReplyHeaders.some((h) => fromAddress.toLowerCase().includes(h));
}

async function processEmail(
  accessToken: string,
  gmailMessageId: string,
  casella: CasellaGmailWorker
): Promise<void> {
  const messaggio = await scaricaMessaggio(accessToken, gmailMessageId);
  if (!messaggio) return; // Cancellato tra list e fetch

  const fromAddress = messaggio.from;
  if (!fromAddress) {
    // Mittente non risolvibile: si salta senza creare un ticket vuoto.
    console.log(`[gmail] Ignorato messaggio senza mittente da ${casella.indirizzo}.`);
    await segnaLetta(accessToken, gmailMessageId);
    return;
  }
  if (eAutoReply(fromAddress)) {
    console.log(`[gmail] Ignorato auto-reply da: ${fromAddress}`);
    await segnaLetta(accessToken, gmailMessageId);
    return;
  }

  console.log(`[gmail] Email ricevuta in ${casella.indirizzo}: "${messaggio.subject}" da ${fromAddress}`);

  const response = await fetch(webhookUrl(), {
    method: "POST",
    headers: webhookHeaders(),
    body: JSON.stringify({
      messageId: messaggio.messageId,
      from: fromAddress,
      fromName: messaggio.fromName,
      subject: messaggio.subject,
      body: messaggio.body,
      bodyHtml: messaggio.bodyHtml,
      date: messaggio.date ? messaggio.date.toISOString() : undefined,
      // Stesso payload dell'IMAP worker: il webhook registra la casella in
      // email_inbox e usa lo stesso account per l'autorisposta.
      casellaId: casella.id,
      headers: messaggio.headers,
      inReplyTo: messaggio.inReplyTo,
      references: messaggio.references,
      attachments: messaggio.attachments,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    // Lancia: la email RESTA non letta e viene riprovata al ciclo successivo.
    throw new Error(`Webhook error ${response.status}: ${text}`);
  }

  const result = await response.json();
  // Solo a POST riuscito si rimuove UNREAD: mai marcare prima, altrimenti
  // un guasto del webhook perderebbe il messaggio.
  await segnaLetta(accessToken, gmailMessageId);
  console.log(
    `[gmail] Esito: ${result.ticket ?? result.esito ?? result.skipped ?? "N/A"}`
  );
}

async function pollCasella(casella: CasellaGmailWorker): Promise<void> {
  const accessToken = await ottieniAccessToken(casella.refreshToken);

  const messaggi = await listaNonLette(accessToken, casella.gmailDaEpoch);
  if (messaggi.length === 0) return; // Silenzioso se non ci sono nuove email

  console.log(`[gmail] Trovate ${messaggi.length} email non lette da processare (${casella.indirizzo}).`);

  // Sequenziale per non saturare la quota API (e per dare ordine ai ticket).
  for (const m of messaggi) {
    try {
      await processEmail(accessToken, m.id, casella);
    } catch (err) {
      // La singola email resta non letta: ritentera' ai cicli successivi.
      console.error(`[gmail] Errore elaborazione ${m.id} in ${casella.indirizzo}:`, err);
    }
  }
}

export async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    let caselle: CasellaGmailWorker[] = [];
    try {
      caselle = await caselleGmailPerWorker();
    } catch (err) {
      // Tabella ancora assente (l'app la crea lazy) o DB irraggiungibile:
      // si riprova al prossimo ciclo, come l'IMAP worker.
      console.error("[gmail] Lettura caselle dal DB fallita (riprovo al prossimo ciclo):", err);
      return;
    }

    if (caselle.length === 0) return;

    for (const casella of caselle) {
      const atteso = prossimoTentativo.get(casella.id);
      if (atteso !== undefined && Date.now() < atteso) continue;
      try {
        await pollCasella(casella);
        tentativiFalliti.delete(casella.id);
        prossimoTentativo.delete(casella.id);
      } catch (err) {
        const n = (tentativiFalliti.get(casella.id) ?? 0) + 1;
        tentativiFalliti.set(casella.id, n);
        const delay = backoffMs(n);
        prossimoTentativo.set(casella.id, Date.now() + delay);
        if (err instanceof ErroreGmail && (err.status === 401 || err.status === 403)) {
          // Token revocato dall'utente su Google: il backoff evita di
          // riprovare a ogni ciclo, ma la casella va ricollegata a mano.
          console.error(
            `[gmail] Accesso negato per ${casella.indirizzo} (tentativo ${n}, riprovo tra ${Math.round(delay / 1000)}s): ` +
            `${err.message} — se persiste, ricollega l'account dalla pagina Caselle.`
          );
        } else {
          console.error(
            `[gmail] Errore poll ${casella.indirizzo} (tentativo ${n}, riprovo tra ${Math.round(delay / 1000)}s):`,
            err
          );
        }
      }
    }
  } catch (err) {
    console.error("[gmail] Errore durante il poll:", err);
  } finally {
    isPolling = false;
  }
}

export async function startGmailWorker(): Promise<void> {
  if (!process.env.WEBHOOK_SECRET) {
    console.warn(
      "[gmail] WEBHOOK_SECRET non impostata: in produzione il server rifiuterà le richieste webhook."
    );
  }
  if (!process.env.GOOGLE_GMAIL_CLIENT_ID || !process.env.GOOGLE_GMAIL_CLIENT_SECRET) {
    console.warn(
      "[gmail] GOOGLE_GMAIL_CLIENT_ID/SECRET assenti: il polling partirà comunque " +
      "per le caselle gia' collegate, ma il collegamento di nuovi account non funzionerà."
    );
  }

  const intervalMs = pollIntervalMs();
  await pollOnce();
  console.log("[gmail] Inizio polling ogni", intervalMs / 1000, "secondi.");

  const interval = setInterval(() => {
    void pollOnce();
  }, intervalMs);

  const shutdown = async () => {
    console.log("[gmail] Shutdown in corso...");
    clearInterval(interval);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
