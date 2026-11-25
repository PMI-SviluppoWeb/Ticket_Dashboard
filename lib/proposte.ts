import "server-only";
import { db } from "./db";
import { getCliente } from "./clienti";
import { insertProgetto } from "./progetti";
import { insertAttivita } from "./attivita";
import { createNotification } from "./notifications";
import { registra } from "./registro";
import {
  payloadVuoto,
  validaPayloadProposta,
  type EsitoPayloadProposta,
} from "./proposte-schema";
import type {
  AgenteProposta,
  PropostaProgettoPayload,
  StatoProposta,
} from "./types";

const STATI: StatoProposta[] = ["in_attesa", "approvata", "rifiutata"];

interface PropostaRow {
  id: string;
  esecuzione_id: string | null;
  agente_id: string | null;
  conversazione_id: string | null;
  progetto_id: string | null;
  tipo: string;
  payload: string;
  stato: string;
  proposta_da: string | null;
  deciso_da: string | null;
  errore: string | null;
  data_creazione: string;
  data_decisione: string | null;
  agente_nome?: string | null;
  operatore_nome?: string | null;
}

function parsePayload(json: string): PropostaProgettoPayload {
  try {
    const parsed = JSON.parse(json);
    const esito = validaPayloadProposta(parsed);
    return esito.ok ? esito.payload : payloadVuoto();
  } catch {
    return payloadVuoto();
  }
}

function aTipo(r: PropostaRow): AgenteProposta {
  return {
    id: r.id,
    esecuzione_id: r.esecuzione_id,
    agente_id: r.agente_id,
    conversazione_id: r.conversazione_id,
    progetto_id: r.progetto_id,
    tipo: r.tipo,
    payload: parsePayload(r.payload),
    stato: (STATI.includes(r.stato as StatoProposta)
      ? r.stato
      : "in_attesa") as StatoProposta,
    proposta_da: r.proposta_da,
    deciso_da: r.deciso_da,
    errore: r.errore,
    data_creazione: r.data_creazione,
    data_decisione: r.data_decisione,
    agente_nome: r.agente_nome ?? null,
    operatore_nome: r.operatore_nome ?? null,
  };
}

const SELECT_PROPOSTA = `SELECT p.id, p.esecuzione_id, p.agente_id, p.conversazione_id,
  p.progetto_id, p.tipo, p.payload, p.stato, p.proposta_da, p.deciso_da, p.errore,
  p.data_creazione, p.data_decisione,
  a.nome AS agente_nome, o.nome AS operatore_nome
  FROM agenti_proposte p
  LEFT JOIN agenti a ON a.id = p.agente_id
  LEFT JOIN operatori o ON o.id = p.proposta_da`;

export async function getProposta(id: string): Promise<AgenteProposta | null> {
  const row = await db.prepare(`${SELECT_PROPOSTA} WHERE p.id = ?`).get(id);
  return row ? aTipo(row as unknown as PropostaRow) : null;
}

export async function listaProposte(opts: {
  // Se assente l'utente e' admin e vede tutto.
  operatoreId?: string;
  stato?: string;
  conversazioneId?: string;
  limit?: number;
}): Promise<AgenteProposta[]> {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (opts.operatoreId) {
    where.push("p.proposta_da = @operatore_id");
    params.operatore_id = opts.operatoreId;
  }
  if (opts.stato && STATI.includes(opts.stato as StatoProposta)) {
    where.push("p.stato = @stato");
    params.stato = opts.stato;
  }
  if (opts.conversazioneId) {
    where.push("p.conversazione_id = @conversazione_id");
    params.conversazione_id = opts.conversazioneId;
  }
  params.limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);

  const rows = await db
    .prepare(
      `${SELECT_PROPOSTA}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
       ORDER BY p.data_creazione DESC LIMIT @limit`
    )
    .all(params);
  return (rows as unknown as PropostaRow[]).map(aTipo);
}

export function puoGestireProposta(
  proposta: AgenteProposta | null,
  operatore: { id: string; ruolo: string }
): boolean {
  if (!proposta) return false;
  if (operatore.ruolo === "admin") return true;
  return proposta.proposta_da === operatore.id;
}

