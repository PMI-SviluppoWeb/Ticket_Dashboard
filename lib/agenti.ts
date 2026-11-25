import { db } from "./db";
import { invocaModello, providerAttivo, type MessaggioChat, type ProviderAI } from "./ai-provider";
import { eseguiStrumento, strumentiPerAgente } from "./agenti-tools";
import { TUTTI_STRUMENTI } from "./agenti-tools-def";
import { getTicket } from "./tickets";
import { getCliente } from "./clienti";
import {
  componiStoricoConversazione,
  formattaContestoCliente,
  formattaContestoTicket,
  formattaContestoProgetto,
  type EsecuzioneStorico,
  type MessaggioStorico,
} from "./agenti-contesto";
import "server-only";

// Accesso dati e invocazione degli agenti AI.
//
// Un agente = system prompt + modello + (opzionale) strumenti "dati
// dell'app". L'esecuzione è sincrona e viene loggata integralmente in
// agenti_esecuzioni (input, output, stato, durata, token, trace) — quel
// log è ciò che la UI visualizza.
//
// Provider per esecuzione (risolto in eseguiAgente):
//  - agente CON strumenti  → SEMPRE OpenRouter + loop strumenti IN-APP
//    (le query sul DB le esegue la nostra app: lib/agenti-tools.ts).
//    Hermes non riceve mai i tools: non ha accesso al nostro DB.
//  - agente SENZA strumenti → colonna agenti.provider ('auto' = globale:
//    Hermes se configurato, altrimenti OpenRouter) con memoria di sessione.

import type {
  Agente,
  AgenteAssegnazione,
  AgenteAttivita,
  AgenteConversazione,
  AgenteEsecuzione,
  AgenteInput,
  AgentePerOperatore,
  ProviderAgente,
  RuoloAgente,
  VoceTraccia,
} from "./types";

const MODELLO_DEFAULT =
  process.env.AI_MODEL_DEFAULT ?? "deepseek/deepseek-v4.1-flash-1017";

// Limite di turni del loop strumenti (1 turno = 1 chiamata modello).
// Oltre: un'ultima chiamata FORZATA senza tools per produrre la risposta.
const MAX_TURNI_STRUMENTI = 6;

interface AgenteRow {
  id: string;
  nome: string;
  descrizione: string | null;
  ruolo: string;
  modello: string;
  system_prompt: string;
  istruzioni_default: string | null;
  messaggio_iniziale: string | null;
  strumenti: string;
  provider: string | null;
  attivo: number;
  creato_da: string | null;
  proprietario_id: string | null;
  visibilita: string | null;
  data_creazione: string;
  data_aggiornamento: string;
}

const RUOLI_VALIDI: RuoloAgente[] = ["assistente", "contenuti", "clienti", "custom"];
const PROVIDER_VALIDI: ProviderAgente[] = ["auto", "openrouter", "hermes"];

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
    istruzioni_default: r.istruzioni_default,
    messaggio_iniziale: r.messaggio_iniziale,
    strumenti,
    provider: (
      r.provider && PROVIDER_VALIDI.includes(r.provider as ProviderAgente)
        ? r.provider
        : "auto"
    ) as ProviderAgente,
    attivo: Number(r.attivo) === 1,
    creato_da: r.creato_da,
    proprietario_id: r.proprietario_id,
    visibilita: r.visibilita === "personale" ? "personale" : "libreria",
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
  };
}

const SELECT_AGENTI = `SELECT id, nome, descrizione, ruolo, modello, system_prompt,
  istruzioni_default, messaggio_iniziale, strumenti, provider, attivo, creato_da,
  proprietario_id, visibilita, data_creazione, data_aggiornamento FROM agenti`;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function listaAgenti(opts?: {
  soloAttivi?: boolean;
  // Se valorizzato, restituisce la libreria piu' gli agenti personali di
  // quell'operatore (usato dalle route aperte agli operatori).
  operatoreId?: string;
}): Promise<Agente[]> {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (opts?.soloAttivi) where.push("attivo = 1");
  if (opts?.operatoreId) {
    where.push("(visibilita = 'libreria' OR proprietario_id = @operatore_id)");
    params.operatore_id = opts.operatoreId;
  }
  const sql = `${SELECT_AGENTI}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY nome`;
  const rows = await db.prepare(sql).all(params);
  return (rows as unknown as AgenteRow[]).map(aTipo);
}

