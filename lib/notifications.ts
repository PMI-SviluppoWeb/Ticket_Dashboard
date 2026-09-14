import { db } from "./db";

export interface Notification {
  id: string;
  titolo: string;
  messaggio: string;
  ticket_id: string | null;
  tipo: string;
  letta: boolean;
  data_creazione: string;
}

export async function createNotification(data: {
  titolo: string;
  messaggio: string;
  ticket_id?: string;
  tipo?: string;
}): Promise<Notification> {
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO notifications (id, titolo, messaggio, ticket_id, tipo, letta, data_creazione)
       VALUES (@id, @titolo, @messaggio, @ticket_id, @tipo, 0, @data_creazione)`
    )
    .run({
      id,
      titolo: data.titolo,
      messaggio: data.messaggio,
      ticket_id: data.ticket_id ?? null,
      tipo: data.tipo ?? "info",
      data_creazione: ts,
    });

  return { id, ...data, ticket_id: data.ticket_id ?? null, tipo: data.tipo ?? "info", letta: false, data_creazione: ts };
}

export async function listNotifications(opts?: { solo_non_lette?: boolean; limit?: number }): Promise<Notification[]> {
  const limit = opts?.limit ?? 50;
  const where = opts?.solo_non_lette ? "WHERE letta = 0" : "";
  const rows = await db
    .prepare(
      `SELECT id, titolo, messaggio, ticket_id, tipo, letta, data_creazione
       FROM notifications ${where}
       ORDER BY data_creazione DESC
       LIMIT @limit`
    )
    .all({ limit });
  return rows.map((r) => ({ ...r, letta: !!r.letta })) as unknown as Notification[];
}

export async function getUnreadCount(): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE letta = 0`)
    .get();
  return (row?.n as number) ?? 0;
}

export async function markAsRead(id: string): Promise<void> {
  await db.prepare(`UPDATE notifications SET letta = 1 WHERE id = @id`).run({ id });
}

export async function markAllAsRead(): Promise<void> {
  await db.prepare(`UPDATE notifications SET letta = 1 WHERE letta = 0`).run();
}
