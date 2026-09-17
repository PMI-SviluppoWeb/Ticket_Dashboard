import { db } from "./db";
import type {
  Allegato,
  Message,
  Priorita,
  StatoTicket,
  Stats,
  TechnicalNote,
  Ticket,
  TicketInput,
  TicketListResult,
  TicketRow,
  TicketUpdate,
} from "./types";

export const STATI: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];
export const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

const ROW_FIELDS = `
  id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema,
  descrizione_dettagliata, priorita, stato, note, operatore,
  data_creazione, data_aggiornamento, data_chiusura,
  data_inizio_lavoro, tempo_stimato_minuti, tempo_effettivo_minuti
`;

function now(): string {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function createTicket(input: TicketInput): Promise<TicketRow> {
  const id = input.id ?? crypto.randomUUID();
  const numero =
    input.numero ?? `TICK-${String(Date.now()).slice(-6)}`;
  const ts = now();

  await db
    .prepare(
      `INSERT INTO tickets (
         id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema,
         descrizione_dettagliata, priorita, stato, note, operatore,
         data_creazione, data_aggiornamento, data_chiusura
       ) VALUES (
         @id, @numero, @cliente, @contatto, @telefono, @email, @modulo_software, @sommario_problema,
         @descrizione_dettagliata, @priorita, 'NUOVO', @note, NULL,
         @data_creazione, @data_aggiornamento, NULL
       )`
    )
    .run({
      id,
      numero,
      cliente: input.cliente,
      contatto: input.contatto,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      modulo_software: input.modulo_software,
      sommario_problema: input.sommario_problema,
      descrizione_dettagliata: input.descrizione_dettagliata,
      priorita: input.priorita,
      note: input.note ?? null,
      data_creazione: ts,
      data_aggiornamento: ts,
    });

  for (const m of input.messaggi ?? []) {
    await insertMessage(id, m);
  }

  return (await getTicket(id))!;
}

export async function insertMessage(
  ticketId: string,
  m: Pick<Message, "ruolo" | "contenuto"> & { id?: string; data_creazione?: string }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione)
       VALUES (@id, @ticketId, @ruolo, @contenuto, @data_creazione)`
    )
    .run({
      id: m.id ?? crypto.randomUUID(),
      ticketId,
      ruolo: m.ruolo,
      contenuto: m.contenuto,
      data_creazione: m.data_creazione ?? now(),
    });
}

export async function listTickets(opts: {
  stato?: StatoTicket | "TUTTI";
  priorita?: Priorita | "TUTTE";
  q?: string;
  modulo?: string;
  operatore?: string;
  pagina?: number;
  paginaSize?: number;
  ordina?: string;
}): Promise<TicketListResult> {
  const pagina = Math.max(1, opts.pagina ?? 1);
  const paginaSize = Math.min(100, Math.max(1, opts.paginaSize ?? 25));

  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (opts.stato && opts.stato !== "TUTTI") {
    where.push("stato = @stato");
    params.stato = opts.stato;
  } else {
    // When showing all tickets, exclude closed ones (they go in the dedicated section)
    where.push("stato != 'CHIUSO'");
  }
  if (opts.priorita && opts.priorita !== "TUTTE") {
    where.push("priorita = @priorita");
    params.priorita = opts.priorita;
  }
  if (opts.modulo) {
    where.push("modulo_software = @modulo");
    params.modulo = opts.modulo;
  }
  
  // Handle special operator filter: "__MY_AND_UNASSIGNED__:nome_operatore"
  // Shows tickets assigned to operator OR unassigned (NUOVO) tickets
  if (opts.operatore?.startsWith("__MY_AND_UNASSIGNED__:")) {
    const operatorName = opts.operatore.replace("__MY_AND_UNASSIGNED__:", "");
    where.push("(operatore = @operatore OR (operatore IS NULL AND stato = 'NUOVO'))");
    params.operatore = operatorName;
  } else if (opts.operatore) {
    where.push("operatore = @operatore");
    params.operatore = opts.operatore;
  }
  
  const q = opts.q?.trim();
  if (q) {
    where.push(`(
      cliente LIKE @q OR contatto LIKE @q OR modulo_software LIKE @q
      OR sommario_problema LIKE @q OR descrizione_dettagliata LIKE @q OR numero LIKE @q
    )`);
    params.q = `%${q}%`;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const order =
    opts.ordina === "data_asc"
      ? "data_creazione ASC"
      : opts.ordina === "priorita"
        ? `CASE priorita WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END, data_creazione DESC`
        : "data_creazione DESC";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM tickets ${whereSql}`)
    .get(params);
  const totale = (countRow?.n as number) ?? 0;

  const rows = await db
    .prepare(
      `SELECT ${ROW_FIELDS} FROM tickets ${whereSql}
       ORDER BY ${order} LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: paginaSize, offset: (pagina - 1) * paginaSize });
  const tickets = rows as unknown as TicketRow[];

  return { tickets, totale, pagina, paginaSize };
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const row = await db.prepare(`SELECT ${ROW_FIELDS} FROM tickets WHERE id = ?`).get(id);
  if (!row) return null;

  const messaggi = (await db
    .prepare(
      `SELECT id, ruolo, contenuto, data_creazione FROM messages
       WHERE ticket_id = ? ORDER BY data_creazione ASC, rowid ASC`
    )
    .all(id)) as unknown as Message[];

  const noteTecniche = (await db
    .prepare(
      `SELECT id, ticket_id, titolo, problema, soluzione, operatore, data_creazione
       FROM technical_notes WHERE ticket_id = ? ORDER BY data_creazione ASC, rowid ASC`
    )
    .all(id)) as unknown as TechnicalNote[];

  // Fetch attachments for each technical note
  for (const note of noteTecniche) {
    const allegati = (await db
      .prepare(
        `SELECT id, note_tecnica_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione
         FROM allegati WHERE note_tecnica_id = ? ORDER BY data_creazione ASC`
      )
      .all(note.id)) as unknown as Allegato[];
    note.allegati = allegati;
  }

  return { ...row, messaggi, note_tecniche: noteTecniche } as unknown as Ticket;
}

export async function getTicketByNumero(numero: string): Promise<TicketRow | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM tickets WHERE numero = ?`)
    .get(numero);
  return (row as TicketRow | undefined) ?? null;
}

