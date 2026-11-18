import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";
import { createHash } from "crypto";
import {
  caselleAbilitatePerWorker,
  salvaCursoreCasella,
  type CasellaWorker,
} from "./caselle-worker";

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3001/api/hooks/email";
// Poll interval: letto LAZY dentro startImapWorker(), per lo stesso motivo di
// webhookHeaders() sotto — in start-worker.ts le import girano PRIMA di
// dotenv.config(), quindi una variabile catturata a livello di modulo
// resterebbe al default e il valore in .env verrebbe ignorato.
function pollIntervalMs(): number {
  const n = parseInt(process.env.IMAP_POLL_INTERVAL_MS ?? "120000", 10);
  // Minimo difensivo: sotto i 5s si rischia di martellare Turso e il server
  // IMAP (una query DB + una search ad ogni ciclo).
  return Number.isFinite(n) && n >= 5000 ? n : 120000;
}
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

// Id sintetico della casella configurata in .env: resta pollata come
// fallback di retrocompatibilita' accanto a quelle del DB.
const CASELLA_ENV_ID = "env";

// Config di una singola connessione attiva. `fingerprint` serve a capire se
// le credenziali di una casella sono cambiate nel DB: a parita' di id, un
// fingerprint diverso implica riconnettere.
interface Connessione {
  client: ImapFlow;
  highWaterMark: number;
  uidValidita: number | null;
  fingerprint: string;
}

// Stato globale: un solo poll alla volta (come prima), piu' high water mark
// PER CASELLA (prima era uno solo, con piu' caselle si sovrapporrebbero).
const connessioni = new Map<string, Connessione>();
let isPolling = false;

// High water mark persistente per casella: sopravvive alla riconnessione.
// Senza, un ciclo di errore + riconnessione azzererebbe il mark e il poll
// successivo lo rimetterebbe all'UID corrente, SKIPPANDO le email arrivate
// mentre la connessione era caduta.
const highWaterMarkPerCasella = new Map<string, number>();

// Backoff per i tentativi di connessione falliti: senza, una casella con
// password sbagliata riprova ad ogni ciclo (15s) riempiendo i log e
// martellando il server IMAP. Delay = min(15s * 2^n, 5 min), azzerato
// alla prima riuscita o quando le credenziali cambiano.
const tentativiFalliti = new Map<string, number>();
const prossimoTentativo = new Map<string, number>();

function backoffMs(tentativi: number): number {
  return Math.min(15_000 * 2 ** tentativi, 300_000);
}

function fingerprintDi(c: CasellaWorker): string {
  return [c.imap.host, c.imap.port, c.imap.secure, c.imap.user, c.imap.pass, c.tlsNonVerificato].join("\u0000");
}

// La casella di env, se presente: retrocompatibilita' con l'installazione
// a singola casella che esisteva prima del multi-account.
//
// ORA E' OPT-IN: senza IMAP_ENV_FALLBACK=true le variabili IMAP_* vengono
// ignorate. Prima bastava averle in .env perche' il worker continuasse a
// pollare una casella "nascosta" anche quando l'app non aveva nessuna casella
// configurata — ed e' cosi' che arrivavano ticket da posta promozionale.
function casellaDaEnv(): CasellaWorker | null {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (process.env.IMAP_ENV_FALLBACK !== "true") {
    if (host && user) {
      console.warn(
        "[IMAP] IMAP_* presenti ma fallback disattivato: la casella di .env NON viene pollata. " +
          "Configura la casella dall'app oppure imposta IMAP_ENV_FALLBACK=true se e' voluto."
      );
    }
    return null;
  }

  if (!host || !user || !pass) return null;
  return {
    id: CASELLA_ENV_ID,
    indirizzo: user,
    // Le caselle configurate da .env non hanno una riga DB con deroga TLS:
    // restano sempre verificate. Chi ha un certificato non valido colleghi la
    // casella dal pannello e attivi la deroga li'.
    tlsNonVerificato: false,
    ultimoUid: null,
    uidValidita: null,
    imap: {
      host,
      port: parseInt(process.env.IMAP_PORT ?? "993", 10),
      secure: process.env.IMAP_SECURE !== "false",
      user,
      pass,
    },
    smtp: {
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: (process.env.SMTP_PORT ?? "587") === "465",
      user: process.env.SMTP_USER ?? user,
      pass: process.env.SMTP_PASS ?? pass,
    },
  };
}