// Agenti visibili a un operatore, con lo stato "pinnato" della sua barra
// rapida. Regola: i PROPRI agenti personali sempre; gli agenti di libreria a
// meno che un'assegnazione esplicita non li abbia disabilitati per lui.
const SELECT_AGENTI_OPERATORE = `SELECT a.id, a.nome, a.descrizione, a.ruolo,
  a.modello, a.system_prompt, a.istruzioni_default, a.messaggio_iniziale,
  a.strumenti, a.provider, a.attivo, a.creato_da, a.proprietario_id,
  a.visibilita, a.data_creazione, a.data_aggiornamento,
  COALESCE(s.pinnato, 0) AS pinnato
  FROM agenti a
  LEFT JOIN agenti_assegnazioni s
    ON s.agente_id = a.id AND s.operatore_id = @operatore_id`;

export async function listaAgentiPerOperatore(
  operatoreId: string
): Promise<AgentePerOperatore[]> {
  const rows = await db
    .prepare(
      `${SELECT_AGENTI_OPERATORE}
       WHERE (a.visibilita = 'personale' AND a.proprietario_id = @operatore_id)
          OR (a.visibilita = 'libreria' AND COALESCE(s.abilitato, 1) = 1)
       ORDER BY COALESCE(s.pinnato, 0) DESC, a.nome`
    )
    .all({ operatore_id: operatoreId });
  return (rows as unknown as Array<AgenteRow & { pinnato: number }>).map((r) => ({
    ...aTipo(r),
    pinnato: Number(r.pinnato) === 1,
  }));
}

export async function getAgente(id: string): Promise<Agente | null> {
  const row = await db.prepare(`${SELECT_AGENTI} WHERE id = ?`).get(id);
  return row ? aTipo(row as unknown as AgenteRow) : null;
}

// Un agente e' gestibile (modifica/eliminazione) se l'operatore e' admin
// oppure ne e' il proprietario e l'agente e' personale.
export function puoGestireAgente(
  agente: Agente | null,
  operatore: { id: string; ruolo: string }
): boolean {
  if (!agente) return false;
  if (operatore.ruolo === "admin") return true;
  return agente.visibilita === "personale" && agente.proprietario_id === operatore.id;
}

