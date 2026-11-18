import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { db } from "@/lib/db";
import { createTicket, getTicket, insertMessage, updateTicket } from "@/lib/tickets";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailAutoReply } from "@/lib/email-templates";
import { logEmail } from "@/lib/email-log";
import { classifyEmail, regoleTriage } from "@/lib/email-classifier";
import { completaContatti } from "@/lib/contatti";
import { configTriageCasella } from "@/lib/caselle";
import {
  estraiRiferimenti,
  normalizzaMessageId,
  trovaTicketPerThread,
} from "@/lib/threading";
import { estensione, mimeDaNome, nomeOriginaleSicuro } from "@/lib/allegati";
import { registra } from "@/lib/registro";
import type { Priorita } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const MAX_ALLEGATO_BYTES = 10 * 1024 * 1024;

interface AllegatoIngresso {
  filename: string;
  // Contenuto base64: il worker legge il MIME e lo serializza.
  contentBase64: string;
  contentType?: string;
}

interface IncomingEmail {
  messageId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  date?: string;
  casellaId?: string;
  // Header utili al triage (Auto-Submitted, Precedence, List-Unsubscribe).
  headers?: Record<string, string>;
  // Threading.
  inReplyTo?: string;
  references?: string;
  attachments?: AllegatoIngresso[];
}

// Fail-closed: in produzione un WEBHOOK_SECRET mancante blocca tutto.
function verificaSegreto(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const segreto = process.env.WEBHOOK_SECRET;
  if (!segreto) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: "WEBHOOK_SECRET non configurata sul server." };
    }
    return { ok: true };
  }
  const ricevuto = request.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(segreto, "utf8");
  const b = Buffer.from(ricevuto, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Segreto webhook non valido." };
  }
  return { ok: true };
}

async function trovaCliente(email: string): Promise<{ id: string; nome: string } | null> {
  const row = await db
    .prepare("SELECT id, ragione_sociale FROM clienti WHERE email = ? AND attivo = 1")
    .get(email);
  return row
    ? { id: String(row.id), nome: String(row.ragione_sociale) }
    : null;
}

async function idOperatorePerNome(nome: string | null): Promise<string | null> {
  if (!nome) return null;
  const row = await db.prepare(`SELECT id FROM operatori WHERE nome = ?`).get(nome);
  return row ? String(row.id) : null;
}

// Salva gli allegati arrivati per email nella tabella dedicata (non in
// `allegati`, che richiede una nota tecnica). Stesse regole MIME dei caricamenti.
async function salvaAllegatiInArrivo(
  allegati: AllegatoIngresso[] | undefined,
  ticketId: string,
  messaggioId: string
): Promise<number> {
  if (!allegati || allegati.length === 0) return 0;
  await mkdir(UPLOADS_DIR, { recursive: true });
  let salvati = 0;

  for (const a of allegati) {
    if (!a || typeof a.filename !== "string" || typeof a.contentBase64 !== "string") continue;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(a.contentBase64, "base64");
    } catch {
      continue;
    }
    if (buffer.length === 0 || buffer.length > MAX_ALLEGATO_BYTES) continue;

    const nomeOriginale = nomeOriginaleSicuro(a.filename);
    const mime = mimeDaNome(nomeOriginale);
    if (!mime) continue; // tipo non ammesso: si scarta, non si serve mai

    const id = crypto.randomUUID();
    const ext = estensione(nomeOriginale);
    const nomeFile = `${id}.${ext}`;
    try {
      await writeFile(join(UPLOADS_DIR, nomeFile), buffer);
      await db
        .prepare(
          `INSERT INTO allegati_messaggi
             (id, messaggio_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione)
           VALUES (@id, @messaggio_id, @ticket_id, @nome_file, @nome_originale, @dimensione, @tipo_mime, @data_creazione)`
        )
        .run({
          id,
          messaggio_id: messaggioId,
          ticket_id: ticketId,
          nome_file: nomeFile,
          nome_originale: nomeOriginale,
          dimensione: buffer.length,
          tipo_mime: mime,
          data_creazione: new Date().toISOString(),
        });
      salvati += 1;
    } catch (err) {
      console.error("Allegato in ingresso non salvato:", nomeOriginale, err);
    }
  }
  return salvati;
}

