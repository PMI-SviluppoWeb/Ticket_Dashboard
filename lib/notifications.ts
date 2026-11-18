import { db } from "./db";

export interface Notification {
  id: string;
  titolo: string;
  messaggio: string;
  ticket_id: string | null;
  tipo: string;
  letta: boolean;
  data_creazione: string;
  destinatario_id: string | null;
}

// destinatario_id NULL = notifica per tutti gli operatori autenticati.
// Valorizzato = solo per quell'operatore (es. "ticket assegnato a te").
export async function createNotification(data: {
  titolo: string;
  messaggio: string;
  ticket_id?: string;
  tipo?: string;
  destinatario_id?: string | null;
}): Promise<Notification> {
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO notifications (id, titolo, messaggio, ticket_id, tipo, letta, data_creazione, destinatario_id)
       VALUES (@id, @titolo, @messaggio, @ticket_id, @tipo, 0, @data_creazione, @destinatario_id)`
    )
    .run({
      id,
      titolo: data.titolo,
      messaggio: data.messaggio,
      ticket_id: data.ticket_id ?? null,
      tipo: data.tipo ?? "info",
      data_creazione: ts,
      destinatario_id: data.destinatario_id ?? null,
    });

  return {
    id,
    ...data,
    ticket_id: data.ticket_id ?? null,
    tipo: data.tipo ?? "info",
    letta: false,
    data_creazione: ts,
    destinatario_id: data.destinatario_id ?? null,
  };
}

// Una notifica e' "letta" per un operatore se esiste la riga in
// notifications_lette. La colonna notifications.letta non e' piu' consultata:
// era globale e rendeva la lettura di uno valida per tutti.
const SELEZIONE = `
  SELECT n.id, n.titolo, n.messaggio, n.ticket_id, n.tipo, n.data_creazione,
         n.destinatario_id,
         (l.notification_id IS NOT NULL) AS letta
  FROM notifications n
  LEFT JOIN notifications_lette l
    ON l.notification_id = n.id AND l.operatore_id = @operatore_id
`;

export async function listNotifications(opts: {
  operatoreId: string;
  solo_non_lette?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const limit = opts.limit ?? 50;
  const conditions = ["(n.destinatario_id IS NULL OR n.destinatario_id = @operatore_id)"];
  if (opts.solo_non_lette) conditions.push("l.notification_id IS NULL");
  const rows = await db
    .prepare(
      `${SELEZIONE}
       WHERE ${conditions.join(" AND ")}
       ORDER BY n.data_creazione DESC
       LIMIT @limit`
    )
    .all({ operatore_id: opts.operatoreId, limit });
  return rows.map((r) => ({ ...r, letta: !!r.letta })) as unknown as Notification[];
}

export async function getUnreadCount(operatoreId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM notifications n
       LEFT JOIN notifications_lette l
         ON l.notification_id = n.id AND l.operatore_id = @operatore_id
       WHERE (n.destinatario_id IS NULL OR n.destinatario_id = @operatore_id)
         AND l.notification_id IS NULL`
    )
    .get({ operatore_id: operatoreId });
  return (row?.n as number) ?? 0;
}

// Elenco e conteggio in UNA richiesta al DB. La campanella li chiede sempre
// insieme, e separatamente erano due viaggi di rete ogni volta.
export async function listNotificationsConConteggio(opts: {
  operatoreId: string;
  solo_non_lette?: boolean;
  limit?: number;
}): Promise<{ notifications: Notification[]; count: number }> {
  const limit = opts.limit ?? 50;
  const conditions = ["(n.destinatario_id IS NULL OR n.destinatario_id = @operatore_id)"];
  if (opts.solo_non_lette) conditions.push("l.notification_id IS NULL");
  const [rows, conteggio] = await db.batchRead([
    {
      sql: `${SELEZIONE}
       WHERE ${conditions.join(" AND ")}
       ORDER BY n.data_creazione DESC
       LIMIT @limit`,
      params: { operatore_id: opts.operatoreId, limit },
    },
    {
      sql: `SELECT COUNT(*) AS n
       FROM notifications n
       LEFT JOIN notifications_lette l
         ON l.notification_id = n.id AND l.operatore_id = @operatore_id
       WHERE (n.destinatario_id IS NULL OR n.destinatario_id = @operatore_id)
         AND l.notification_id IS NULL`,
      params: { operatore_id: opts.operatoreId },
    },
  ]);
  return {
    notifications: rows.map((r) => ({ ...r, letta: !!r.letta })) as unknown as Notification[],
    count: (conteggio[0]?.n as number) ?? 0,
  };
}

export async function markAsRead(id: string, operatoreId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications_lette (notification_id, operatore_id, data)
       VALUES (@notification_id, @operatore_id, @data)
       ON CONFLICT (notification_id, operatore_id) DO NOTHING`
    )
    .run({
      notification_id: id,
      operatore_id: operatoreId,
      data: new Date().toISOString(),
    });
}

export async function markAllAsRead(operatoreId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notifications_lette (notification_id, operatore_id, data)
       SELECT n.id, @operatore_id, @data
       FROM notifications n
       WHERE (n.destinatario_id IS NULL OR n.destinatario_id = @operatore_id)
         AND NOT EXISTS (
           SELECT 1 FROM notifications_lette l
           WHERE l.notification_id = n.id AND l.operatore_id = @operatore_id
         )`
    )
    .run({ operatore_id: operatoreId, data: new Date().toISOString() });
}