export async function updateTicket(id: string, patch: TicketUpdate): Promise<Ticket | null> {
  const existing = await getTicket(id);
  if (!existing) return null;

  const next: TicketUpdate = { ...patch };
  if (patch.note !== undefined) next.note = patch.note || null;
  if (patch.operatore !== undefined) next.operatore = patch.operatore || null;
  if (patch.telefono !== undefined) next.telefono = patch.telefono || null;
  if (patch.email !== undefined) next.email = patch.email || null;

  const ts = now();
  const fields: string[] = ["data_aggiornamento = @data_aggiornamento"];
  const params: Record<string, string | null> = { id, data_aggiornamento: ts };

  if (next.stato !== undefined) {
    fields.push("stato = @stato");
    params.stato = next.stato;
  }
  if (next.priorita !== undefined) {
    fields.push("priorita = @priorita");
    params.priorita = next.priorita;
  }
  if (next.note !== undefined) {
    fields.push("note = @note");
    params.note = next.note;
  }
  if (next.operatore !== undefined) {
    fields.push("operatore = @operatore");
    params.operatore = next.operatore;
  }
  if (next.cliente !== undefined) {
    fields.push("cliente = @cliente");
    params.cliente = next.cliente;
  }
  if (next.contatto !== undefined) {
    fields.push("contatto = @contatto");
    params.contatto = next.contatto;
  }
  if (next.telefono !== undefined) {
    fields.push("telefono = @telefono");
    params.telefono = next.telefono;
  }
  if (next.email !== undefined) {
    fields.push("email = @email");
    params.email = next.email;
  }
  if (next.tempo_effettivo_minuti !== undefined) {
    fields.push("tempo_effettivo_minuti = @tempo_effettivo_minuti");
    params.tempo_effettivo_minuti = next.tempo_effettivo_minuti !== null ? String(next.tempo_effettivo_minuti) : null;
  }

  const finalStato = next.stato ?? existing.stato;

  // Time tracking: set data_inizio_lavoro when transitioning to IN_CORSO
  if (finalStato === "IN_CORSO" && existing.stato !== "IN_CORSO") {
    fields.push("data_inizio_lavoro = COALESCE(data_inizio_lavoro, @data_inizio_lavoro)");
    params.data_inizio_lavoro = ts;
  }

  // Time tracking: calculate tempo_stimato_minuti when closing
  if (finalStato === "CHIUSO" || finalStato === "RISOLTO") {
    fields.push("data_chiusura = COALESCE(data_chiusura, @data_chiusura)");
    params.data_chiusura = ts;

    // Auto-calculate estimated time if not already set
    if (existing.tempo_stimato_minuti === null && existing.data_inizio_lavoro) {
      const startTime = parseItalianDate(existing.data_inizio_lavoro);
      const endTime = parseItalianDate(ts);
      if (startTime && endTime) {
        const diffMs = endTime - startTime;
        const diffMinuti = Math.max(1, Math.round(diffMs / 60000));
        fields.push("tempo_stimato_minuti = @tempo_stimato_minuti");
        params.tempo_stimato_minuti = String(diffMinuti);
      }
    }
  } else if (existing.stato === "CHIUSO" || existing.stato === "RISOLTO") {
    fields.push("data_chiusura = NULL");
    // Clear time tracking fields when reopening
    fields.push("tempo_stimato_minuti = NULL");
    fields.push("tempo_effettivo_minuti = NULL");
  }

  await db
    .prepare(`UPDATE tickets SET ${fields.join(", ")} WHERE id = @id`)
    .run(params);
  return getTicket(id);
}

