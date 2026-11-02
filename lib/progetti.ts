import { db } from "./db";
import { parsePersone, serializzaPersone } from "./persone";
import { deleteAttivita, eliminaAttivitaProgetto, listAttivitaProgetto } from "./attivita";
import { SOGLIA_SYNC_INLINE } from "./google-sync";
import type {
  Progetto,
  ProgettoInput,
  ProgettoListResult,
  ProgettoListRow,
  ProgettoTicket,
  ProgettoUpdate,
  StatoProgetto,
  TicketListRow,
} from "./types";

export const STATI_PROGETTO: StatoProgetto[] = [
  "PIANIFICATO",
  "IN_CORSO",
  "IN_PAUSA",
  "COMPLETATO",
  "ANNULLATO",
];

const ROW_FIELDS = `
  id, codice, nome, descrizione, cliente_id, stato, priorita, responsabile,
  persone, data_inizio, data_fine, note, attivo, data_creazione, data_aggiornamento
`;

const ROW_FIELDS_ALIASED = `
  p.id, p.codice, p.nome, p.descrizione, p.cliente_id, p.stato, p.priorita,
  p.responsabile, p.persone, p.data_inizio, p.data_fine, p.note, p.attivo,
  p.data_creazione, p.data_aggiornamento
`;

function nowISO(): string {
  return new Date().toISOString();
}

function normalizza(row: Record<string, unknown>): ProgettoListRow {
  return {
    ...row,
    attivo: !!row.attivo,
    // Coercizione esplicita: la barra di avanzamento fa aritmetica su questo
    // valore, e un NULL (nessuna attivita' completata) deve valere 0, non NaN.
    num_attivita_completate: Number(row.num_attivita_completate ?? 0),
    // La colonna e' JSON: i componenti ricevono sempre un array.
    persone: parsePersone(row.persone),
  } as unknown as ProgettoListRow;
}

