import { db } from "./db";
import { getCliente } from "./clienti";
import { getTicket } from "./tickets";
import { registra } from "./registro";
import { EMAIL_PLACEHOLDER } from "./contatti";
import "server-only";
import type {
  Cliente,
  Rapportino,
  RapportinoInput,
  RapportinoVoce,
  StatoRapportino,
  Ticket,
} from "./types";

// ===========================================================================
// Rapportini di chiusura ticket.
//
// Un rapportino e' generato alla chiusura del ticket e contiene:
//  - i dati del CLIENTE (snapshot: non un join, cosi' il documento non cambia
//    se l'anagrafica viene aggiornata in seguito),
//  - le ORE lavorate (dalle voci del cronometro, con fallback sul tempo
//    effettivo/stimato del ticket),
//  - le NOTE aggiuntive dell'operatore,
//  - i riferimenti del ticket.
//
// L'invio ad Arca e' predisposto con le colonne arca_*, ma non configurato:
// lo stato resta "da_configurare" finche' non arriva l'integrazione.
// ===========================================================================

interface RapportinoRow {
  id: string;
  ticket_id: string;
  cliente_id: string | null;
  numero: string;
  stato: string;
  data_creazione: string;
  data_aggiornamento: string;
  data_chiusura: string | null;
  operatore_id: string | null;
  operatore: string | null;
  cliente_ragione_sociale: string;
  cliente_partita_iva: string | null;
  cliente_indirizzo: string | null;
  cliente_citta: string | null;
  cliente_provincia: string | null;
  cliente_cap: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  ticket_numero: string;
  modulo_software: string | null;
  sommario: string | null;
  descrizione: string | null;
  attivita: string | null;
  note_aggiuntive: string | null;
  minuti_totali: number;
  voci: string;
  arca_stato: string;
  arca_riferimento: string | null;
  arca_inviato_il: string | null;
  arca_errore: string | null;
  creato_da: string | null;
}

const STATI_VALIDI: StatoRapportino[] = [
  "bozza",
  "confermato",
  "esportato",
  "errore",
];

const SELECT_RAPPORTINI = `SELECT id, ticket_id, cliente_id, numero, stato,
  data_creazione, data_aggiornamento, data_chiusura, operatore_id, operatore,
  cliente_ragione_sociale, cliente_partita_iva, cliente_indirizzo, cliente_citta,
  cliente_provincia, cliente_cap, cliente_email, cliente_telefono, ticket_numero,
  modulo_software, sommario, descrizione, attivita, note_aggiuntive,
  minuti_totali, voci, arca_stato, arca_riferimento, arca_inviato_il,
  arca_errore, creato_da FROM rapportini`;

function parseVoci(testo: string | null): RapportinoVoce[] {
  if (!testo) return [];
  try {
    const parsed = JSON.parse(testo);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v === "object")
      .map((v) => ({
        operatore: String((v as RapportinoVoce).operatore ?? "Operatore"),
        minuti: Math.max(0, Math.round(Number((v as RapportinoVoce).minuti) || 0)),
        voci: Math.max(0, Math.round(Number((v as RapportinoVoce).voci) || 0)),
      }));
  } catch {
    return [];
  }
}

function aTipo(r: RapportinoRow): Rapportino {
  return {
    id: r.id,
    ticket_id: r.ticket_id,
    cliente_id: r.cliente_id,
    numero: r.numero,
    stato: (STATI_VALIDI.includes(r.stato as StatoRapportino)
      ? r.stato
      : "bozza") as StatoRapportino,
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
    data_chiusura: r.data_chiusura,
    operatore_id: r.operatore_id,
    operatore: r.operatore,
    cliente_ragione_sociale: r.cliente_ragione_sociale,
    cliente_partita_iva: r.cliente_partita_iva,
    cliente_indirizzo: r.cliente_indirizzo,
    cliente_citta: r.cliente_citta,
    cliente_provincia: r.cliente_provincia,
    cliente_cap: r.cliente_cap,
    cliente_email: r.cliente_email,
    cliente_telefono: r.cliente_telefono,
    ticket_numero: r.ticket_numero,
    modulo_software: r.modulo_software,
    sommario: r.sommario,
    descrizione: r.descrizione,
    attivita: r.attivita,
    note_aggiuntive: r.note_aggiuntive,
    minuti_totali: Number(r.minuti_totali) || 0,
    voci: parseVoci(r.voci),
    arca_stato: r.arca_stato,
    arca_riferimento: r.arca_riferimento,
    arca_inviato_il: r.arca_inviato_il,
    arca_errore: r.arca_errore,
    creato_da: r.creato_da,
  };
}