function parseItalianDate(dateStr: string): number | null {
  try {
    // Format: "14/09/2026, 17:30"
    const [datePart, timePart] = dateStr.split(", ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
  } catch {
    return null;
  }
}

export async function deleteTicket(id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
  return res.changes > 0;
}

const NOTE_FIELDS = `id, ticket_id, titolo, problema, soluzione, operatore, data_creazione`;

async function getTechnicalNote(id: string): Promise<TechnicalNote | null> {
  const row = await db
    .prepare(`SELECT ${NOTE_FIELDS} FROM technical_notes WHERE id = ?`)
    .get(id);
  return (row as TechnicalNote | undefined) ?? null;
}

export async function insertTechnicalNote(
  ticketId: string,
  input: {
    titolo: string;
    problema: string;
    soluzione: string;
    operatore?: string | null;
  }
): Promise<TechnicalNote> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO technical_notes (id, ticket_id, titolo, problema, soluzione, operatore, data_creazione)
       VALUES (@id, @ticketId, @titolo, @problema, @soluzione, @operatore, @data_creazione)`
    )
    .run({
      id,
      ticketId,
      titolo: input.titolo,
      problema: input.problema,
      soluzione: input.soluzione,
      operatore: input.operatore || null,
      data_creazione: now(),
    });
  return (await getTechnicalNote(id))!;
}

export async function updateTechnicalNote(
  id: string,
  patch: Partial<Pick<TechnicalNote, "titolo" | "problema" | "soluzione" | "operatore">>
): Promise<TechnicalNote | null> {
  const fields: string[] = [];
  const params: Record<string, string | null> = { id };

  if (patch.titolo !== undefined) {
    fields.push("titolo = @titolo");
    params.titolo = patch.titolo;
  }
  if (patch.problema !== undefined) {
    fields.push("problema = @problema");
    params.problema = patch.problema;
  }
  if (patch.soluzione !== undefined) {
    fields.push("soluzione = @soluzione");
    params.soluzione = patch.soluzione;
  }
  if (patch.operatore !== undefined) {
    fields.push("operatore = @operatore");
    params.operatore = patch.operatore || null;
  }

  if (fields.length === 0) return getTechnicalNote(id);
  await db
    .prepare(`UPDATE technical_notes SET ${fields.join(", ")} WHERE id = @id`)
    .run(params);
  return getTechnicalNote(id);
}

export async function deleteTechnicalNote(id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM technical_notes WHERE id = ?").run(id);
  return res.changes > 0;
}

export async function getStats(): Promise<Stats> {
  const row = (await db
    .prepare(
      `SELECT
         COUNT(*) AS totale,
         SUM(CASE WHEN stato = 'NUOVO' THEN 1 ELSE 0 END) AS nuovi,
         SUM(CASE WHEN stato = 'IN_CORSO' THEN 1 ELSE 0 END) AS inCorso,
         SUM(CASE WHEN stato = 'RISOLTO' THEN 1 ELSE 0 END) AS risolti,
         SUM(CASE WHEN stato = 'CHIUSO' THEN 1 ELSE 0 END) AS chiusi,
         SUM(CASE WHEN priorita = 'ALTA' THEN 1 ELSE 0 END) AS prioritaAlta,
         SUM(CASE WHEN priorita = 'MEDIA' THEN 1 ELSE 0 END) AS prioritaMedia,
         SUM(CASE WHEN priorita = 'BASSA' THEN 1 ELSE 0 END) AS prioritaBassa
       FROM tickets`
    )
    .get()) as unknown as {
    totale: number;
    nuovi: number;
    inCorso: number;
    risolti: number;
    chiusi: number;
    prioritaAlta: number;
    prioritaMedia: number;
    prioritaBassa: number;
  };

  const aperti = (row.nuovi ?? 0) + (row.inCorso ?? 0);

  return {
    totale: row.totale ?? 0,
    nuovi: row.nuovi ?? 0,
    inCorso: row.inCorso ?? 0,
    risolti: row.risolti ?? 0,
    chiusi: row.chiusi ?? 0,
    prioritaAlta: row.prioritaAlta ?? 0,
    prioritaMedia: row.prioritaMedia ?? 0,
    prioritaBassa: row.prioritaBassa ?? 0,
    aperti,
  };
}

export async function getModuli(): Promise<string[]> {
  const rows = (await db
    .prepare(`SELECT DISTINCT modulo_software FROM tickets ORDER BY modulo_software ASC`)
    .all()) as unknown as { modulo_software: string }[];
  return rows.map((r) => r.modulo_software);
}
