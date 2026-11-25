import "server-only";
import { db } from "./db";
import { registra } from "./registro";
import type {
  ClienteCommerciale,
  ClienteCommercialeInput,
  ClientePanoramica,
  PrioritaCommerciale,
  StatoClienteCommerciale,
} from "./types";

const STATI: StatoClienteCommerciale[] = [
  "attivo",
  "prospect",
  "a_rischio",
  "perso",
];
const PRIORITA: PrioritaCommerciale[] = ["alta", "media", "bassa"];

interface CommercialeRow {
  cliente_id: string;
  referente_tecnico: string | null;
  referente_decisionale: string | null;
  email_decisionale: string | null;
  telefono_decisionale: string | null;
  stato_cliente: string;
  settore: string | null;
  dimensione_aziendale: string | null;
  priorita_commerciale: string;
  note_commerciali: string | null;
  data_aggiornamento: string;
}

function aTipo(r: CommercialeRow): ClienteCommerciale {
  return {
    cliente_id: r.cliente_id,
    referente_tecnico: r.referente_tecnico,
    referente_decisionale: r.referente_decisionale,
    email_decisionale: r.email_decisionale,
    telefono_decisionale: r.telefono_decisionale,
    stato_cliente: (STATI.includes(r.stato_cliente as StatoClienteCommerciale)
      ? r.stato_cliente
      : "attivo") as StatoClienteCommerciale,
    settore: r.settore,
    dimensione_aziendale: r.dimensione_aziendale,
    priorita_commerciale: (PRIORITA.includes(
      r.priorita_commerciale as PrioritaCommerciale
    )
      ? r.priorita_commerciale
      : "media") as PrioritaCommerciale,
    note_commerciali: r.note_commerciali,
    data_aggiornamento: r.data_aggiornamento,
  };
}

const SELECT_COMMERCIALE = `SELECT cliente_id, referente_tecnico, referente_decisionale,
  email_decisionale, telefono_decisionale, stato_cliente, settore,
  dimensione_aziendale, priorita_commerciale, note_commerciali,
  data_aggiornamento FROM clienti_commerciale`;

export async function getCommerciale(
  clienteId: string
): Promise<ClienteCommerciale | null> {
  const row = await db
    .prepare(`${SELECT_COMMERCIALE} WHERE cliente_id = ?`)
    .get(clienteId);
  return row ? aTipo(row as unknown as CommercialeRow) : null;
}

export type EsitoCommerciale =
  | { ok: true; commerciale: ClienteCommerciale }
  | { ok: false; error: string };

function testo(
  v: string | null | undefined,
  max: number
): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function salvaCommerciale(
  clienteId: string,
  input: ClienteCommercialeInput,
  opts: { operatoreId?: string } = {}
): Promise<EsitoCommerciale> {
  const corrente = await getCommerciale(clienteId);

  if (
    input.stato_cliente !== undefined &&
    !STATI.includes(input.stato_cliente)
  ) {
    return { ok: false, error: "Stato cliente non valido." };
  }
  if (
    input.priorita_commerciale !== undefined &&
    !PRIORITA.includes(input.priorita_commerciale)
  ) {
    return { ok: false, error: "Priorità commerciale non valida." };
  }

  const ora = new Date().toISOString();
  const merged: ClienteCommercialeInput = {
    referente_tecnico:
      input.referente_tecnico !== undefined
        ? testo(input.referente_tecnico, 200)
        : corrente?.referente_tecnico ?? null,
    referente_decisionale:
      input.referente_decisionale !== undefined
        ? testo(input.referente_decisionale, 200)
        : corrente?.referente_decisionale ?? null,
    email_decisionale:
      input.email_decisionale !== undefined
        ? testo(input.email_decisionale, 200)
        : corrente?.email_decisionale ?? null,
    telefono_decisionale:
      input.telefono_decisionale !== undefined
        ? testo(input.telefono_decisionale, 60)
        : corrente?.telefono_decisionale ?? null,
    stato_cliente:
      input.stato_cliente ?? corrente?.stato_cliente ?? "attivo",
    settore:
      input.settore !== undefined
        ? testo(input.settore, 200)
        : corrente?.settore ?? null,
    dimensione_aziendale:
      input.dimensione_aziendale !== undefined
        ? testo(input.dimensione_aziendale, 200)
        : corrente?.dimensione_aziendale ?? null,
    priorita_commerciale:
      input.priorita_commerciale ??
      corrente?.priorita_commerciale ??
      "media",
    note_commerciali:
      input.note_commerciali !== undefined
        ? testo(input.note_commerciali, 5000)
        : corrente?.note_commerciali ?? null,
  };

  await db
    .prepare(
      `INSERT INTO clienti_commerciale (
         cliente_id, referente_tecnico, referente_decisionale, email_decisionale,
         telefono_decisionale, stato_cliente, settore, dimensione_aziendale,
         priorita_commerciale, note_commerciali, data_aggiornamento
       ) VALUES (
         @cliente_id, @referente_tecnico, @referente_decisionale, @email_decisionale,
         @telefono_decisionale, @stato_cliente, @settore, @dimensione_aziendale,
         @priorita_commerciale, @note_commerciali, @now
       )
       ON CONFLICT (cliente_id) DO UPDATE SET
         referente_tecnico = excluded.referente_tecnico,
         referente_decisionale = excluded.referente_decisionale,
         email_decisionale = excluded.email_decisionale,
         telefono_decisionale = excluded.telefono_decisionale,
         stato_cliente = excluded.stato_cliente,
         settore = excluded.settore,
         dimensione_aziendale = excluded.dimensione_aziendale,
         priorita_commerciale = excluded.priorita_commerciale,
         note_commerciali = excluded.note_commerciali,
         data_aggiornamento = excluded.data_aggiornamento`
    )
    .run({
      cliente_id: clienteId,
      referente_tecnico: merged.referente_tecnico ?? null,
      referente_decisionale: merged.referente_decisionale ?? null,
      email_decisionale: merged.email_decisionale ?? null,
      telefono_decisionale: merged.telefono_decisionale ?? null,
      stato_cliente: merged.stato_cliente ?? "attivo",
      settore: merged.settore ?? null,
      dimensione_aziendale: merged.dimensione_aziendale ?? null,
      priorita_commerciale: merged.priorita_commerciale ?? "media",
      note_commerciali: merged.note_commerciali ?? null,
      now: ora,
    });

  await registra({
    operatoreId: opts.operatoreId ?? null,
    azione: "cliente.commerciale_aggiornato",
    entita: "cliente",
    entitaId: clienteId,
    dettagli: { campi: Object.keys(input) },
  });

  const aggiornato = await getCommerciale(clienteId);
  if (!aggiornato) {
    return { ok: false, error: "Scheda commerciale non salvata." };
  }
  return { ok: true, commerciale: aggiornato };
}