// Un agente e' eseguibile/visibile se e' il proprio, se e' di libreria e non
// e' stato disabilitato per questo operatore, oppure se l'operatore e' admin.
export async function puoUsareAgente(
  agente: Agente | null,
  operatore: { id: string; ruolo: string }
): Promise<boolean> {
  if (!agente) return false;
  if (operatore.ruolo === "admin") return true;
  if (agente.proprietario_id === operatore.id) return true;
  if (agente.visibilita !== "libreria") return false;
  const assegnazione = await db
    .prepare(
      "SELECT abilitato FROM agenti_assegnazioni WHERE agente_id = ? AND operatore_id = ?"
    )
    .get([agente.id, operatore.id]);
  // Nessuna riga = libreria visibile a tutti (default); una riga esplicita
  // con abilitato = 0 la nasconde a questo operatore.
  if (!assegnazione) return true;
  return Number(assegnazione.abilitato) === 1;
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
  if (input.provider !== undefined && !PROVIDER_VALIDI.includes(input.provider as ProviderAgente)) {
    return "Provider non valido.";
  }
  if (
    input.visibilita !== undefined &&
    input.visibilita !== "libreria" &&
    input.visibilita !== "personale"
  ) {
    return "Visibilita' non valida.";
  }
  if (!parziale || input.system_prompt !== undefined) {
    if (typeof input.system_prompt !== "string" || !input.system_prompt.trim()) {
      return "Il prompt di sistema è obbligatorio.";
    }
  }
  if (input.descrizione !== undefined && input.descrizione.length > 2000) {
    return "Descrizione troppo lunga.";
  }
  if (input.istruzioni_default !== undefined) {
    if (
      input.istruzioni_default !== null &&
      typeof input.istruzioni_default !== "string"
    ) {
      return "Istruzioni di default non valide.";
    }
    if (
      typeof input.istruzioni_default === "string" &&
      input.istruzioni_default.length > 20000
    ) {
      return "Istruzioni di default troppo lunghe.";
    }
  }
  if (input.messaggio_iniziale !== undefined) {
    if (
      input.messaggio_iniziale !== null &&
      typeof input.messaggio_iniziale !== "string"
    ) {
      return "Messaggio iniziale non valido.";
    }
    if (
      typeof input.messaggio_iniziale === "string" &&
      input.messaggio_iniziale.length > 2000
    ) {
      return "Messaggio iniziale troppo lungo.";
    }
  }
  if (input.strumenti !== undefined) {
    if (!Array.isArray(input.strumenti) || input.strumenti.some((s) => typeof s !== "string")) {
      return "Strumenti non validi.";
    }
    const ignoti = input.strumenti.filter((s) => !TUTTI_STRUMENTI.includes(s));
    if (ignoti.length > 0) return `Strumenti sconosciuti: ${ignoti.join(", ")}.`;
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
        istruzioni_default, messaggio_iniziale, strumenti, provider, attivo,
        creato_da, proprietario_id, visibilita, data_creazione, data_aggiornamento)
       VALUES (@id, @nome, @descrizione, @ruolo, @modello, @system_prompt,
        @istruzioni_default, @messaggio_iniziale, @strumenti, @provider, @attivo,
        @creato_da, @proprietario_id, @visibilita, @now, @now)`
    )
    .run({
      id,
      nome: input.nome.trim(),
      descrizione: input.descrizione?.trim() || null,
      ruolo: input.ruolo ?? "assistente",
      modello: input.modello?.trim() || MODELLO_DEFAULT,
      system_prompt: input.system_prompt.trim(),
      istruzioni_default: input.istruzioni_default?.trim() || null,
      messaggio_iniziale: input.messaggio_iniziale?.trim() || null,
      strumenti: JSON.stringify(input.strumenti ?? []),
      provider: input.provider ?? "auto",
      attivo: input.attivo === false ? 0 : 1,
      creato_da: operatoreId ?? null,
      proprietario_id: operatoreId ?? null,
      visibilita: input.visibilita === "personale" ? "personale" : "libreria",
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
  if (input.istruzioni_default !== undefined) {
    assegna("istruzioni_default", input.istruzioni_default?.trim() || null);
  }
  if (input.messaggio_iniziale !== undefined) {
    assegna("messaggio_iniziale", input.messaggio_iniziale?.trim() || null);
  }
  if (input.strumenti !== undefined) assegna("strumenti", JSON.stringify(input.strumenti));
  if (input.provider !== undefined) assegna("provider", input.provider);
  if (input.attivo !== undefined) assegna("attivo", input.attivo ? 1 : 0);
  if (input.visibilita !== undefined) assegna("visibilita", input.visibilita);

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
  traccia: string | null;
  conversazione_id: string | null;
  provider: string | null;
  avviata_da: string | null;
  parent_id: string | null;
  data_creazione: string;
}

function parseJson<T>(testo: string | null): T | null {
  if (!testo) return null;
  try {
    const parsed = JSON.parse(testo);
    return (parsed ?? null) as T;
  } catch {
    return null;
  }
}

function aTipoEsecuzione(r: EsecuzioneRow): AgenteEsecuzione {
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
    contesto: parseJson<Record<string, unknown>>(r.contesto),
    traccia: parseJson<VoceTraccia[]>(r.traccia),
    conversazione_id: r.conversazione_id ?? null,
    provider: r.provider ?? null,
    avviata_da:
      r.avviata_da === "trigger" || r.avviata_da === "sistema"
        ? r.avviata_da
        : "operatore",
    parent_id: r.parent_id ?? null,
    data_creazione: r.data_creazione,
  };
}

const SELECT_ESECUZIONI = `SELECT id, agente_id, input_utente, output, stato, errore,
  modello, prompt_tokens, completion_tokens, durata_ms, operatore_id, contesto,
  traccia, conversazione_id, provider, avviata_da, parent_id, data_creazione
  FROM agenti_esecuzioni`;

export async function listaEsecuzioni(
  agenteId: string,
  limit = 50,
  conversazioneId?: string
): Promise<AgenteEsecuzione[]> {
  const rows = conversazioneId
    ? await db
        .prepare(
          `${SELECT_ESECUZIONI} WHERE agente_id = ? AND conversazione_id = ?
           ORDER BY data_creazione ASC LIMIT ?`
        )
        .all([agenteId, conversazioneId, limit])
    : await db
        .prepare(
          `${SELECT_ESECUZIONI} WHERE agente_id = ? ORDER BY data_creazione DESC LIMIT ?`
        )
        .all([agenteId, limit]);
  return (rows as unknown as EsecuzioneRow[]).map(aTipoEsecuzione);
}

// ---------------------------------------------------------------------------
// Monitor: tutte le esecuzioni (proprie, oppure tutte per l'admin)
// ---------------------------------------------------------------------------
export async function listaAttivitaAgenti(opts?: {
  operatoreId?: string;
  agenteId?: string;
  stato?: string;
  limit?: number;
}): Promise<AgenteAttivita[]> {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (opts?.operatoreId) {
    where.push("e.operatore_id = @operatore_id");
    params.operatore_id = opts.operatoreId;
  }
  if (opts?.agenteId) {
    where.push("e.agente_id = @agente_id");
    params.agente_id = opts.agenteId;
  }
  if (opts?.stato && ["in_corso", "completata", "errore"].includes(opts.stato)) {
    where.push("e.stato = @stato");
    params.stato = opts.stato;
  }
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  params.limit = limit;
  const rows = await db
    .prepare(
      `SELECT e.id, e.agente_id, e.input_utente, e.output, e.stato, e.errore,
        e.modello, e.prompt_tokens, e.completion_tokens, e.durata_ms,
        e.operatore_id, e.contesto, e.traccia, e.conversazione_id, e.provider,
        e.avviata_da, e.parent_id, e.data_creazione,
        a.nome AS agente_nome, o.nome AS operatore_nome
       FROM agenti_esecuzioni e
       LEFT JOIN agenti a ON a.id = e.agente_id
       LEFT JOIN operatori o ON o.id = e.operatore_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY e.data_creazione DESC LIMIT @limit`
    )
    .all(params);
  return (rows as unknown as Array<
    EsecuzioneRow & { agente_nome: string | null; operatore_nome: string | null }
  >).map((r) => ({
    ...aTipoEsecuzione(r),
    agente_nome: r.agente_nome ?? null,
    operatore_nome: r.operatore_nome ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Conversazioni Copilot
// ---------------------------------------------------------------------------
interface ConversazioneRow {
  id: string;
  agente_id: string;
  operatore_id: string;
  titolo: string | null;
  contesto: string | null;
  data_creazione: string;
  data_aggiornamento: string;
}

function aTipoConversazione(r: ConversazioneRow): AgenteConversazione {
  return {
    id: r.id,
    agente_id: r.agente_id,
    operatore_id: r.operatore_id,
    titolo: r.titolo,
    contesto: parseJson<Record<string, unknown>>(r.contesto),
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
  };
}

const SELECT_CONVERSAZIONI = `SELECT id, agente_id, operatore_id, titolo, contesto,
  data_creazione, data_aggiornamento FROM agenti_conversazioni`;

export async function creaConversazione(opts: {
  agenteId: string;
  operatoreId: string;
  titolo?: string;
  contesto?: Record<string, unknown>;
}): Promise<AgenteConversazione> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const titolo = (opts.titolo ?? "").trim().slice(0, 200) || null;
  await db
    .prepare(
      `INSERT INTO agenti_conversazioni
        (id, agente_id, operatore_id, titolo, contesto, data_creazione, data_aggiornamento)
       VALUES (@id, @agente_id, @operatore_id, @titolo, @contesto, @now, @now)`
    )
    .run({
      id,
      agente_id: opts.agenteId,
      operatore_id: opts.operatoreId,
      titolo,
      contesto: opts.contesto ? JSON.stringify(opts.contesto) : null,
      now,
    });
  const conversazione = await getConversazione(id);
  if (!conversazione) throw new Error("Conversazione non creata.");
  return conversazione;
}

export async function getConversazione(
  id: string
): Promise<AgenteConversazione | null> {
  const row = await db.prepare(`${SELECT_CONVERSAZIONI} WHERE id = ?`).get(id);
  return row ? aTipoConversazione(row as unknown as ConversazioneRow) : null;
}

export async function listaConversazioni(opts: {
  operatoreId: string;
  agenteId?: string;
  limit?: number;
}): Promise<AgenteConversazione[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const rows = opts.agenteId
    ? await db
        .prepare(
          `${SELECT_CONVERSAZIONI} WHERE operatore_id = ? AND agente_id = ?
           ORDER BY data_aggiornamento DESC LIMIT ?`
        )
        .all([opts.operatoreId, opts.agenteId, limit])
    : await db
        .prepare(
          `${SELECT_CONVERSAZIONI} WHERE operatore_id = ?
           ORDER BY data_aggiornamento DESC LIMIT ?`
        )
        .all([opts.operatoreId, limit]);
  return (rows as unknown as ConversazioneRow[]).map(aTipoConversazione);
}

export async function toccaConversazione(
  id: string,
  titolo?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (titolo !== undefined) {
    await db
      .prepare(
        `UPDATE agenti_conversazioni
         SET data_aggiornamento = @now,
             titolo = COALESCE(NULLIF(titolo, ''), @titolo)
         WHERE id = @id`
      )
      .run({ id, now, titolo: titolo.slice(0, 200) || null });
    return;
  }
  await db
    .prepare("UPDATE agenti_conversazioni SET data_aggiornamento = @now WHERE id = @id")
    .run({ id, now });
}

export async function eliminaConversazione(id: string): Promise<void> {
  await db.prepare("DELETE FROM agenti_conversazioni WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Assegnazioni (agenti di libreria -> operatori)
// ---------------------------------------------------------------------------
interface AssegnazioneRow {
  id: string;
  agente_id: string;
  operatore_id: string;
  abilitato: number;
  pinnato: number;
  ordine: number;
  data_creazione: string;
}

function aTipoAssegnazione(r: AssegnazioneRow): AgenteAssegnazione {
  return {
    id: r.id,
    agente_id: r.agente_id,
    operatore_id: r.operatore_id,
    abilitato: Number(r.abilitato) === 1,
    pinnato: Number(r.pinnato) === 1,
    ordine: Number(r.ordine) || 0,
    data_creazione: r.data_creazione,
  };
}

export async function listaAssegnazioni(
  agenteId: string
): Promise<AgenteAssegnazione[]> {
  const rows = await db
    .prepare(
      `SELECT id, agente_id, operatore_id, abilitato, pinnato, ordine,
        data_creazione FROM agenti_assegnazioni WHERE agente_id = ?
       ORDER BY operatore_id`
    )
    .all(agenteId);
  return (rows as unknown as AssegnazioneRow[]).map(aTipoAssegnazione);
}

// Upsert parziale: i campi non passati mantengono il valore esistente (o il
// default alla prima assegnazione).
export async function impostaAssegnazione(opts: {
  agenteId: string;
  operatoreId: string;
  abilitato?: boolean;
  pinnato?: boolean;
  ordine?: number;
}): Promise<AgenteAssegnazione> {
  const esistente = await db
    .prepare(
      "SELECT id, agente_id, operatore_id, abilitato, pinnato, ordine, data_creazione FROM agenti_assegnazioni WHERE agente_id = ? AND operatore_id = ?"
    )
    .get([opts.agenteId, opts.operatoreId]);

  const now = new Date().toISOString();
  if (!esistente) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO agenti_assegnazioni
          (id, agente_id, operatore_id, abilitato, pinnato, ordine, data_creazione)
         VALUES (@id, @agente_id, @operatore_id, @abilitato, @pinnato, @ordine, @now)`
      )
      .run({
        id,
        agente_id: opts.agenteId,
        operatore_id: opts.operatoreId,
        abilitato: opts.abilitato === false ? 0 : 1,
        pinnato: opts.pinnato ? 1 : 0,
        ordine: opts.ordine ?? 0,
        now,
      });
  } else {
    const r = esistente as unknown as AssegnazioneRow;
    await db
      .prepare(
        `UPDATE agenti_assegnazioni
         SET abilitato = @abilitato, pinnato = @pinnato, ordine = @ordine
         WHERE id = @id`
      )
      .run({
        id: r.id,
        abilitato: opts.abilitato === undefined ? Number(r.abilitato) : opts.abilitato ? 1 : 0,
        pinnato: opts.pinnato === undefined ? Number(r.pinnato) : opts.pinnato ? 1 : 0,
        ordine: opts.ordine ?? Number(r.ordine) ?? 0,
      });
  }

  const riga = await db
    .prepare(
      "SELECT id, agente_id, operatore_id, abilitato, pinnato, ordine, data_creazione FROM agenti_assegnazioni WHERE agente_id = ? AND operatore_id = ?"
    )
    .get([opts.agenteId, opts.operatoreId]);
  if (!riga) throw new Error("Assegnazione non salvata.");
  return aTipoAssegnazione(riga as unknown as AssegnazioneRow);
}