// Ore lavorate sul ticket: solo voci CHIUSE (una voce ancora in corso non ha
// un totale definitivo). Raggruppate per operatore per il dettaglio.
export async function oreVociTicket(
  ticketId: string
): Promise<{ totale: number; voci: RapportinoVoce[] }> {
  const rows = await db
    .prepare(
      `SELECT operatore, COUNT(*) AS voci,
              SUM((julianday(fine) - julianday(inizio)) * 24 * 60) AS minuti
       FROM voci_tempo
       WHERE ticket_id = ? AND fine IS NOT NULL
       GROUP BY operatore
       ORDER BY minuti DESC`
    )
    .all(ticketId);

  const voci = (rows as unknown as Array<{
    operatore: string | null;
    voci: number | null;
    minuti: number | null;
  }>).map((r) => ({
    operatore: r.operatore || "Operatore",
    minuti: Math.max(0, Math.round(Number(r.minuti ?? 0))),
    voci: Math.max(0, Math.round(Number(r.voci ?? 0))),
  }));

  return { totale: voci.reduce((acc, v) => acc + v.minuti, 0), voci };
}

export async function getRapportino(id: string): Promise<Rapportino | null> {
  const row = await db.prepare(`${SELECT_RAPPORTINI} WHERE id = ?`).get(id);
  return row ? aTipo(row as unknown as RapportinoRow) : null;
}

export async function getRapportinoPerTicket(
  ticketId: string
): Promise<Rapportino | null> {
  const row = await db
    .prepare(`${SELECT_RAPPORTINI} WHERE ticket_id = ?`)
    .get(ticketId);
  return row ? aTipo(row as unknown as RapportinoRow) : null;
}

export async function listaRapportini(opts?: {
  ticketId?: string;
  stato?: string;
  clienteId?: string;
  q?: string;
  limit?: number;
}): Promise<Rapportino[]> {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (opts?.ticketId) {
    where.push("ticket_id = @ticket_id");
    params.ticket_id = opts.ticketId;
  }
  if (opts?.stato && STATI_VALIDI.includes(opts.stato as StatoRapportino)) {
    where.push("stato = @stato");
    params.stato = opts.stato;
  }
  if (opts?.clienteId) {
    where.push("cliente_id = @cliente_id");
    params.cliente_id = opts.clienteId;
  }
  if (opts?.q && opts.q.trim()) {
    where.push(
      "(lower(numero) LIKE @q OR lower(cliente_ragione_sociale) LIKE @q OR lower(ticket_numero) LIKE @q)"
    );
    params.q = `%${opts.q.trim().toLowerCase()}%`;
  }
  params.limit = Math.min(Math.max(opts?.limit ?? 100, 1), 300);
  const rows = await db
    .prepare(
      `${SELECT_RAPPORTINI}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
       ORDER BY data_creazione DESC LIMIT @limit`
    )
    .all(params);
  return (rows as unknown as RapportinoRow[]).map(aTipo);
}

// Numero leggibile del rapportino, derivato dal numero ticket (univoco).
function numeroRapportino(ticket: Ticket): string {
  return `RAP-${ticket.numero.replace(/^TICK-/i, "")}`;
}

// Testo iniziale dell'attivita' svolta: sommario del ticket + soluzioni delle
// note tecniche. L'operatore puo' riscriverlo dal dettaglio del rapportino.
function attivitaDaTicket(ticket: Ticket): string {
  const parti: string[] = [];
  if (ticket.sommario_problema?.trim()) {
    parti.push(ticket.sommario_problema.trim());
  }
  for (const nota of ticket.note_tecniche ?? []) {
    const testo = (nota.soluzione || nota.problema || "").trim();
    if (!testo) continue;
    parti.push(nota.titolo ? `${nota.titolo}: ${testo}` : testo);
  }
  return parti.join("\n\n");
}

function minutiDaTicket(ticket: Ticket, totaleVoci: number): number {
  // I minuti possono arrivare dal DB anche come stringa numerica: si
  // normalizzano sempre a intero prima di salvarli nel rapportino.
  const effettivo = Number(ticket.tempo_effettivo_minuti ?? 0);
  if (Number.isFinite(effettivo) && effettivo > 0) return Math.round(effettivo);
  if (totaleVoci > 0) return Math.round(totaleVoci);
  const stimato = Number(ticket.tempo_stimato_minuti ?? 0);
  if (Number.isFinite(stimato) && stimato > 0) return Math.round(stimato);
  return 0;
}

// Il placeholder dei ticket senza recapito non e' un indirizzo: sul
// rapportino (documento destinato all'ERP) deve restare vuoto.
function emailRapportino(cliente: Cliente | null, ticket: Ticket): string | null {
  const email = cliente?.email ?? ticket.email ?? null;
  if (!email || email === EMAIL_PLACEHOLDER) return null;
  return email;
}

