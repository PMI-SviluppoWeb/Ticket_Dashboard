import { db } from "./db";
import { invocaModello, providerAttivo } from "./ai-provider";
import "server-only";

// Accesso dati e invocazione degli agenti AI.
//
// Un agente = system prompt + modello (OpenRouter, stessa chiave della
// classificazione email). L'esecuzione è sincrona: la route POST chiama
// eseguiAgente(), che logga tutto in agenti_esecuzioni (input, output,
// stato, durata, token) — quel log è ciò che la UI visualizza.
//
// I "strumenti" sono un JSON riservato: oggi sempre [], l'architettura è
// pronta per aggiungere tool-calling senza cambiare schema.

import type {
  Agente,
  AgenteEsecuzione,
  AgenteInput,
  RuoloAgente,
} from "./types";

const MODELLO_DEFAULT = "deepseek/deepseek-v4.1-flash-1017";

interface AgenteRow {
  id: string;
  nome: string;
  descrizione: string | null;
  ruolo: string;
  modello: string;
  system_prompt: string;
  strumenti: string;
  attivo: number;
  creato_da: string | null;
  data_creazione: string;
  data_aggiornamento: string;
}

const RUOLI_VALIDI: RuoloAgente[] = ["assistente", "contenuti", "clienti", "custom"];

function aTipo(r: AgenteRow): Agente {
  let strumenti: string[] = [];
  try {
    const parsed = JSON.parse(r.strumenti);
    if (Array.isArray(parsed)) strumenti = parsed.filter((s) => typeof s === "string");
  } catch {
    // JSON corrotto: agente comunque utilizzabile senza strumenti.
  }
  return {
    id: r.id,
    nome: r.nome,
    descrizione: r.descrizione,
    ruolo: (RUOLI_VALIDI.includes(r.ruolo as RuoloAgente) ? r.ruolo : "custom") as RuoloAgente,
    modello: r.modello,
    system_prompt: r.system_prompt,
    strumenti,
    attivo: Number(r.attivo) === 1,
    creato_da: r.creato_da,
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
  };
}

const SELECT_AGENTI = `SELECT id, nome, descrizione, ruolo, modello, system_prompt,
  strumenti, attivo, creato_da, data_creazione, data_aggiornamento FROM agenti`;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function listaAgenti(opts?: { soloAttivi?: boolean }): Promise<Agente[]> {
  const sql = opts?.soloAttivi
    ? `${SELECT_AGENTI} WHERE attivo = 1 ORDER BY nome`
    : `${SELECT_AGENTI} ORDER BY nome`;
  const rows = await db.prepare(sql).all();
  return (rows as unknown as AgenteRow[]).map(aTipo);
}

export async function getAgente(id: string): Promise<Agente | null> {
  const row = await db.prepare(`${SELECT_AGENTI} WHERE id = ?`).get(id);
  return row ? aTipo(row as unknown as AgenteRow) : null;
}

export type EsitoSalvataggioAgente =
  | { ok: true; agente: Agente }
  | { ok: false; error: string };

function validaInput(input: Partial<AgenteInput>, parziale: boolean): string | null {
  if (!parziale || input.nome !== undefined) {
    if (typeof input.nome !== "string" || !input.nome.trim() || input.nome.length > 200) {
      return "Nome agente non valido.";
    }
  }
  if (input.ruolo !== undefined && !RUOLI_VALIDI.includes(input.ruolo as RuoloAgente)) {
    return "Ruolo non valido.";
  }
  if (!parziale || input.system_prompt !== undefined) {
    if (typeof input.system_prompt !== "string" || !input.system_prompt.trim()) {
      return "Il prompt di sistema è obbligatorio.";
    }
  }
  if (input.descrizione !== undefined && input.descrizione.length > 2000) {
    return "Descrizione troppo lunga.";
  }
  return null;
}