async function caricaCaselle(): Promise<CasellaWorker[]> {
  let dalDb: CasellaWorker[] = [];
  try {
    dalDb = await caselleAbilitatePerWorker();
  } catch (err) {
    // Tabella ancora assente (l'app la crea lazy) o DB temporaneamente
    // irraggiungibile: si continua con la sola casella di env, se c'e'.
    console.error("[IMAP] Lettura caselle dal DB fallita (riprovo al prossimo ciclo):", err);
  }
  const lista = [...dalDb];
  const env = casellaDaEnv();
  if (env && !dalDb.some((c) => c.id === CASELLA_ENV_ID)) lista.push(env);
  return lista;
}

function creaClient(c: CasellaWorker): ImapFlow {
  const client = new ImapFlow({
    host: c.imap.host,
    port: c.imap.port,
    secure: c.imap.secure,
    auth: { user: c.imap.user, pass: c.imap.pass },
    logger: false,
    // Default sicuro; la deroga e' per-casella.
    tls: { rejectUnauthorized: !c.tlsNonVerificato },
  });
  // ImapFlow emette 'error' come evento (socket timeout, connessione rotta a
  // metà, ecc.): SENZA questo handler Node termina l'intero processo worker.
  // L'errore viene loggato e la casella viene riallineata al prossimo ciclo.
  client.on("error", (err) => {
    console.error(`[IMAP] Errore connessione per ${c.indirizzo}:`, err);
  });
  return client;
}

// Allinea le connessioni attive alle caselle desiderate: collega le nuove,
// chiude le rimosse, riconnette quelle le cui credenziali sono cambiate.
async function allineaConnessioni(desiderate: CasellaWorker[]): Promise<void> {
  const desiderateIds = new Set(desiderate.map((c) => c.id));

  for (const [id, conn] of Array.from(connessioni.entries())) {
    if (!desiderateIds.has(id)) {
      console.log(`[IMAP] Casella ${id} disabilitata/rimossa: chiudo la connessione.`);
      connessioni.delete(id);
      // Backoff e contatori non servono piu'; il high water mark resta
      // (se la casella viene riabilitata, non si riprocessano le email vecchie).
      tentativiFalliti.delete(id);
      prossimoTentativo.delete(id);
      try {
        await conn.client.logout();
      } catch {
        // Ignora errori di logout
      }
    }
  }

  for (const c of desiderate) {
    const fp = fingerprintDi(c);
    const esistente = connessioni.get(c.id);
    if (esistente) {
      if (esistente.fingerprint === fp) continue; // Invariata
      // Credenziali cambiate: riconnettere con la nuova config.
      console.log(`[IMAP] Configurazione di ${c.indirizzo} cambiata: riconnessione.`);
      connessioni.delete(c.id);
      // Credenziali nuove = il backoff precedente non e' piu' valido.
      tentativiFalliti.delete(c.id);
      prossimoTentativo.delete(c.id);
      try {
        await esistente.client.logout();
      } catch {
        // Ignora
      }
    }

    // Backoff: una casella che fallisce riprova a intervalli crescenti.
    const atteso = prossimoTentativo.get(c.id);
    if (atteso !== undefined && Date.now() < atteso) continue;

    try {
      console.log(`[IMAP] Connessione a ${c.imap.host}:${c.imap.port} (${c.indirizzo})...`);
      const client = creaClient(c);
      await client.connect();
      // Cursore persistente dal DB: dopo un riavvio del worker le email
      // arrivate nel frattempo non vengono saltate.
      const cursore = c.ultimoUid ?? highWaterMarkPerCasella.get(c.id) ?? 0;
      if (c.ultimoUid != null) highWaterMarkPerCasella.set(c.id, c.ultimoUid);
      connessioni.set(c.id, {
        client,
        highWaterMark: cursore,
        uidValidita: c.uidValidita,
        fingerprint: fp,
      });
      tentativiFalliti.delete(c.id);
      prossimoTentativo.delete(c.id);
      console.log(`[IMAP] Connesso: ${c.indirizzo}`);
    } catch (err) {
      const n = (tentativiFalliti.get(c.id) ?? 0) + 1;
      tentativiFalliti.set(c.id, n);
      const delay = backoffMs(n);
      prossimoTentativo.set(c.id, Date.now() + delay);
      console.error(
        `[IMAP] Connessione fallita per ${c.indirizzo} (tentativo ${n}, riprovo tra ${Math.round(delay / 1000)}s):`,
        err
      );
    }
  }
}