async function risolviCliente(ticket: Ticket): Promise<Cliente | null> {
  if (ticket.cliente_id) {
    const cliente = await getCliente(ticket.cliente_id);
    if (cliente) return cliente;
  }
  if (!ticket.cliente) return null;
  const riga = await db
    .prepare("SELECT id FROM clienti WHERE ragione_sociale = ?")
    .get(ticket.cliente);
  const id = riga?.id ? String(riga.id) : null;
  return id ? getCliente(id) : null;
}

export type EsitoRapportino =
  | { ok: true; rapportino: Rapportino }
  | { ok: false; error: string };

// Genera (o aggiorna, se ancora in bozza) il rapportino di un ticket chiuso.
// Su un rapportino gia' confermato o esportato NON si sovrascrive nulla:
// sono dati che l'operatore ha validato o che sono gia' partiti verso l'ERP.
export async function generaRapportinoDaTicket(
  ticketId: string,
  opts: { operatoreId?: string; operatore?: string } = {}
): Promise<EsitoRapportino> {
  const ticket = await getTicket(ticketId);
  if (!ticket) return { ok: false, error: "Ticket non trovato." };
  if (ticket.stato !== "CHIUSO") {
    return { ok: false, error: "Il rapportino si genera solo per un ticket chiuso." };
  }

  const esistente = await getRapportinoPerTicket(ticketId);
  if (esistente && esistente.stato !== "bozza") {
    // Confermato/esportato: si restituisce quello che c'e'.
    return { ok: true, rapportino: esistente };
  }

  const [cliente, ore] = await Promise.all([
    risolviCliente(ticket),
    oreVociTicket(ticketId),
  ]);
  const minuti = minutiDaTicket(ticket, ore.totale);
  const now = new Date().toISOString();

  if (esistente) {
    await db
      .prepare(
        `UPDATE rapportini SET
           cliente_id = @cliente_id,
           data_aggiornamento = @data_aggiornamento,
           data_chiusura = @data_chiusura,
           operatore_id = @operatore_id,
           operatore = @operatore,
           cliente_ragione_sociale = @cliente_ragione_sociale,
           cliente_partita_iva = @cliente_partita_iva,
           cliente_indirizzo = @cliente_indirizzo,
           cliente_citta = @cliente_citta,
           cliente_provincia = @cliente_provincia,
           cliente_cap = @cliente_cap,
           cliente_email = @cliente_email,
           cliente_telefono = @cliente_telefono,
           ticket_numero = @ticket_numero,
           modulo_software = @modulo_software,
           sommario = @sommario,
           descrizione = @descrizione,
           minuti_totali = @minuti_totali,
           voci = @voci
         WHERE id = @id`
      )
      .run({
        id: esistente.id,
        cliente_id: cliente?.id ?? ticket.cliente_id ?? null,
        data_aggiornamento: now,
        data_chiusura: ticket.data_chiusura,
        operatore_id: ticket.operatore_id ?? opts.operatoreId ?? null,
        operatore: ticket.operatore ?? opts.operatore ?? null,
        cliente_ragione_sociale: cliente?.ragione_sociale ?? ticket.cliente,
        cliente_partita_iva: cliente?.partita_iva ?? null,
        cliente_indirizzo: cliente?.indirizzo ?? null,
        cliente_citta: cliente?.citta ?? null,
        cliente_provincia: cliente?.provincia ?? null,
        cliente_cap: cliente?.cap ?? null,
        cliente_email: emailRapportino(cliente, ticket),
        cliente_telefono: cliente?.telefono ?? ticket.telefono ?? null,
        ticket_numero: ticket.numero,
        modulo_software: ticket.modulo_software,
        sommario: ticket.sommario_problema,
        descrizione: ticket.descrizione_dettagliata,
        minuti_totali: minuti,
        voci: JSON.stringify(ore.voci),
      });
    const aggiornato = await getRapportino(esistente.id);
    if (!aggiornato) return { ok: false, error: "Rapportino non aggiornato." };
    return { ok: true, rapportino: aggiornato };
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO rapportini (
         id, ticket_id, cliente_id, numero, stato, data_creazione,
         data_aggiornamento, data_chiusura, operatore_id, operatore,
         cliente_ragione_sociale, cliente_partita_iva, cliente_indirizzo,
         cliente_citta, cliente_provincia, cliente_cap, cliente_email,
         cliente_telefono, ticket_numero, modulo_software, sommario,
         descrizione, attivita, note_aggiuntive, minuti_totali, voci,
         arca_stato, creato_da
       ) VALUES (
         @id, @ticket_id, @cliente_id, @numero, 'bozza', @now,
         @now, @data_chiusura, @operatore_id, @operatore,
         @cliente_ragione_sociale, @cliente_partita_iva, @cliente_indirizzo,
         @cliente_citta, @cliente_provincia, @cliente_cap, @cliente_email,
         @cliente_telefono, @ticket_numero, @modulo_software, @sommario,
         @descrizione, @attivita, NULL, @minuti_totali, @voci,
         'da_configurare', @creato_da
       )`
    )
    .run({
      id,
      ticket_id: ticketId,
      cliente_id: cliente?.id ?? ticket.cliente_id ?? null,
      numero: numeroRapportino(ticket),
      now,
      data_chiusura: ticket.data_chiusura,
      operatore_id: ticket.operatore_id ?? opts.operatoreId ?? null,
      operatore: ticket.operatore ?? opts.operatore ?? null,
      cliente_ragione_sociale: cliente?.ragione_sociale ?? ticket.cliente,
      cliente_partita_iva: cliente?.partita_iva ?? null,
      cliente_indirizzo: cliente?.indirizzo ?? null,
      cliente_citta: cliente?.citta ?? null,
      cliente_provincia: cliente?.provincia ?? null,
      cliente_cap: cliente?.cap ?? null,
      cliente_email: emailRapportino(cliente, ticket),
      cliente_telefono: cliente?.telefono ?? ticket.telefono ?? null,
      ticket_numero: ticket.numero,
      modulo_software: ticket.modulo_software,
      sommario: ticket.sommario_problema,
      descrizione: ticket.descrizione_dettagliata,
      attivita: attivitaDaTicket(ticket),
      minuti_totali: minuti,
      voci: JSON.stringify(ore.voci),
      creato_da: opts.operatoreId ?? null,
    });

  await registra({
    operatoreId: opts.operatoreId ?? null,
    origine: "utente",
    azione: "rapportino.generato",
    entita: "rapportino",
    entitaId: id,
    dettagli: { ticket: ticket.numero, minuti, voci: ore.voci.length },
  });

  const creato = await getRapportino(id);
  if (!creato) return { ok: false, error: "Rapportino non creato." };
  return { ok: true, rapportino: creato };
}

export async function aggiornaRapportino(
  id: string,
  patch: RapportinoInput,
  opts: { operatoreId?: string } = {}
): Promise<EsitoRapportino> {
  const corrente = await getRapportino(id);
  if (!corrente) return { ok: false, error: "Rapportino non trovato." };
  if (corrente.stato === "esportato") {
    return {
      ok: false,
      error: "Rapportino gia' esportato: non e' piu' modificabile.",
    };
  }

  const campi: string[] = ["data_aggiornamento = @now"];
  const params: Record<string, string | number | null> = {
    id,
    now: new Date().toISOString(),
  };

  if (patch.attivita !== undefined) {
    campi.push("attivita = @attivita");
    params.attivita = patch.attivita?.trim() || null;
  }
  if (patch.note_aggiuntive !== undefined) {
    campi.push("note_aggiuntive = @note_aggiuntive");
    params.note_aggiuntive = patch.note_aggiuntive?.trim() || null;
  }
  if (patch.minuti_totali !== undefined) {
    const minuti = Math.max(0, Math.round(Number(patch.minuti_totali) || 0));
    campi.push("minuti_totali = @minuti_totali");
    params.minuti_totali = minuti;
  }
  if (patch.stato !== undefined) {
    if (patch.stato !== "bozza" && patch.stato !== "confermato") {
      return { ok: false, error: "Stato non valido." };
    }
    campi.push("stato = @stato");
    params.stato = patch.stato;
  }

  await db
    .prepare(`UPDATE rapportini SET ${campi.join(", ")} WHERE id = @id`)
    .run(params);

  await registra({
    operatoreId: opts.operatoreId ?? null,
    origine: "utente",
    azione: "rapportino.aggiornato",
    entita: "rapportino",
    entitaId: id,
    dettagli: { campi: Object.keys(patch) },
  });

  const aggiornato = await getRapportino(id);
  if (!aggiornato) return { ok: false, error: "Rapportino non trovato." };
  return { ok: true, rapportino: aggiornato };
}

export async function eliminaRapportino(
  id: string,
  opts: { operatoreId?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  const corrente = await getRapportino(id);
  if (!corrente) return { ok: false, error: "Rapportino non trovato." };
  await db.prepare("DELETE FROM rapportini WHERE id = ?").run(id);
  await registra({
    operatoreId: opts.operatoreId ?? null,
    origine: "utente",
    azione: "rapportino.eliminato",
    entita: "rapportino",
    entitaId: id,
    dettagli: { numero: corrente.numero, ticket: corrente.ticket_numero },
  });
  return { ok: true };
}