export type EsitoProposta =
  | { ok: true; proposta: AgenteProposta }
  | { ok: false; error: string };

// Creazione della PROPOSTA (non del progetto). Chiamata dal tool dell'agente.
export async function creaProposta(opts: {
  agenteId?: string | null;
  esecuzioneId?: string | null;
  conversazioneId?: string | null;
  operatoreId: string;
  payload: unknown;
}): Promise<EsitoProposta> {
  const validazione = validaPayloadProposta(opts.payload);
  if (!validazione.ok) return validazione;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO agenti_proposte (
         id, esecuzione_id, agente_id, conversazione_id, tipo, payload, stato,
         proposta_da, data_creazione
       ) VALUES (
         @id, @esecuzione_id, @agente_id, @conversazione_id, 'progetto_con_task',
         @payload, 'in_attesa', @proposta_da, @now
       )`
    )
    .run({
      id,
      esecuzione_id: opts.esecuzioneId ?? null,
      agente_id: opts.agenteId ?? null,
      conversazione_id: opts.conversazioneId ?? null,
      payload: JSON.stringify(validazione.payload),
      proposta_da: opts.operatoreId,
      now,
    });

  await registra({
    operatoreId: opts.operatoreId,
    origine: "agente",
    azione: "proposta.creata",
    entita: "agente_proposta",
    entitaId: id,
    dettagli: {
      agente_id: opts.agenteId ?? null,
      conversazione_id: opts.conversazioneId ?? null,
      attivita: validazione.payload.attivita.length,
    },
  });

  const proposta = await getProposta(id);
  if (!proposta) return { ok: false, error: "Proposta non creata." };
  return { ok: true, proposta };
}

export async function aggiornaProposta(
  id: string,
  payload: unknown,
  operatore: { id: string; ruolo: string }
): Promise<EsitoPayloadProposta & { proposta?: AgenteProposta }> {
  const proposta = await getProposta(id);
  if (!puoGestireProposta(proposta, operatore)) {
    return { ok: false, error: "Proposta non trovata." };
  }
  if (proposta!.stato !== "in_attesa") {
    return { ok: false, error: "La proposta non è più modificabile." };
  }

  const validazione = validaPayloadProposta(payload);
  if (!validazione.ok) return validazione;

  await db
    .prepare(
      `UPDATE agenti_proposte SET payload = @payload, errore = NULL
       WHERE id = @id AND stato = 'in_attesa'`
    )
    .run({ id, payload: JSON.stringify(validazione.payload) });

  const aggiornata = await getProposta(id);
  return { ok: true, payload: validazione.payload, proposta: aggiornata ?? undefined };
}

export type EsitoApprovazione =
  | {
      ok: true;
      proposta: AgenteProposta;
      progetto_id: string;
      progetto_codice: string;
      attivita_create: number;
    }
  | {
      ok: false;
      error: string;
      progetto_id?: string;
      attivita_create?: number;
    };

// Approvazione umana: qui, e solo qui, si crea il progetto reale e le attività.
export async function approvaProposta(
  id: string,
  operatore: { id: string; ruolo: string; nome: string }
): Promise<EsitoApprovazione> {
  const proposta = await getProposta(id);
  if (!puoGestireProposta(proposta, operatore)) {
    return { ok: false, error: "Proposta non trovata." };
  }
  if (proposta!.stato !== "in_attesa") {
    return { ok: false, error: "La proposta è già stata gestita." };
  }

  const validazione = validaPayloadProposta(proposta!.payload, {
    richiediCliente: true,
  });
  if (!validazione.ok) return validazione;
  const payload = validazione.payload;

  const clienteId = payload.progetto.cliente_id;
  if (!clienteId) {
    return { ok: false, error: "Seleziona il cliente prima di approvare." };
  }
  const cliente = await getCliente(clienteId);
  if (!cliente) {
    return { ok: false, error: "Cliente non trovato." };
  }

  let progetto;
  try {
    progetto = await insertProgetto({
      nome: payload.progetto.nome,
      descrizione: payload.progetto.descrizione || null,
      cliente_id: clienteId,
      stato: "PIANIFICATO",
      priorita: payload.progetto.priorita,
      responsabile: payload.progetto.responsabile,
      data_inizio: payload.progetto.data_inizio,
      data_fine: payload.progetto.data_fine,
      note: payload.progetto.note || null,
    });
  } catch (err) {
    const messaggio =
      err instanceof Error ? err.message : "Errore nella creazione del progetto.";
    await segnaErrore(id, messaggio);
    return { ok: false, error: messaggio };
  }

  let create = 0;
  try {
    for (const a of payload.attivita) {
      await insertAttivita({
        progetto_id: progetto.id,
        cliente_id: null,
        titolo: a.titolo,
        descrizione: a.descrizione || null,
        stato: "DA_FARE",
        priorita: a.priorita,
        data_scadenza: a.data_scadenza,
        assegnatario: a.assegnatario,
        persone: a.persone,
      });
      create += 1;
    }
  } catch (err) {
    const messaggio =
      err instanceof Error ? err.message : "Errore nella creazione delle attività.";
    await segnaErrore(id, messaggio);
    return {
      ok: false,
      error: `Progetto creato ma attività incomplete: ${messaggio}`,
      progetto_id: progetto.id,
      attivita_create: create,
    };
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE agenti_proposte
       SET stato = 'approvata', deciso_da = @deciso_da,
           data_decisione = @now, errore = NULL, progetto_id = @progetto_id
       WHERE id = @id`
    )
    .run({ id, deciso_da: operatore.id, now, progetto_id: progetto.id });

  await registra({
    operatoreId: operatore.id,
    origine: "utente",
    azione: "proposta.approvata",
    entita: "agente_proposta",
    entitaId: id,
    dettagli: {
      progetto_id: progetto.id,
      progetto_codice: progetto.codice,
      attivita: create,
    },
  });

  if (proposta!.proposta_da && proposta!.proposta_da !== operatore.id) {
    await createNotification({
      titolo: "Proposta approvata",
      messaggio: `Il progetto ${progetto.nome} (${progetto.codice}) è stato creato da ${operatore.nome}.`,
      tipo: "proposta",
      destinatario_id: proposta!.proposta_da,
    });
  }

  const aggiornata = await getProposta(id);
  if (!aggiornata) {
    return { ok: false, error: "Proposta non trovata dopo l'approvazione." };
  }
  return {
    ok: true,
    proposta: aggiornata,
    progetto_id: progetto.id,
    progetto_codice: progetto.codice,
    attivita_create: create,
  };
}