interface PanoramicaRow {
  id: string;
  ragione_sociale: string;
  nome_contatto: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  provincia: string | null;
  stato_cliente: string | null;
  priorita_commerciale: string | null;
  settore: string | null;
  ticket_aperti: number | null;
  minuti: number | null;
  questionari_compilati: number | null;
  ultimo_questionario: string | null;
}

// Elenco clienti admin con le metriche che servono a decidere su chi
// intervenire: ticket aperti, ore registrate, questionari compilati.
export async function listaClientiPanoramica(opts?: {
  q?: string;
  limit?: number;
}): Promise<ClientePanoramica[]> {
  const q = opts?.q?.trim();
  const limit = Math.min(Math.max(opts?.limit ?? 300, 1), 500);
  const adesso = new Date().toISOString();

  const rows = await db
    .prepare(
      `SELECT c.id, c.ragione_sociale, c.nome_contatto, c.email, c.telefono,
              c.citta, c.provincia,
              cc.stato_cliente, cc.priorita_commerciale, cc.settore,
              (
                SELECT COUNT(*) FROM tickets t
                WHERE t.eliminato_il IS NULL
                  AND t.stato IN ('NUOVO','IN_CORSO')
                  AND (t.cliente_id = c.id OR (t.cliente_id IS NULL AND t.cliente = c.ragione_sociale))
              ) AS ticket_aperti,
              (
                SELECT COALESCE(SUM(
                  (julianday(COALESCE(v.fine, @adesso)) - julianday(v.inizio)) * 1440
                ), 0)
                FROM voci_tempo v
                WHERE v.ticket_id IN (
                  SELECT t2.id FROM tickets t2
                  WHERE t2.eliminato_il IS NULL
                    AND (t2.cliente_id = c.id OR (t2.cliente_id IS NULL AND t2.cliente = c.ragione_sociale))
                )
              ) AS minuti,
              (
                SELECT COUNT(*) FROM questionari q
                WHERE q.cliente_id = c.id AND q.stato = 'compilato'
              ) AS questionari_compilati,
              (
                SELECT MAX(q.data_creazione) FROM questionari q
                WHERE q.cliente_id = c.id
              ) AS ultimo_questionario
       FROM clienti c
       LEFT JOIN clienti_commerciale cc ON cc.cliente_id = c.id
       WHERE c.attivo = 1
         AND (@q IS NULL OR lower(c.ragione_sociale) LIKE @q
              OR lower(COALESCE(c.nome_contatto, '')) LIKE @q
              OR lower(COALESCE(c.citta, '')) LIKE @q)
       ORDER BY c.ragione_sociale
       LIMIT @limit`
    )
    .all({
      q: q ? `%${q.toLowerCase()}%` : null,
      limit,
      adesso,
    });

  return (rows as unknown as PanoramicaRow[]).map((r) => ({
    id: String(r.id),
    ragione_sociale: String(r.ragione_sociale),
    nome_contatto: r.nome_contatto,
    email: r.email,
    telefono: r.telefono,
    citta: r.citta,
    provincia: r.provincia,
    stato_cliente: (STATI.includes(r.stato_cliente as StatoClienteCommerciale)
      ? r.stato_cliente
      : "attivo") as StatoClienteCommerciale,
    priorita_commerciale: (PRIORITA.includes(
      r.priorita_commerciale as PrioritaCommerciale
    )
      ? r.priorita_commerciale
      : "media") as PrioritaCommerciale,
    settore: r.settore,
    ticket_aperti: Number(r.ticket_aperti ?? 0),
    ore_minuti: Math.round(Number(r.minuti ?? 0)),
    questionari_compilati: Number(r.questionari_compilati ?? 0),
    ultimo_questionario: r.ultimo_questionario,
  }));
}
