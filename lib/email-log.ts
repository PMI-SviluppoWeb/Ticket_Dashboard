import { db } from "./db";
import type { EmailLog, EmailTipo } from "./types";

export async function logEmail(data: {
  ticket_id: string;
  tipo: EmailTipo;
  destinatario: string;
  oggetto: string;
  corpo: string;
  stato: "inviata" | "errore";
  errore?: string | null;
}): Promise<EmailLog> {
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO email_log (id, ticket_id, tipo, destinatario, oggetto, corpo, stato, errore, data_creazione)
       VALUES (@id, @ticket_id, @tipo, @destinatario, @oggetto, @corpo, @stato, @errore, @data_creazione)`
    )
    .run({
      id,
      ticket_id: data.ticket_id,
      tipo: data.tipo,
      destinatario: data.destinatario,
      oggetto: data.oggetto,
      corpo: data.corpo,
      stato: data.stato,
      errore: data.errore ?? null,
      data_creazione: ts,
    });

  return { id, ...data, errore: data.errore ?? null, data_creazione: ts };
}

export async function getEmailLog(ticketId: string): Promise<EmailLog[]> {
  const rows = await db
    .prepare(
      `SELECT id, ticket_id, tipo, destinatario, oggetto, corpo, stato, errore, data_creazione
       FROM email_log WHERE ticket_id = @ticket_id ORDER BY data_creazione DESC`
    )
    .all({ ticket_id: ticketId });
  return rows as unknown as EmailLog[];
}
