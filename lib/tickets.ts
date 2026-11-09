import { db } from "./db";
import { invalidaMemo } from "./cache";
import { completaContatti, EMAIL_PLACEHOLDER } from "./contatti";
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
  TicketListRow,
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

// Senza i due testi lunghi (descrizione, note): le liste non li mostrano, e
// trasportarli costa quanto il resto della riga moltiplicato. Il dettaglio usa
// ROW_FIELDS.
const ROW_FIELDS_LIST = `
  id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema,
  priorita, stato, operatore,
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

  // Ticket e messaggi iniziali in un solo round-trip.
  const statements = [
    {
      sql: `INSERT INTO tickets (
              id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema,
              descrizione_dettagliata, priorita, stato, note, operatore,
              data_creazione, data_aggiornamento, data_chiusura
            ) VALUES (
              @id, @numero, @cliente, @contatto, @telefono, @email, @modulo_software, @sommario_problema,
              @descrizione_dettagliata, @priorita, 'NUOVO', @note, NULL,
              @data_creazione, @data_aggiornamento, NULL
            )`,
      params: {
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
      },
    },
    ...(input.messaggi ?? []).map((m) => ({
      sql: `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione)
            VALUES (@id, @ticketId, @ruolo, @contenuto, @data_creazione)`,
      params: {
        id: m.id ?? crypto.randomUUID(),
        ticketId: id,
        ruolo: m.ruolo,
        contenuto: m.contenuto,
        data_creazione: m.data_creazione ?? ts,
      },
    })),
  ];
  await db.batch(statements);
  // L'elenco dei moduli (usato dai filtri) e' memorizzato per 60 s: senza
  // questa riga un ticket creato con un modulo nuovo non comparirebbe nel
  // filtro fino alla scadenza.
  invalidaMemo("moduli");

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

export function dataIsoSql(col: string): string {
  return `(CASE WHEN ${col} LIKE '__/__/____, __:__'
    THEN substr(${col},7,4)||'-'||substr(${col},4,2)||'-'
         ||substr(${col},1,2)||'T'||substr(${col},13,5)
    ELSE ${col} END)`;
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
    where.push("stato IN ('NUOVO','IN_CORSO','RISOLTO')");
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

  const dataOrd = dataIsoSql("data_creazione");
  const order =
    opts.ordina === "data_asc"
      ? `${dataOrd} ASC, rowid ASC`
      : opts.ordina === "priorita"
        ? `CASE priorita WHEN 'ALTA' THEN 0 WHEN 'MEDIA' THEN 1 ELSE 2 END, ${dataOrd} DESC, rowid DESC`
        : `${dataOrd} DESC, rowid DESC`;

  // Conteggio e pagina nella STESSA richiesta al DB: con un DB remoto due
  // `Promise.all` sono ancora due viaggi di rete, solo sovrapposti.
  const [countRows, rows] = await db.batchRead([
    { sql: `SELECT COUNT(*) AS n FROM tickets ${whereSql}`, params },
    {
      sql: `SELECT ${ROW_FIELDS_LIST} FROM tickets ${whereSql}
         ORDER BY ${order} LIMIT @limit OFFSET @offset`,
      params: { ...params, limit: paginaSize, offset: (pagina - 1) * paginaSize },
    },
  ]);
  const totale = (countRows[0]?.n as number) ?? 0;
  const tickets = rows as unknown as TicketListRow[];

  return { tickets, totale, pagina, paginaSize };
}

export async function getTicket(id: string): Promise<Ticket | null> {
  // Riga + messaggi + note in UNA richiesta. Gli allegati si prendono con una
  // sottoquery su `note_tecnica_id`, cosi' anche loro stanno nello stesso
  // batch: non serve sapere gli id delle note prima (era il motivo per cui
  // erano una quarta richiesta).
  const [righe, messaggi, noteTecniche, allegati] = await db.batchRead([
    { sql: `SELECT ${ROW_FIELDS} FROM tickets WHERE id = ?`, params: [id] },
    {
      sql: `SELECT id, ruolo, contenuto, data_creazione FROM messages
       WHERE ticket_id = ? ORDER BY ${dataIsoSql("data_creazione")} ASC, rowid ASC`,
      params: [id],
    },
    {
      sql: `SELECT id, ticket_id, titolo, problema, soluzione, operatore, data_creazione
       FROM technical_notes WHERE ticket_id = ? ORDER BY ${dataIsoSql("data_creazione")} ASC, rowid ASC`,
      params: [id],
    },
    {
      sql: `SELECT id, note_tecnica_id, ticket_id, nome_file, nome_originale, dimensione, tipo_mime, data_creazione
       FROM allegati
       WHERE note_tecnica_id IN (SELECT id FROM technical_notes WHERE ticket_id = ?)
       ORDER BY ${dataIsoSql("data_creazione")} ASC, rowid ASC`,
      params: [id],
    },
  ]);

  const row = righe[0];
  if (!row) return null;

  const perNota = new Map<string, Allegato[]>();
  for (const a of allegati as unknown as Allegato[]) {
    const lista = perNota.get(a.note_tecnica_id);
    if (lista) lista.push(a);
    else perNota.set(a.note_tecnica_id, [a]);
  }
  for (const note of noteTecniche as unknown as TechnicalNote[]) {
    note.allegati = perNota.get(note.id) ?? [];
  }

  return {
    ...row,
    messaggi: messaggi as unknown as Message[],
    note_tecniche: noteTecniche as unknown as TechnicalNote[],
  } as unknown as Ticket;
}

export async function getTicketByNumero(numero: string): Promise<TicketRow | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM tickets WHERE numero = ?`)
    .get(numero);
  return (row as TicketRow | undefined) ?? null;
}