async function processEmail(raw: Uint8Array, casellaId: string): Promise<void> {
  const parsed = await PostalMime.parse(raw);

  const fromAddress = parsed.from?.address ?? "";
  const fromName = parsed.from?.name ?? undefined;
  const subject = parsed.subject ?? "(nessun oggetto)";
  const body = parsed.text ?? "";
  const bodyHtml = parsed.html ?? undefined;

  // Header utili al triage e al threading. PostalMime li espone come array.
  const headers: Record<string, string> = {};
  const headerUtili = new Set([
    "auto-submitted",
    "precedence",
    "list-unsubscribe",
    "in-reply-to",
    "references",
    "message-id",
  ]);
  for (const h of parsed.headers ?? []) {
    const chiave = String(h.key ?? "").toLowerCase();
    if (!headerUtili.has(chiave)) continue;
    const valore = Array.isArray(h.value) ? h.value.join(" ") : String(h.value ?? "");
    headers[chiave] = valore;
  }

  // Message-ID di ripiego STABILE: un id basato sull'ora cambierebbe a ogni
  // retry e la deduplica non riconoscerebbe il doppione.
  const messageId =
    parsed.messageId ??
    `<${createHash("sha256")
      .update(`${fromAddress}\u0000${parsed.date ?? ""}\u0000${subject}`)
      .digest("hex")}@support-desk.local>`;

  // Filtro difensivo sui mittenti automatici (oltre alle regole del triage).
  const autoReplyHeaders = [
    "auto-reply", "auto_response", "donotreply", "noreply",
    "no-reply", "mailer-daemon", "postmaster",
  ];
  if (autoReplyHeaders.some((h) => fromAddress.toLowerCase().includes(h))) {
    console.log(`[IMAP] Ignorato auto-reply da: ${fromAddress}`);
    return;
  }

  // Allegati: base64 nel payload del webhook. Oltre 10MB non vengono inviati
  // (verrebbero comunque rifiutati dalla validazione lato app).
  const allegati = (parsed.attachments ?? [])
    .filter((a) => a && a.content != null && a.filename)
    .map((a) => {
      const contenuto = a.content;
      const buffer =
        typeof contenuto === "string"
          ? Buffer.from(contenuto)
          : Buffer.from(new Uint8Array(contenuto as ArrayBuffer));
      return {
        filename: String(a.filename),
        contentType: a.mimeType ?? undefined,
        contentBase64: buffer.toString("base64"),
        dimensione: buffer.length,
      };
    })
    .filter((a) => a.dimensione > 0 && a.dimensione <= 10 * 1024 * 1024)
    .map(({ dimensione: _dimensione, ...rest }) => rest);

  console.log(`[IMAP] Email ricevuta in ${casellaId}: "${subject}" da ${fromAddress}`);

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
      casellaId,
      headers,
      inReplyTo: headers["in-reply-to"],
      references: headers["references"],
      attachments: allegati,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook error ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(
    `[IMAP] Esito: ${result.ticket ?? result.esito ?? result.skipped ?? "N/A"}`
  );
}