// Upsert della riga di posta in arrivo: il secondo tentativo di un UID fallito
// aggiorna la stessa riga invece di duplicarla.
async function salvaInbox(data: {
  messageId: string;
  fromEmail: string;
  fromNome: string | null;
  subject: string;
  bodyPreview: string;
  bodyText: string | null;
  bodyHtml: string | null;
  ticketId: string | null;
  casellaId: string | null;
  // Valori ammessi dal CHECK storico della colonna.
  stato: "processata" | "errore" | "ignorata";
  // Esito finale del triage (colonna nuova, additiva).
  statoTriage: "ticket" | "da_verificare" | "ignora";
  esitoAi: string | null;
  confidenza: number | null;
  motivo: string | null;
  inReplyTo: string | null;
  riferimenti: string | null;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_inbox
         (id, message_id, from_email, from_nome, subject, body_preview, body_text, body_html,
          ticket_id, casella_id, stato, stato_triage, esito_ai, confidenza, motivo, in_reply_to, riferimenti, data_creazione)
       VALUES
         (@id, @message_id, @from_email, @from_nome, @subject, @body_preview, @body_text, @body_html,
          @ticket_id, @casella_id, @stato, @stato_triage, @esito_ai, @confidenza, @motivo, @in_reply_to, @riferimenti, @data_creazione)
       ON CONFLICT (message_id) DO UPDATE SET
         from_email = excluded.from_email,
         from_nome = excluded.from_nome,
         subject = excluded.subject,
         body_preview = excluded.body_preview,
         body_text = excluded.body_text,
         body_html = excluded.body_html,
         ticket_id = excluded.ticket_id,
         casella_id = excluded.casella_id,
         stato = excluded.stato,
         stato_triage = excluded.stato_triage,
         esito_ai = excluded.esito_ai,
         confidenza = excluded.confidenza,
         motivo = excluded.motivo,
         in_reply_to = excluded.in_reply_to,
         riferimenti = excluded.riferimenti`
    )
    .run({
      id: crypto.randomUUID(),
      message_id: data.messageId,
      from_email: data.fromEmail,
      from_nome: data.fromNome,
      subject: data.subject,
      body_preview: data.bodyPreview,
      body_text: data.bodyText,
      body_html: data.bodyHtml,
      ticket_id: data.ticketId,
      casella_id: data.casellaId,
      stato: data.stato,
      stato_triage: data.statoTriage,
      esito_ai: data.esitoAi,
      confidenza: data.confidenza,
      motivo: data.motivo,
      in_reply_to: data.inReplyTo,
      riferimenti: data.riferimenti,
      data_creazione: new Date().toISOString(),
    });
}

export async function POST(request: Request) {
  try {
    const segreto = verificaSegreto(request);
    if (!segreto.ok) {
      return NextResponse.json({ error: segreto.error }, { status: segreto.status });
    }

    const email: IncomingEmail = await request.json();

    if (!email.messageId || !email.from || !email.subject) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: messageId, from, subject." },
        { status: 400 }
      );
    }

    // Deduplicazione: una riga in errore puo' essere ritentata; una gia'
    // processata/ignorata (o in attesa) viene saltata.
    const esistente = await db
      .prepare("SELECT id, stato FROM email_inbox WHERE message_id = ?")
      .get(email.messageId);
    if (esistente && esistente.stato !== "errore") {
      return NextResponse.json({ ok: true, skipped: "duplicato" });
    }

    const inReplyTo =
      normalizzaMessageId(email.inReplyTo) ??
      estraiRiferimenti(email.references).slice(-1)[0] ??
      null;
    const riferimenti = email.references ?? null;
    const casellaId =
      typeof email.casellaId === "string" && email.casellaId ? email.casellaId : null;

    const cliente = await trovaCliente(email.from);

    // -------------------------------------------------------------------
    // 1. Risposta a un ticket esistente (threading)
    // -------------------------------------------------------------------
    const ticketId = await trovaTicketPerThread({
      inReplyTo,
      riferimenti,
      subject: email.subject,
      fromEmail: email.from,
    });

    if (ticketId) {
      const ticket = await getTicket(ticketId);
      if (ticket && !ticket.eliminato_il) {
        const contenuto = `Email ricevuta da ${email.from}:\n\nOggetto: ${email.subject}\n\n${email.body || "(nessun corpo testuale)"}`;
        const messaggioId = await insertMessage(ticketId, {
          ruolo: "user",
          contenuto,
          data_creazione: new Date().toISOString(),
        });
        const allegati = await salvaAllegatiInArrivo(
          email.attachments,
          ticketId,
          messaggioId
        );

        let riaperto = false;
        if (ticket.stato === "CHIUSO" || ticket.stato === "RISOLTO") {
          await updateTicket(
            ticketId,
            { stato: "IN_CORSO" },
            ticket,
            { origine: "sistema", operatore: ticket.operatore }
          );
          riaperto = true;
          await createNotification({
            titolo: "Ticket riaperto da una risposta email",
            messaggio: `${ticket.numero} - ${ticket.sommario_problema} (${email.from})`,
            ticket_id: ticketId,
            tipo: "riapertura",
            destinatario_id: ticket.operatore_id ?? null,
          });
        }

        await salvaInbox({
          messageId: email.messageId,
          fromEmail: email.from,
          fromNome: email.fromName ?? null,
          subject: email.subject,
          bodyPreview: (email.body || email.subject).slice(0, 500),
          bodyText: email.body || null,
          bodyHtml: email.bodyHtml ?? null,
          ticketId,
          casellaId,
          stato: "processata",
          statoTriage: "ticket",
          esitoAi: "ticket",
          confidenza: 1,
          motivo: "Risposta agganciata a un ticket esistente.",
          inReplyTo,
          riferimenti,
        });

        await registra({
          origine: "sistema",
          azione: "email.agganciata",
          entita: "ticket",
          entitaId: ticketId,
          dettagli: { message_id: email.messageId, riaperto, allegati },
        });

        return NextResponse.json({
          ok: true,
          ticket: ticket.numero,
          esito: "agganciata",
          riaperto,
        });
      }
    }

    // -------------------------------------------------------------------
    // 2. Triage di un messaggio nuovo
    // -------------------------------------------------------------------
    const config = await configTriageCasella(casellaId);
    const regola = regoleTriage({
      from: email.from,
      subject: email.subject,
      headers: email.headers,
    });

    let classification = await classifyEmail({
      from: email.from,
      subject: email.subject,
      body: email.body,
      bodyHtml: email.bodyHtml,
      headers: email.headers,
    });

    // Mittente in anagrafica: alza la fiducia (il dominio e' noto).
    if (cliente) {
      classification = {
        ...classification,
        confidenza: Math.min(1, classification.confidenza + 0.2),
      };
    }

    const soglia = config.soglia;
    let decisione: "ticket" | "da_verificare" | "ignorata";

    // L'esito dell'AI vale SEMPRE, anche in "osservazione". L'osservazione
    // serve a registrare la classificazione, non a forzare un ticket su una
    // email che il triage ha giudicato da ignorare (era il caso delle email
    // personali/promozionali che finivano comunque in coda).
    if (!config.attivo) {
      decisione = "ticket";
    } else if (classification.esito === "ignora" && classification.confidenza >= soglia) {
      decisione = "ignorata";
    } else if (classification.esito === "ticket" && classification.confidenza >= soglia) {
      decisione = "ticket";
    } else {
      decisione = "da_verificare";
    }

    // Un mittente presente in anagrafica non viene MAI scartato in silenzio:
    // se il triage lo ignora, finisce nella coda "Da verificare". Evita di
    // perdere una richiesta vera finita in un'email dall'aspetto promozionale.
    if (cliente && decisione === "ignorata") {
      decisione = "da_verificare";
    }

    const baseInbox = {
      messageId: email.messageId,
      fromEmail: email.from,
      fromNome: email.fromName ?? null,
      subject: email.subject,
      bodyPreview: (email.body || email.subject).slice(0, 500),
      bodyText: email.body || null,
      bodyHtml: email.bodyHtml ?? null,
      casellaId,
      confidenza: classification.confidenza,
      motivo: regola?.motivo ?? classification.motivo,
      inReplyTo,
      riferimenti,
    };

    if (decisione === "ignorata") {
      await salvaInbox({
        ...baseInbox,
        ticketId: null,
        stato: "ignorata",
        statoTriage: "ignora",
        esitoAi: classification.esito,
      });
      await registra({
        origine: "sistema",
        azione: "email.ignorata",
        entita: "email_inbox",
        entitaId: email.messageId,
        dettagli: { from: email.from, subject: email.subject },
      });
      return NextResponse.json({ ok: true, skipped: "ignorata" });
    }

    if (decisione === "da_verificare") {
      await salvaInbox({
        ...baseInbox,
        ticketId: null,
        stato: "processata",
        statoTriage: "da_verificare",
        esitoAi: classification.esito,
      });
      await createNotification({
        titolo: "Email da verificare",
        messaggio: `${email.subject} — ${email.from}`,
        tipo: "triage",
      });
      await registra({
        origine: "sistema",
        azione: "email.da_verificare",
        entita: "email_inbox",
        entitaId: email.messageId,
        dettagli: { from: email.from, subject: email.subject, confidenza: classification.confidenza },
      });
      return NextResponse.json({ ok: true, skipped: "da_verificare" });
    }

    // -------------------------------------------------------------------
    // 3. Creazione del ticket
    // -------------------------------------------------------------------
    const clienteNome =
      cliente?.nome ?? email.fromName ?? email.from.split("@")[0];
    const contatto = email.fromName || email.from;
    const contatti = completaContatti(
      { contatto, email: email.from, telefono: null },
      contatto,
      email.body
    );

    const priorita: Priorita = config.priorita ?? classification.priorita;
    const operatoreId = await idOperatorePerNome(config.operatore);
    const messaggioId = crypto.randomUUID();

    // Il ragionamento del triage resta in email_inbox/registro, NON nel campo
    // note del ticket: quella nota e' visibile all'operatore come "Risposta
    // Rapida" e non deve contenere testo generato dall'AI.
    const ticket = await createTicket({
      canale: "email",
      cliente: clienteNome,
      contatto: contatti.contatto,
      telefono: contatti.telefono,
      email: contatti.email ?? email.from,
      modulo_software: classification.modulo_suggerito,
      sommario_problema: classification.sommario,
      descrizione_dettagliata: email.body || email.subject,
      priorita,
      operatore_id: operatoreId,
      cliente_id: cliente?.id ?? null,
      messaggi: [
        {
          id: messaggioId,
          ruolo: "user",
          contenuto: `Email ricevuta da ${email.from}:\n\nOggetto: ${email.subject}\n\n${email.body || "(nessun corpo testuale)"}`,
          data_creazione: new Date().toISOString(),
        },
      ],
    });

    const allegati = await salvaAllegatiInArrivo(email.attachments, ticket.id, messaggioId);

    await salvaInbox({
      ...baseInbox,
      ticketId: ticket.id,
      stato: "processata",
      statoTriage: "ticket",
      esitoAi: classification.esito,
    });

    const prioritaLabel = priorita === "ALTA" ? " ALTA" : "";
    await createNotification({
      titolo: `Nuovo ticket da email${prioritaLabel}`,
      messaggio: `${ticket.numero} - ${classification.sommario} (${clienteNome})`,
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
      destinatario_id: operatoreId,
    });

    // Autorisposta: cita il messaggio appena ricevuto cosi' la prossima
    // risposta del cliente resta nello stesso thread.
    const autoReplyHtml = emailAutoReply({
      numero: ticket.numero,
      cliente: clienteNome,
      oggettoOriginale: email.subject,
    });
    const replySubject = `[Support Desk] ${ticket.numero} - Ricevuto la tua richiesta`;
    const replyResult = await sendEmail({
      to: email.from,
      subject: replySubject,
      html: autoReplyHtml,
      casellaId: casellaId ?? undefined,
      ticketId: ticket.id,
      inReplyTo: normalizzaMessageId(email.messageId),
    });
    await logEmail({
      ticket_id: ticket.id,
      tipo: "nuovo_ticket",
      destinatario: email.from,
      oggetto: replySubject,
      corpo: autoReplyHtml,
      stato: replyResult.ok ? "inviata" : "errore",
      errore: replyResult.error ?? null,
      message_id: replyResult.messageId ?? null,
      in_reply_to: normalizzaMessageId(email.messageId),
      riferimenti: email.messageId,
    });

    await registra({
      origine: "sistema",
      azione: "ticket.creato_da_email",
      entita: "ticket",
      entitaId: ticket.id,
      dettagli: {
        message_id: email.messageId,
        esito_ai: classification.esito,
        confidenza: classification.confidenza,
        osservazione: config.osservazione,
        allegati,
      },
    });

    return NextResponse.json({
      ok: true,
      ticket: ticket.numero,
      esito: classification.esito,
      confidenza: classification.confidenza,
      osservazione: config.osservazione,
      classification: {
        intent: classification.intent,
        priorita,
        requiresHumanReview: classification.requiresHumanReview,
      },
    });
  } catch (err) {
    console.error("POST /api/hooks/email", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