export async function rimuoviAssegnazione(
  agenteId: string,
  operatoreId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM agenti_assegnazioni WHERE agente_id = ? AND operatore_id = ?")
    .run([agenteId, operatoreId]);
}

export type EsitoEsecuzione =
  | { ok: true; esecuzione: AgenteEsecuzione }
  | { ok: false; error: string };

// Risolve il backend effettivo per questo agente.
// Regola: strumenti attivi → SEMPRE openrouter (il loop con esecuzione
// in-app vive lì); altrimenti override di agente.provider, poi 'auto'.
function risolviProvider(agente: Agente, strumentiAttivi: boolean): ProviderAI {
  if (strumentiAttivi) return "openrouter";
  if (agente.provider === "openrouter" || agente.provider === "hermes") {
    return agente.provider;
  }
  return providerAttivo();
}

// Prompt effettivo: il comportamento (COME) e' il system_prompt; le istruzioni
// di default (COSA) vengono accodate come sezione dedicata, cosi' l'operatore
// puo' cambiarle in ogni momento senza riscrivere il prompt di identita'.
function promptEffettivo(agente: Agente): string {
  const base = agente.system_prompt.trim();
  const def = (agente.istruzioni_default ?? "").trim();
  if (!def) return base;
  return `${base}

## COMPITO DI DEFAULT
Quando l'operatore non specifica diversamente, segui queste istruzioni:
${def}`;
}