async function pollCasella(id: string, conn: Connessione): Promise<void> {
  const client = conn.client;

  const lock = await client.getMailboxLock("INBOX");
  try {
    // UIDVALIDITY: se la cartella e' stata ricostruita gli UID non sono piu'
    // confrontabili. Il cursore va azzerato e il primo poll successivo
    // riparte dall'UID piu' alto esistente.
    const mailbox = client.mailbox as unknown as
      | { uidValidity?: number | bigint }
      | false
      | null
      | undefined;
    const uidValidita = mailbox
      ? Number(mailbox.uidValidity ?? 0) || null
      : null;
    if (
      conn.uidValidita != null &&
      uidValidita != null &&
      conn.uidValidita !== uidValidita
    ) {
      console.warn(
        `[IMAP] UIDVALIDITY cambiata per ${id} (${conn.uidValidita} -> ${uidValidita}): azzero il cursore.`
      );
      conn.highWaterMark = 0;
      highWaterMarkPerCasella.delete(id);
    }
    if (uidValidita != null) conn.uidValidita = uidValidita;

    // Primo poll: imposta high water mark all'UID piu' alto esistente
    // (ignora le email gia' presenti nella casella)
    if (conn.highWaterMark === 0) {
      const allMessages = await client.search({ all: true });
      if (allMessages !== false && allMessages.length > 0) {
        conn.highWaterMark = Math.max(...allMessages);
        highWaterMarkPerCasella.set(id, conn.highWaterMark);
        await salvaCursoreCasella(id, conn.highWaterMark, conn.uidValidita);
        console.log(`[IMAP] High water mark impostato a UID ${conn.highWaterMark}. Solo le email successive verranno processate.`);
      }
      return;
    }

    // Cerca email non lette con UID > high water mark
    const searchResult = await client.search({ seen: false });
    const unseen = searchResult === false ? [] : searchResult;
    const newUids = unseen.filter((uid) => uid > conn.highWaterMark);

    if (newUids.length === 0) {
      return; // Silenzioso se non ci sono nuove email
    }

    console.log(`[IMAP] Trovate ${newUids.length} email nuove da processare (${id}).`);

    for (const uid of newUids) {
      try {
        const msg = await client.fetchOne(uid, { source: true, uid: true });
        if (msg && msg.source) {
          await processEmail(msg.source, id);
        }
        // Segna come letta dopo l'elaborazione riuscita
        await client.messageFlagsAdd(uid, ["\\Seen"]);
        // Aggiorna cursore in memoria E su DB
        if (uid > conn.highWaterMark) {
          conn.highWaterMark = uid;
          highWaterMarkPerCasella.set(id, uid);
          await salvaCursoreCasella(id, uid, conn.uidValidita);
        }
      } catch (err) {
        console.error(`[IMAP] Errore elaborazione UID ${uid} in ${id}:`, err);
        // NON avanzare oltre un UID fallito: il cursore resta prima di lui,
        // cosi' il prossimo ciclo lo ritenta (il webhook deduplica).
        break;
      }
    }
  } finally {
    lock.release();
  }
}

async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    const desiderate = await caricaCaselle();
    await allineaConnessioni(desiderate);

    // Sequenziale per evitare di saturare la rete/IO con N caselle in
    // parallelo: il numero di caselle e' piccolo e il poll e' gia' lento.
    for (const [id, conn] of Array.from(connessioni.entries())) {
      try {
        await pollCasella(id, conn);
      } catch (err) {
        console.error(`[IMAP] Errore durante il poll di ${id}:`, err);
        // Tentativo di riconnessione della sola casella incriminata
        connessioni.delete(id);
        try {
          await conn.client.logout();
        } catch {
          // Ignora errori di logout
        }
        const casella = desiderate.find((c) => c.id === id);
        if (casella) {
          try {
            const client = creaClient(casella);
            await client.connect();
            connessioni.set(id, {
              client,
              // Mark persistente: non si perdono le email arrivate durante
              // il buco di connessione.
              highWaterMark: highWaterMarkPerCasella.get(id) ?? 0,
              uidValidita: casella.uidValidita,
              fingerprint: fingerprintDi(casella),
            });
            console.log(`[IMAP] Riconnesso: ${casella.indirizzo}`);
          } catch (reconnectErr) {
            console.error(`[IMAP] Riconnessione fallita per ${casella.indirizzo}:`, reconnectErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("[IMAP] Errore durante il poll:", err);
  } finally {
    isPolling = false;
  }
}

async function chiudiTutte(): Promise<void> {
  for (const [id, conn] of Array.from(connessioni.entries())) {
    try {
      await conn.client.logout();
    } catch {
      // Ignora
    }
    connessioni.delete(id);
  }
}

export async function startImapWorker(): Promise<void> {
  if (!process.env.WEBHOOK_SECRET) {
    console.warn(
      "[IMAP] WEBHOOK_SECRET non impostata: in produzione il server rifiuterà le richieste webhook."
    );
  }
  if (!process.env.IMAP_HOST && !process.env.TURSO_DATABASE_URL) {
    console.warn(
      "[IMAP] Nessuna casella disponibile: mancano sia le variabili IMAP_* sia il DB per le caselle configurate dall'app."
    );
  }

  // Primo allineamento subito, poi poll periodico: le caselle aggiunte
  // dall'applicazione vengono colte entro un ciclo (IMAP_POLL_INTERVAL_MS)
  // senza riavviare il worker.
  const intervalMs = pollIntervalMs();
  await pollOnce();
  console.log("[IMAP] Inizio polling ogni", intervalMs / 1000, "secondi.");

  const interval = setInterval(() => {
    void pollOnce();
  }, intervalMs);

  // Gestione graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[IMAP] Shutdown in corso...");
    clearInterval(interval);
    await chiudiTutte();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("[IMAP] Shutdown in corso...");
    clearInterval(interval);
    await chiudiTutte();
    process.exit(0);
  });
}