export async function creaAgente(
  input: AgenteInput,
  operatoreId?: string
): Promise<EsitoSalvataggioAgente> {
  const errore = validaInput(input, false);
  if (errore) return { ok: false, error: errore };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO agenti (id, nome, descrizione, ruolo, modello, system_prompt,
        strumenti, attivo, creato_da, data_creazione, data_aggiornamento)
       VALUES (@id, @nome, @descrizione, @ruolo, @modello, @system_prompt,
        @strumenti, @attivo, @creato_da, @now, @now)`
    )
    .run({
      id,
      nome: input.nome.trim(),
      descrizione: input.descrizione?.trim() || null,
      ruolo: input.ruolo ?? "assistente",
      modello: input.modello?.trim() || MODELLO_DEFAULT,
      system_prompt: input.system_prompt.trim(),
      strumenti: JSON.stringify(input.strumenti ?? []),
      attivo: input.attivo === false ? 0 : 1,
      creato_da: operatoreId ?? null,
      now,
    });

  const agente = await getAgente(id);
  if (!agente) return { ok: false, error: "Errore durante il salvataggio." };
  return { ok: true, agente };
}

export async function aggiornaAgente(
  id: string,
  input: Partial<AgenteInput>
): Promise<EsitoSalvataggioAgente> {
  const corrente = await getAgente(id);
  if (!corrente) return { ok: false, error: "Agente non trovato." };

  const errore = validaInput(input, true);
  if (errore) return { ok: false, error: errore };

  const campi: string[] = ["data_aggiornamento = @now"];
  const params: Record<string, string | number | null> = { id, now: new Date().toISOString() };

  const assegna = (col: string, valore: string | number | null) => {
    campi.push(`${col} = @${col}`);
    params[col] = valore;
  };

  if (input.nome !== undefined) assegna("nome", input.nome.trim());
  if (input.descrizione !== undefined) assegna("descrizione", input.descrizione.trim() || null);
  if (input.ruolo !== undefined) assegna("ruolo", input.ruolo);
  if (input.modello !== undefined) assegna("modello", input.modello.trim() || MODELLO_DEFAULT);
  if (input.system_prompt !== undefined) assegna("system_prompt", input.system_prompt.trim());
  if (input.strumenti !== undefined) assegna("strumenti", JSON.stringify(input.strumenti));
  if (input.attivo !== undefined) assegna("attivo", input.attivo ? 1 : 0);

  await db
    .prepare(`UPDATE agenti SET ${campi.join(", ")} WHERE id = @id`)
    .run(params);

  const agente = await getAgente(id);
  if (!agente) return { ok: false, error: "Agente non trovato dopo l'aggiornamento." };
  return { ok: true, agente };
}

export async function eliminaAgente(id: string): Promise<{ ok: boolean; error?: string }> {
  const corrente = await getAgente(id);
  if (!corrente) return { ok: false, error: "Agente non trovato." };
  // Le esecuzioni restano come storico? No: senza agente diventerebbero
  // orfane in UI. Si eliminano a cascata (la FK non è enfata, quindi via
  // esplicita).
  await db.prepare("DELETE FROM agenti_esecuzioni WHERE agente_id = ?").run(id);
  await db.prepare("DELETE FROM agenti WHERE id = ?").run(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Esecuzione
// ---------------------------------------------------------------------------
interface EsecuzioneRow {
  id: string;
  agente_id: string;
  input_utente: string;
  output: string | null;
  stato: string;
  errore: string | null;
  modello: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  durata_ms: number | null;
  operatore_id: string | null;
  contesto: string | null;
  data_creazione: string;
}

function aTipoEsecuzione(r: EsecuzioneRow): AgenteEsecuzione {
  let contesto: Record<string, unknown> | null = null;
  if (r.contesto) {
    try {
      const parsed = JSON.parse(r.contesto);
      if (parsed && typeof parsed === "object") contesto = parsed;
    } catch {
      // contesto corrotto: si mostra come assente
    }
  }
  return {
    id: r.id,
    agente_id: r.agente_id,
    input_utente: r.input_utente,
    output: r.output,
    stato: (r.stato as AgenteEsecuzione["stato"]) ?? "errore",
    errore: r.errore,
    modello: r.modello,
    prompt_tokens: r.prompt_tokens != null ? Number(r.prompt_tokens) : null,
    completion_tokens: r.completion_tokens != null ? Number(r.completion_tokens) : null,
    durata_ms: r.durata_ms != null ? Number(r.durata_ms) : null,
    operatore_id: r.operatore_id,
    contesto,
    data_creazione: r.data_creazione,
  };
}

const SELECT_ESECUZIONI = `SELECT id, agente_id, input_utente, output, stato, errore,
  modello, prompt_tokens, completion_tokens, durata_ms, operatore_id, contesto,
  data_creazione FROM agenti_esecuzioni`;

export async function listaEsecuzioni(
  agenteId: string,
  limit = 50
): Promise<AgenteEsecuzione[]> {
  const rows = await db
    .prepare(
      `${SELECT_ESECUZIONI} WHERE agente_id = ? ORDER BY data_creazione DESC LIMIT ?`
    )
    .all([agenteId, limit]);
  return (rows as unknown as EsecuzioneRow[]).map(aTipoEsecuzione);
}

export type EsitoEsecuzione =
  | { ok: true; esecuzione: AgenteEsecuzione }
  | { ok: false; error: string };

// Invoca l'agente attraverso il provider attivo (Hermes se configurato,
// altrimenti OpenRouter) e logga l'esecuzione completa.
// Sincrona per scelta (la struttura prevede un ritmo umano: la UI attende
// e mostra l'output; l'eventuale coda asincrona arriverà con i tool lunghi).
export async function eseguiAgente(opts: {
  agenteId: string;
  input: string;
  contesto?: Record<string, unknown>;
  operatoreId?: string;
}): Promise<EsitoEsecuzione> {
  const agente = await getAgente(opts.agenteId);
  if (!agente) return { ok: false, error: "Agente non trovato." };
  if (!agente.attivo) return { ok: false, error: "Agente disattivato." };

  const input = opts.input.trim();
  if (!input) return { ok: false, error: "Input vuoto." };

  if (providerAttivo() === "hermes") {
    if (!process.env.HERMES_API_KEY) {
      return { ok: false, error: "HERMES_BASE_URL presente ma HERMES_API_KEY mancante." };
    }
  } else if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY non configurata." };
  }

  const id = crypto.randomUUID();
  const inizio = Date.now();
  const now = new Date().toISOString();

  // Registro prima "in_corso": se la richiesta muore (crash, timeout), la
  // UI mostra comunque un tentativo invece di farlo sparire.
  await db
    .prepare(
      `INSERT INTO agenti_esecuzioni (id, agente_id, input_utente, stato, modello,
        operatore_id, contesto, data_creazione)
       VALUES (@id, @agente_id, @input_utente, 'in_corso', @modello,
        @operatore_id, @contesto, @now)`
    )
    .run({
      id,
      agente_id: agente.id,
      input_utente: input,
      modello: agente.modello,
      operatore_id: opts.operatoreId ?? null,
      contesto: opts.contesto ? JSON.stringify(opts.contesto) : null,
      now,
    });

  const registra = async (dati: {
    stato: "completata" | "errore";
    output?: string | null;
    errore?: string | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  }): Promise<void> => {
    await db
      .prepare(
        `UPDATE agenti_esecuzioni
         SET stato = @stato, output = @output, errore = @errore,
             prompt_tokens = @prompt_tokens, completion_tokens = @completion_tokens,
             durata_ms = @durata_ms
         WHERE id = @id`
      )
      .run({
        id,
        stato: dati.stato,
        output: dati.output ?? null,
        errore: dati.errore ?? null,
        prompt_tokens: dati.prompt_tokens ?? null,
        completion_tokens: dati.completion_tokens ?? null,
        durata_ms: Date.now() - inizio,
      });
  };

  try {
    // Provider parametrico: se HERMES_BASE_URL e' configurato la chiamata
    // passa dall'agent di Hermes (memoria persistente + skills + tool),
    // altrimenti va direttamente a OpenRouter come prima.
    const esito = await invocaModello({
      systemPrompt: agente.system_prompt,
      input,
      modello: agente.modello,
      // Sessione stabile per agente: continuita' della conversazione e
      // scope della memoria a lungo termine dedicate a questo agente.
      sessionId: `ticket-${agente.id}`,
      sessionKey: `ticket-dashboard:${agente.id}`,
    });

    await registra({
      stato: "completata",
      output: esito.output,
      prompt_tokens: esito.promptTokens,
      completion_tokens: esito.completionTokens,
    });

    const esecuzioni = await listaEsecuzioni(agente.id, 1);
    const esecuzione = esecuzioni[0];
    if (!esecuzione) return { ok: false, error: "Errore di log dell'esecuzione." };
    return { ok: true, esecuzione };
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "Errore sconosciuto.";
    await registra({ stato: "errore", errore: messaggio }).catch(() => undefined);
    return { ok: false, error: messaggio };
  }
}