// Storico del thread Copilot. La conversazione e' la fonte di verita': senza
// questo, ogni turno ripartirebbe da zero e il modello "dimenticherebbe" i
// dati letti con i tool al turno precedente.
async function caricaStoricoConversazione(
  conversazioneId: string,
  escludiId: string
): Promise<MessaggioStorico[]> {
  const rows = await db
    .prepare(
      `SELECT input_utente, output, errore, stato, data_creazione
       FROM agenti_esecuzioni
       WHERE conversazione_id = ? AND id != ?
         AND stato IN ('completata','errore')
       ORDER BY data_creazione ASC`
    )
    .all([conversazioneId, escludiId]);
  return componiStoricoConversazione(rows as unknown as EsecuzioneStorico[]);
}

// Contesto della pagina (ticket/cliente/progetto) passato dal Copilot.
// Viene trasformato in un blocco di sistema leggibile dal modello, cosi' non
// deve chiedere all'operatore dati che l'app ha gia' sotto mano.
async function costruisciContesto(
  contesto: Record<string, unknown> | undefined
): Promise<string> {
  if (!contesto) return "";
  const tipo = typeof contesto.tipo === "string" ? contesto.tipo : "";
  const id = typeof contesto.id === "string" ? contesto.id : "";
  if (!id) return "";

  try {
    if (tipo === "ticket") {
      const ticket = await getTicket(id);
      return ticket
        ? formattaContestoTicket(ticket)
        : `## CONTESTO CORRENTE
Ticket id: ${id} (non caricato). Usa lo strumento get_ticket per leggerlo.`;
    }
    if (tipo === "cliente") {
      const cliente = await getCliente(id);
      return cliente
        ? formattaContestoCliente(cliente)
        : `## CONTESTO CORRENTE
Cliente id: ${id} (non caricato). Usa lo strumento get_cliente per leggerlo.`;
    }
    if (tipo === "progetto") {
      return formattaContestoProgetto(id);
    }
  } catch (err) {
    console.error("Contesto agente non caricato:", err);
  }
  return "";
}