// `existing` permette al chiamante che ha gia' letto il ticket (es. la route
// PATCH per validare e decidere le email) di evitare una seconda lettura:
// ogni lettura sono 3 round-trip verso il DB remoto.
export async function updateTicket(
  id: string,
  patch: TicketUpdate,
  existing?: Ticket | null
): Promise<Ticket | null> {
  const corrente = existing ?? (await getTicket(id));
  if (!corrente) return null;

  const next: TicketUpdate = { ...patch };
  if (patch.note !== undefined) next.note = patch.note || null;
  if (patch.operatore !== undefined) next.operatore = patch.operatore || null;
  if (patch.telefono !== undefined) next.telefono = patch.telefono || null;
  // Email vuota -> placeholder, non NULL: la colonna e' NOT NULL su alcune
  // installazioni e il placeholder viene comunque trattato come "nessun
  // recapito" dall'interfaccia e dalle rotte di invio.
  if (patch.email !== undefined) next.email = patch.email || EMAIL_PLACEHOLDER;

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

  const finalStato = next.stato ?? corrente.stato;

  // Valori risultanti, ricostruiti in memoria per non rileggere il ticket:
  // la lettura finale era un altro giro di 3 round-trip.
  let dataChiusura = corrente.data_chiusura;
  let tempoStimato = corrente.tempo_stimato_minuti;
  let tempoEffettivo = next.tempo_effettivo_minuti !== undefined
    ? (next.tempo_effettivo_minuti ?? null)
    : corrente.tempo_effettivo_minuti;
  let dataInizioLavoro = corrente.data_inizio_lavoro;

  // Time tracking: set data_inizio_lavoro when transitioning to IN_CORSO
  if (finalStato === "IN_CORSO" && corrente.stato !== "IN_CORSO") {
    fields.push("data_inizio_lavoro = COALESCE(data_inizio_lavoro, @data_inizio_lavoro)");
    params.data_inizio_lavoro = ts;
    dataInizioLavoro = dataInizioLavoro ?? ts;
  }

  // Time tracking: calculate tempo_stimato_minuti when closing
  if (finalStato === "CHIUSO" || finalStato === "RISOLTO") {
    fields.push("data_chiusura = COALESCE(data_chiusura, @data_chiusura)");
    params.data_chiusura = ts;
    dataChiusura = dataChiusura ?? ts;

    // Auto-calculate estimated time if not already set
    if (corrente.tempo_stimato_minuti === null && corrente.data_inizio_lavoro) {
      const inizioLavoro = corrente.data_inizio_lavoro;
      const startTime = parseItalianDate(inizioLavoro);
      const endTime = parseItalianDate(ts);
      if (startTime && endTime) {
        const diffMs = endTime - startTime;
        const diffMinuti = Math.max(1, Math.round(diffMs / 60000));
        fields.push("tempo_stimato_minuti = @tempo_stimato_minuti");
        params.tempo_stimato_minuti = String(diffMinuti);
        tempoStimato = diffMinuti;
      }
    }
  } else if (corrente.stato === "CHIUSO" || corrente.stato === "RISOLTO") {
    fields.push("data_chiusura = NULL");
    // Clear time tracking fields when reopening
    fields.push("tempo_stimato_minuti = NULL");
    fields.push("tempo_effettivo_minuti = NULL");
    dataChiusura = null;
    tempoStimato = null;
    tempoEffettivo = null;
  }

  await db
    .prepare(`UPDATE tickets SET ${fields.join(", ")} WHERE id = @id`)
    .run(params);

  return {
    ...corrente,
    ...next,
    data_aggiornamento: ts,
    data_chiusura: dataChiusura,
    data_inizio_lavoro: dataInizioLavoro,
    tempo_stimato_minuti: tempoStimato,
    tempo_effettivo_minuti: tempoEffettivo,
  } as Ticket;
}