async function segnaErrore(id: string, errore: string): Promise<void> {
  await db
    .prepare(
      `UPDATE agenti_proposte SET errore = @errore
       WHERE id = @id AND stato = 'in_attesa'`
    )
    .run({ id, errore: errore.slice(0, 1000) })
    .catch(() => undefined);
}

export async function rifiutaProposta(
  id: string,
  operatore: { id: string; ruolo: string; nome: string }
): Promise<EsitoProposta> {
  const proposta = await getProposta(id);
  if (!puoGestireProposta(proposta, operatore)) {
    return { ok: false, error: "Proposta non trovata." };
  }
  if (proposta!.stato !== "in_attesa") {
    return { ok: false, error: "La proposta è già stata gestita." };
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE agenti_proposte
       SET stato = 'rifiutata', deciso_da = @deciso_da,
           data_decisione = @now, errore = NULL
       WHERE id = @id`
    )
    .run({ id, deciso_da: operatore.id, now });

  await registra({
    operatoreId: operatore.id,
    azione: "proposta.rifiutata",
    entita: "agente_proposta",
    entitaId: id,
  });

  if (proposta!.proposta_da && proposta!.proposta_da !== operatore.id) {
    await createNotification({
      titolo: "Proposta rifiutata",
      messaggio: `${operatore.nome} ha rifiutato la proposta di progetto.`,
      tipo: "proposta",
      destinatario_id: proposta!.proposta_da,
    });
  }

  const aggiornata = await getProposta(id);
  if (!aggiornata) return { ok: false, error: "Proposta non trovata." };
  return { ok: true, proposta: aggiornata };
}