export async function listProgetti(opts?: {
  q?: string;
  stato?: StatoProgetto | "TUTTI";
  cliente_id?: string;
  attivo?: boolean;
  pagina?: number;
  paginaSize?: number;
}): Promise<ProgettoListResult> {
  const pagina = Math.max(1, opts?.pagina ?? 1);
  const paginaSize = Math.min(100, Math.max(1, opts?.paginaSize ?? 25));

  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (opts?.stato && opts.stato !== "TUTTI") {
    where.push("p.stato = @stato");
    params.stato = opts.stato;
  }
  if (opts?.cliente_id) {
    where.push("p.cliente_id = @cliente_id");
    params.cliente_id = opts.cliente_id;
  }
  if (opts?.attivo !== undefined) {
    where.push("p.attivo = @attivo");
    params.attivo = opts.attivo ? 1 : 0;
  }

  const q = opts?.q?.trim();
  if (q) {
    where.push("(p.nome LIKE @q OR p.codice LIKE @q OR p.descrizione LIKE @q OR c.ragione_sociale LIKE @q)");
    params.q = `%${q}%`;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  // Conteggio e pagina nella STESSA richiesta al DB. Prima erano due `await`
  // in serie: con un database remoto sono due viaggi di rete.
  const [countRows, rows] = await db.batchRead([
    {
      sql: `SELECT COUNT(*) AS n FROM progetti p LEFT JOIN clienti c ON c.id = p.cliente_id ${whereSql}`,
      params,
    },
    {
      sql: `SELECT ${ROW_FIELDS_ALIASED},
              COALESCE(c.ragione_sociale, p.cliente_id) AS cliente_ragione_sociale,
              (SELECT COUNT(*) FROM attivita a WHERE a.progetto_id = p.id) AS num_attivita,
              (SELECT COUNT(*) FROM attivita a
                WHERE a.progetto_id = p.id AND a.stato = 'COMPLETATA') AS num_attivita_completate,
              (SELECT COUNT(*) FROM progetti_tickets pt WHERE pt.progetto_id = p.id) AS num_ticket
       FROM progetti p
       LEFT JOIN clienti c ON c.id = p.cliente_id
       ${whereSql}
       ORDER BY p.data_aggiornamento DESC, p.rowid DESC
       LIMIT @limit OFFSET @offset`,
      params: { ...params, limit: paginaSize, offset: (pagina - 1) * paginaSize },
    },
  ]);

  const totale = (countRows[0]?.n as number) ?? 0;
  const progetti = rows.map(normalizza);
  return { progetti, totale, pagina, paginaSize };
}

export async function getProgetto(id: string): Promise<Progetto | null> {
  const row = await db
    .prepare(
      `SELECT ${ROW_FIELDS_ALIASED},
              COALESCE(c.ragione_sociale, p.cliente_id) AS cliente_ragione_sociale
       FROM progetti p
       LEFT JOIN clienti c ON c.id = p.cliente_id
       WHERE p.id = ?`
    )
    .get(id);

  if (!row) return null;

  // Attivita' e ticket collegati sono indipendenti: letti in parallelo sono
  // UN round-trip invece di due in serie.
  const [attivita, tickets] = await Promise.all([
    listAttivitaProgetto(id),
    listTicketsProgetto(id),
  ]);

  return {
    ...normalizza(row),
    cliente_ragione_sociale: (row.cliente_ragione_sociale as string) ?? "",
    attivita,
    tickets,
  } as Progetto;
}

export async function insertProgetto(input: ProgettoInput): Promise<Progetto> {
  const id = crypto.randomUUID();
  const ts = nowISO();
  const codice = `PRG-${String(Date.now()).slice(-6)}`;

  await db
    .prepare(
      `INSERT INTO progetti (
         id, codice, nome, descrizione, cliente_id, stato, priorita, responsabile,
         persone, data_inizio, data_fine, note, attivo, data_creazione, data_aggiornamento
       ) VALUES (
         @id, @codice, @nome, @descrizione, @cliente_id, @stato, @priorita, @responsabile,
         @persone, @data_inizio, @data_fine, @note, 1, @data_creazione, @data_aggiornamento
       )`
    )
    .run({
      id,
      codice,
      nome: input.nome,
      descrizione: input.descrizione ?? null,
      cliente_id: input.cliente_id,
      stato: input.stato ?? "PIANIFICATO",
      priorita: input.priorita ?? "MEDIA",
      responsabile: input.responsabile ?? null,
      persone: serializzaPersone(input.persone),
      data_inizio: input.data_inizio ?? null,
      data_fine: input.data_fine ?? null,
      note: input.note ?? null,
      data_creazione: ts,
      data_aggiornamento: ts,
    });

  const progetto = await getProgetto(id);
  if (!progetto) throw new Error("Inserimento progetto non riuscito.");
  return progetto;
}

export async function updateProgetto(
  id: string,
  patch: ProgettoUpdate
): Promise<Progetto | null> {
  const existing = await getProgetto(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (patch.nome !== undefined) { sets.push("nome = @nome"); params.nome = patch.nome; }
  if (patch.descrizione !== undefined) { sets.push("descrizione = @descrizione"); params.descrizione = patch.descrizione ?? null; }
  if (patch.cliente_id !== undefined) { sets.push("cliente_id = @cliente_id"); params.cliente_id = patch.cliente_id; }
  if (patch.stato !== undefined) { sets.push("stato = @stato"); params.stato = patch.stato; }
  if (patch.priorita !== undefined) { sets.push("priorita = @priorita"); params.priorita = patch.priorita; }
  if (patch.responsabile !== undefined) { sets.push("responsabile = @responsabile"); params.responsabile = patch.responsabile ?? null; }
  if (patch.persone !== undefined) { sets.push("persone = @persone"); params.persone = serializzaPersone(patch.persone); }
  if (patch.data_inizio !== undefined) { sets.push("data_inizio = @data_inizio"); params.data_inizio = patch.data_inizio ?? null; }
  if (patch.data_fine !== undefined) { sets.push("data_fine = @data_fine"); params.data_fine = patch.data_fine ?? null; }
  if (patch.note !== undefined) { sets.push("note = @note"); params.note = patch.note ?? null; }
  if (patch.attivo !== undefined) { sets.push("attivo = @attivo"); params.attivo = patch.attivo ? 1 : 0; }

  sets.push("data_aggiornamento = @data_aggiornamento");
  params.data_aggiornamento = nowISO();

  await db.prepare(`UPDATE progetti SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getProgetto(id);
}

// Cancellazione a cascata ESPLICITA: le foreign key non sono applicate
// (nessun PRAGMA foreign_keys = ON nel progetto), quindi ON DELETE CASCADE
// non scatta. Await sequenziali: non esistono transazioni.
//
// Le attivita' passano da deleteAttivita e NON da una DELETE in chiaro:
// altrimenti la cancellazione non verrebbe propagata a Google Calendar.
// E' il motivo per cui questa funzione importa da lib/attivita.ts.
export async function deleteProgetto(id: string): Promise<boolean> {
  const attivita = await listAttivitaProgetto(id);

  // Oltre la soglia non si chiama Google inline per ogni attivita' (sarebbero
  // N richieste dentro una sola richiesta utente): si lasciano i tombstone,
  // che la riconciliazione smaltisce. In quel caso anche le DELETE vanno in
  // blocco: prima erano due query per attivita'.
  if (attivita.length <= SOGLIA_SYNC_INLINE) {
    for (const a of attivita) {
      await deleteAttivita(a.id);
    }
  } else {
    await eliminaAttivitaProgetto(id);
  }

  // Collegamenti e progetto in un solo round-trip: prima erano due query in
  // serie e i collegamenti venivano cancellati PRIMA di leggere le attivita'.
  const [, cancellato] = await db.batch([
    { sql: "DELETE FROM progetti_tickets WHERE progetto_id = @id", params: { id } },
    { sql: "DELETE FROM progetti WHERE id = @id", params: { id } },
  ]);

  return cancellato.changes > 0;
}

export async function countProgetti(): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM progetti").get();
  return (row?.n as number) ?? 0;
}

// ---------------------------------------------------------------------------
// Collegamenti progetto <-> ticket
//
// Tabella many-to-many: un ticket puo' comparire sotto piu' progetti. Il
// vincolo UNIQUE(progetto_id, ticket_id) impedisce il doppione e fa lanciare
// l'insert, che la rotta traduce in 409.
// ---------------------------------------------------------------------------

export async function listTicketsProgetto(progettoId: string): Promise<TicketListRow[]> {
  const rows = await db
    .prepare(
      `SELECT t.id, t.numero, t.cliente, t.contatto, t.telefono, t.email,
              t.modulo_software, t.sommario_problema,
              t.priorita, t.stato, t.operatore, t.data_creazione,
              t.data_aggiornamento, t.data_chiusura, t.data_inizio_lavoro,
              t.tempo_stimato_minuti, t.tempo_effettivo_minuti
       FROM tickets t
       JOIN progetti_tickets pt ON pt.ticket_id = t.id
       WHERE pt.progetto_id = @progetto_id
       ORDER BY t.data_creazione DESC`
    )
    .all({ progetto_id: progettoId });
  return rows as unknown as TicketListRow[];
}

export async function linkTicket(
  progettoId: string,
  ticketId: string
): Promise<ProgettoTicket> {
  const id = crypto.randomUUID();
  const dataCreazione = nowISO();
  await db
    .prepare(
      `INSERT INTO progetti_tickets (id, progetto_id, ticket_id, data_creazione)
       VALUES (@id, @progetto_id, @ticket_id, @data_creazione)`
    )
    .run({
      id,
      progetto_id: progettoId,
      ticket_id: ticketId,
      data_creazione: dataCreazione,
    });
  return { id, progetto_id: progettoId, ticket_id: ticketId, data_creazione: dataCreazione };
}

export async function unlinkTicket(progettoId: string, ticketId: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM progetti_tickets WHERE progetto_id = ? AND ticket_id = ?")
    .run([progettoId, ticketId]);
  return res.changes > 0;
}