// I recapiti possono arrivare tutti dentro il testo libero di `contatto`
// (e' il comportamento del server MCP del centralino, soprattutto quando non
// e' aggiornato): qui si estraggono, si mettono nelle colonne giuste e si
// salvano. Serve alla pagina del ticket per mostrare email e telefono e per
// abilitare l'invio della risposta al cliente.
export async function sanificaContatti(ticket: Ticket): Promise<Ticket> {
  const contatti = completaContatti(
    {
      contatto: ticket.contatto,
      email: ticket.email,
      telefono: ticket.telefono,
    },
    ticket.contatto,
    ticket.descrizione_dettagliata
  );

  // Il placeholder e' "nessuna email": confrontato con null non deve
  // sembrare un cambiamento, altrimenti si riscrive a ogni lettura.
  const emailCorrente =
    ticket.email && ticket.email !== EMAIL_PLACEHOLDER ? ticket.email : null;

  const invariato =
    contatti.contatto === ticket.contatto &&
    (contatti.email ?? null) === emailCorrente &&
    (contatti.telefono ?? null) === (ticket.telefono ?? null);
  if (invariato) return ticket;

  try {
    const aggiornato = await updateTicket(ticket.id, contatti, ticket);
    return aggiornato ?? ticket;
  } catch (err) {
    console.error("Sanifica contatti non riuscita:", ticket.id, err);
    return ticket;
  }
}

// Accetta ENTRAMBI i formati: "14/09/2026, 17:30" (quello scritto da `now()`) e
// ISO. Serve perche' in tabella convivono: le righe vecchie sono italiane, e il
// giorno in cui si passera' a scrivere ISO questa funzione deve continuare a
// funzionare invece di restituire null e saltare il calcolo in silenzio.
function parseItalianDate(dateStr: string): number | null {
  const iso = Date.parse(dateStr);
  if (Number.isFinite(iso)) return iso;

  try {
    // Format: "14/09/2026, 17:30"
    const [datePart, timePart] = dateStr.split(", ");
    if (!datePart || !timePart) return null;
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if ([day, month, year, hour, minute].some((n) => !Number.isFinite(n))) return null;
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
  const operatore = input.operatore || null;
  const data_creazione = now();
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
      operatore,
      data_creazione,
    });
  // La riga si ricostruisce da cio' che abbiamo appena scritto: rileggerla
  // costava un altro viaggio verso il DB remoto per riportare gli stessi valori.
  // `allegati` e' vuoto per costruzione (nessun upload puo' precedere la nota).
  return {
    id,
    ticket_id: ticketId,
    titolo: input.titolo,
    problema: input.problema,
    soluzione: input.soluzione,
    operatore,
    data_creazione,
    allegati: [],
  };
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
