import { db } from "./db";
import {
  estraiRiferimenti,
  normalizzaMessageId,
  oggettoConToken,
} from "./email-headers";

export { estraiRiferimenti, normalizzaMessageId, oggettoConToken };

// Threading delle email: agganciare una risposta al ticket giusto.
//
// Ordine di fiducia:
//   1. header In-Reply-To / References -> un Message-ID che abbiamo inviato
//      (email_log) o ricevuto (email_inbox);
//   2. token [TICK-xxxx] nell'oggetto, ma SOLO se il mittente coincide con
//      l'email del ticket (altrimenti chiunque potrebbe agganciarsi).
// Il threadId di Gmail non e' persistito qui: gli header sono piu' portabili
// e funzionano anche con IMAP.

export async function trovaTicketPerThread(opts: {
  inReplyTo?: string | null;
  riferimenti?: string | null;
  subject: string;
  fromEmail: string;
  // Solo per mittenti interni (fidati): il token nell'oggetto basta anche se
  // il mittente non e' l'email del ticket.
  consentiTokenSenzaMittente?: boolean;
}): Promise<string | null> {
  const ids = estraiRiferimenti(opts.inReplyTo, opts.riferimenti);
  if (ids.length > 0) {
    const segnaposto = ids.map((_, i) => `@id${i}`).join(", ");
    const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));

    // Una nostra email inviata: il cliente l'ha risposta, In-Reply-To punta
    // al Message-ID che abbiamo salvato in email_log.
    const daLog = await db
      .prepare(
        `SELECT ticket_id FROM email_log
         WHERE message_id IN (${segnaposto}) AND ticket_id IS NOT NULL
         ORDER BY data_creazione DESC LIMIT 1`
      )
      .get(params);
    if (daLog?.ticket_id) return String(daLog.ticket_id);

    // Una email ricevuta in precedenza e gia' agganciata a un ticket.
    const daInbox = await db
      .prepare(
        `SELECT ticket_id FROM email_inbox
         WHERE message_id IN (${segnaposto}) AND ticket_id IS NOT NULL
         ORDER BY data_creazione DESC LIMIT 1`
      )
      .get(params);
    if (daInbox?.ticket_id) return String(daInbox.ticket_id);
  }

  // Fallback: token nell'oggetto. Solo se mittente e email del ticket
  // coincidono, per non permettere agganci arbitrari.
  const token = opts.subject.match(/\[(TICK-\d+)\]/i);
  if (token) {
    const numero = token[1].toUpperCase();
    const ticket = await db
      .prepare(`SELECT id, email FROM tickets WHERE numero = ?`)
      .get(numero);
    if (ticket) {
      const emailTicket = String(ticket.email ?? "").toLowerCase();
      if (
        opts.consentiTokenSenzaMittente ||
        (emailTicket && emailTicket === opts.fromEmail.toLowerCase())
      ) {
        return String(ticket.id);
      }
    }
  }

  return null;
}

export async function contestoThreading(ticketId: string): Promise<{
  numero: string | null;
  lastMessageId: string | null;
  references: string[];
}> {
  const [righe, ticket] = await Promise.all([
    db
      .prepare(
        `SELECT message_id FROM email_log
         WHERE ticket_id = ? AND message_id IS NOT NULL
         ORDER BY data_creazione ASC`
      )
      .all(ticketId),
    db.prepare(`SELECT numero FROM tickets WHERE id = ?`).get(ticketId),
  ]);
  const ids = righe.map((r) => String(r.message_id)).filter(Boolean);
  return {
    numero: ticket ? String(ticket.numero) : null,
    lastMessageId: ids.length > 0 ? ids[ids.length - 1] : null,
    references: ids,
  };
}

// Aggiunge [TICK-xxxx] all'oggetto se non c'e' gia'. Re-esportata da
// email-headers per comodita' dei chiamanti.