// Invoca l'agente sul backend risolto e logga l'esecuzione completa.
// Sincrona per scelta (la struttura prevede un ritmo umano: la UI attende
// e mostra l'output; l'eventuale coda asincrona arriverà con i tool lunghi).
export async function eseguiAgente(opts: {
  agenteId: string;
  input: string;
  contesto?: Record<string, unknown>;
  operatoreId?: string;
  // Thread Copilot a cui agganciare il turno (opzionale: le esecuzioni di
  // prova dalla configurazione restano senza conversazione).
  conversazioneId?: string;
}): Promise<EsitoEsecuzione> {
  const agente = await getAgente(opts.agenteId);
  if (!agente) return { ok: false, error: "Agente non trovato." };
  if (!agente.attivo) return { ok: false, error: "Agente disattivato." };

  const input = opts.input.trim();
  if (!input) return { ok: false, error: "Input vuoto." };

  // Solo strumenti validi (lista cross-checkata anche in validazione).
  const strumenti = strumentiPerAgente(agente.strumenti);
  const providerScelto = risolviProvider(agente, strumenti.length > 0);

  // Hermes ha accesso a un terminale e a memoria propria: non deve leggere i
  // contenuti scritti dai clienti (ticket/email). Gli agenti "assistente"
  // girano quindi solo su OpenRouter.
  if (providerScelto === "hermes" && agente.ruolo === "assistente") {
    return {
      ok: false,
      error:
        "Hermes non e' ammesso per gli agenti che leggono i contenuti dei clienti. Usa OpenRouter.",
    };
  }

  if (providerScelto === "hermes") {
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
        operatore_id, contesto, conversazione_id, provider, avviata_da, data_creazione)
       VALUES (@id, @agente_id, @input_utente, 'in_corso', @modello,
        @operatore_id, @contesto, @conversazione_id, @provider, 'operatore', @now)`
    )
    .run({
      id,
      agente_id: agente.id,
      input_utente: input,
      modello: agente.modello,
      operatore_id: opts.operatoreId ?? null,
      contesto: opts.contesto ? JSON.stringify(opts.contesto) : null,
      conversazione_id: opts.conversazioneId ?? null,
      provider: providerScelto,
      now,
    });

  // Contesto e storico si calcolano DOPO l'INSERT: lo storico esclude
  // l'esecuzione corrente (in_corso) per id.
  const contestoPrompt = await costruisciContesto(opts.contesto);
  const systemPrompt = contestoPrompt
    ? `${promptEffettivo(agente)}\n\n${contestoPrompt}`
    : promptEffettivo(agente);

  let storico: MessaggioStorico[] = [];
  if (providerScelto === "openrouter" && opts.conversazioneId) {
    try {
      storico = await caricaStoricoConversazione(opts.conversazioneId, id);
    } catch (err) {
      console.error("Storico conversazione non caricato:", err);
    }
  }

  const registra = async (dati: {
    stato: "completata" | "errore";
    output?: string | null;
    errore?: string | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    traccia?: VoceTraccia[] | null;
  }): Promise<void> => {
    await db
      .prepare(
        `UPDATE agenti_esecuzioni
         SET stato = @stato, output = @output, errore = @errore,
             prompt_tokens = @prompt_tokens, completion_tokens = @completion_tokens,
             durata_ms = @durata_ms, traccia = @traccia
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
        traccia: dati.traccia ? JSON.stringify(dati.traccia) : null,
      });
    // Il thread resta in cima alla lista conversazioni a ogni turno concluso.
    if (opts.conversazioneId) {
      await toccaConversazione(opts.conversazioneId, input.slice(0, 80)).catch(
        () => undefined
      );
    }
  };

  try {
    let output: string | null;
    let promptTokens = 0;
    let completionTokens = 0;
    let traccia: VoceTraccia[] | null = null;

    if (strumenti.length > 0) {
      // === LOOP STRUMENTI IN-APP (OpenRouter) =============================
      // Il modello chiede tool; le query le esegue la NOSTRA app sul
      // nostro DB; i risultati tornano al modello fino alla risposta.
      const messaggi: MessaggioChat[] = [
        { role: "system", content: systemPrompt },
        ...storico.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: input },
      ];
      const voci: VoceTraccia[] = [];
      let finito = false;
      output = null;

      for (let turno = 1; turno <= MAX_TURNI_STRUMENTI + 1 && !finito; turno++) {
        // All'ultimo turno (oltre il limite) si tolgono i tools: il modello
        // DEVE produrre la risposta finale con i dati già raccolti.
        const forzatoFinale = turno > MAX_TURNI_STRUMENTI;
        const esito = await invocaModello({
          systemPrompt,
          input,
          modello: agente.modello,
          provider: "openrouter",
          messaggi,
          tools: forzatoFinale ? undefined : strumenti,
        });
        promptTokens += esito.promptTokens ?? 0;
        completionTokens += esito.completionTokens ?? 0;

        if (esito.toolCalls.length === 0 || forzatoFinale) {
          output = esito.output ?? output;
          finito = true;
          break;
        }

        // Storico: il messaggio assistant con i tool richiesti.
        messaggi.push({
          role: "assistant",
          content: esito.output,
          tool_calls: esito.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        // Esecuzione IN-APP di ogni chiamata + risultato nello storico.
        for (const tc of esito.toolCalls) {
          let args: unknown = {};
          try {
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            args = {};
          }
          const risultato = await eseguiStrumento(tc.name, args, {
            agenteId: agente.id,
            esecuzioneId: id,
            operatoreId: opts.operatoreId ?? null,
            conversazioneId: opts.conversazioneId ?? null,
          });
          voci.push({
            turno,
            tool: tc.name,
            argomenti: tc.arguments.slice(0, 500),
            esito: risultato.slice(0, 500),
          });
          messaggi.push({ role: "tool", content: risultato, tool_call_id: tc.id });
        }
      }

      if (!finito || output === null) {
        await registra({
          stato: "errore",
          errore: "Limite di turni del loop strumenti raggiunto senza risposta finale.",
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          traccia: voci,
        });
        return { ok: false, error: "Limite di turni raggiunto senza risposta finale." };
      }
      traccia = voci;
    } else {
      // === CHIAMATA SEMPLICE (Hermes con memoria, o OpenRouter) ===========
      // OpenRouter e' stateless: lo storico va passato esplicitamente.
      // Hermes ha gia' la sua sessione, quindi non riceve lo storico.
      const messaggiStorico: MessaggioChat[] | undefined =
        providerScelto === "openrouter"
          ? [
              { role: "system", content: systemPrompt },
              ...storico.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: input },
            ]
          : undefined;

      const esito = await invocaModello({
        systemPrompt,
        input,
        modello: agente.modello,
        provider: providerScelto,
        messaggi: messaggiStorico,
        // Sessione/chiave di memoria: solo Hermes li usa. La sessione e' PER
        // OPERATORE: due operatori non condividono la memoria dell'agente.
        sessionId: `ticket-${agente.id}-${opts.operatoreId ?? "anon"}`,
        sessionKey: `ticket-dashboard:${agente.id}:${opts.operatoreId ?? "anon"}`,
      });
      output = esito.output;
      promptTokens = esito.promptTokens ?? 0;
      completionTokens = esito.completionTokens ?? 0;
    }

    await registra({
      stato: "completata",
      output,
      prompt_tokens: promptTokens || null,
      completion_tokens: completionTokens || null,
      traccia,
    });

    const riga = await db
      .prepare(`${SELECT_ESECUZIONI} WHERE id = ?`)
      .get(id);
    const esecuzione = riga
      ? aTipoEsecuzione(riga as unknown as EsecuzioneRow)
      : null;
    if (!esecuzione) return { ok: false, error: "Errore di log dell'esecuzione." };
    return { ok: true, esecuzione };
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "Errore sconosciuto.";
    await registra({ stato: "errore", errore: messaggio }).catch(() => undefined);
    return { ok: false, error: messaggio };
  }
}
