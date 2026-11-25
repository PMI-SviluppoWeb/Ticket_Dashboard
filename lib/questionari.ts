import "server-only";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { getCliente } from "./clienti";
import { createNotification } from "./notifications";
import { registra } from "./registro";
import { sendEmail } from "./email";
import { emailQuestionario } from "./email-templates";
import { emailValida } from "./contatti";
import { validaRisposte } from "./questionari-schema";
import type {
  Questionario,
  QuestionarioTokenInfo,
  RisposteQuestionario,
  StatoQuestionario,
} from "./types";

const GIORNI_SCADENZA_DEFAULT = 30;
const STATI: StatoQuestionario[] = [
  "creato",
  "inviato",
  "compilato",
  "scaduto",
  "annullato",
];

interface QuestionarioRow {
  id: string;
  cliente_id: string;
  stato: string;
  titolo: string;
  messaggio: string | null;
  destinatario: string | null;
  scadenza: string | null;
  inviato_il: string | null;
  compilato_il: string | null;
  esito_invio: string | null;
  errore_invio: string | null;
  creato_da: string | null;
  data_creazione: string;
  data_aggiornamento: string;
  risposte: string | null;
  data_compilazione: string | null;
  ragione_sociale?: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

export function linkQuestionario(token: string): string {
  return `${baseUrl()}/questionario?token=${encodeURIComponent(token)}`;
}

function statoEffettivo(
  stato: string,
  scadenza: string | null
): StatoQuestionario {
  const valido = STATI.includes(stato as StatoQuestionario)
    ? (stato as StatoQuestionario)
    : "creato";
  if (
    (valido === "creato" || valido === "inviato") &&
    scadenza &&
    new Date(scadenza).getTime() < Date.now()
  ) {
    return "scaduto";
  }
  return valido;
}

function parseRisposta(json: string | null): RisposteQuestionario | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object"
      ? (parsed as RisposteQuestionario)
      : null;
  } catch {
    return null;
  }
}

function aTipo(r: QuestionarioRow): Questionario {
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    stato: statoEffettivo(r.stato, r.scadenza),
    titolo: r.titolo,
    messaggio: r.messaggio,
    destinatario: r.destinatario,
    scadenza: r.scadenza,
    inviato_il: r.inviato_il,
    compilato_il: r.compilato_il,
    esito_invio: r.esito_invio,
    errore_invio: r.errore_invio,
    creato_da: r.creato_da,
    data_creazione: r.data_creazione,
    data_aggiornamento: r.data_aggiornamento,
    risposta: parseRisposta(r.risposte),
    data_compilazione: r.data_compilazione,
  };
}

const SELECT_QUESTIONARIO = `SELECT q.id, q.cliente_id, q.stato, q.titolo, q.messaggio,
  q.destinatario, q.scadenza, q.inviato_il, q.compilato_il, q.esito_invio,
  q.errore_invio, q.creato_da, q.data_creazione, q.data_aggiornamento,
  r.risposte, r.data_compilazione
  FROM questionari q
  LEFT JOIN questionari_risposte r ON r.questionario_id = q.id`;

export async function getQuestionario(id: string): Promise<Questionario | null> {
  const row = await db
    .prepare(`${SELECT_QUESTIONARIO} WHERE q.id = ?`)
    .get(id);
  return row ? aTipo(row as unknown as QuestionarioRow) : null;
}

export async function listaQuestionari(
  clienteId: string
): Promise<Questionario[]> {
  const rows = await db
    .prepare(
      `${SELECT_QUESTIONARIO} WHERE q.cliente_id = ?
       ORDER BY q.data_creazione DESC LIMIT 100`
    )
    .all(clienteId);
  return (rows as unknown as QuestionarioRow[]).map(aTipo);
}

export type EsitoCreazioneQuestionario =
  | {
      ok: true;
      questionario: Questionario;
      // Link completo: il token in chiaro non e' piu' recuperabile dopo.
      link: string;
      esito_invio: string;
      errore_invio: string | null;
    }
  | { ok: false; error: string };

export async function creaQuestionario(opts: {
  clienteId: string;
  titolo?: string;
  messaggio?: string;
  destinatario?: string;
  giorniScadenza?: number;
  inviaEmail?: boolean;
  creatoDa?: string | null;
}): Promise<EsitoCreazioneQuestionario> {
  const cliente = await getCliente(opts.clienteId);
  if (!cliente) return { ok: false, error: "Cliente non trovato." };

  const titolo =
    (opts.titolo ?? "").trim().slice(0, 200) ||
    "Questionario conoscitivo";
  const messaggio = (opts.messaggio ?? "").trim().slice(0, 5000) || null;
  const destinatario = (opts.destinatario ?? "").trim().slice(0, 200) || null;
  if (destinatario && !emailValida(destinatario)) {
    return { ok: false, error: "Email del destinatario non valida." };
  }

  const giorni = Math.min(
    Math.max(Math.round(opts.giorniScadenza ?? GIORNI_SCADENZA_DEFAULT), 1),
    365
  );
  const now = new Date();
  const scadenza = new Date(now.getTime() + giorni * 86_400_000);
  const token = randomBytes(24).toString("hex");
  const id = crypto.randomUUID();
  const nowIso = now.toISOString();

  await db
    .prepare(
      `INSERT INTO questionari (
         id, cliente_id, token_hash, stato, titolo, messaggio, destinatario,
         scadenza, esito_invio, creato_da, data_creazione, data_aggiornamento
       ) VALUES (
         @id, @cliente_id, @token_hash, 'creato', @titolo, @messaggio, @destinatario,
         @scadenza, 'link_creato', @creato_da, @now, @now
       )`
    )
    .run({
      id,
      cliente_id: opts.clienteId,
      token_hash: hashToken(token),
      titolo,
      messaggio,
      destinatario,
      scadenza: scadenza.toISOString(),
      creato_da: opts.creatoDa ?? null,
      now: nowIso,
    });

  const link = linkQuestionario(token);
  let esitoInvio = "link_creato";
  let erroreInvio: string | null = null;

  if (opts.inviaEmail && destinatario) {
    const risultato = await sendEmail({
      to: destinatario,
      subject: `[Support Desk] ${titolo}`,
      html: emailQuestionario({
        azienda: cliente.ragione_sociale,
        titolo,
        messaggio,
        link,
        scadenza: scadenza.toLocaleDateString("it-IT"),
      }),
      autoSubmitted: "auto-generated",
    });
    if (risultato.ok) {
      esitoInvio = "inviata";
    } else if (risultato.skipped) {
      esitoInvio = "sospesa";
    } else {
      esitoInvio = "errore";
      erroreInvio = risultato.error ?? "Invio non riuscito.";
    }

    await db
      .prepare(
        `UPDATE questionari
         SET stato = @stato, inviato_il = @inviato_il, esito_invio = @esito_invio,
             errore_invio = @errore_invio, data_aggiornamento = @now
         WHERE id = @id`
      )
      .run({
        id,
        stato: esitoInvio === "inviata" ? "inviato" : "creato",
        inviato_il: esitoInvio === "inviata" ? nowIso : null,
        esito_invio: esitoInvio,
        errore_invio: erroreInvio,
        now: new Date().toISOString(),
      });
  } else if (opts.inviaEmail && !destinatario) {
    esitoInvio = "nessun_destinatario";
    await db
      .prepare(
        `UPDATE questionari SET esito_invio = @esito, data_aggiornamento = @now
         WHERE id = @id`
      )
      .run({
        id,
        esito: esitoInvio,
        now: new Date().toISOString(),
      });
  }

  await registra({
    operatoreId: opts.creatoDa ?? null,
    azione: "questionario.creato",
    entita: "questionario",
    entitaId: id,
    dettagli: {
      cliente_id: opts.clienteId,
      destinatario,
      esito_invio: esitoInvio,
    },
  });

  const questionario = await getQuestionario(id);
  if (!questionario) {
    return { ok: false, error: "Questionario non creato." };
  }
  return {
    ok: true,
    questionario,
    link,
    esito_invio: esitoInvio,
    errore_invio: erroreInvio,
  };
}

export type EsitoTokenQuestionario =
  | {
      ok: true;
      questionario: Questionario;
      azienda: string;
      info: QuestionarioTokenInfo;
    }
  | { ok: false; motivo: "non_trovato" | "scaduto" | "annullato" | "compilato" };

async function findByToken(
  token: string
): Promise<{ riga: QuestionarioRow; azienda: string } | null> {
  const row = await db
    .prepare(
      `SELECT q.id, q.cliente_id, q.stato, q.titolo, q.messaggio,
              q.destinatario, q.scadenza, q.inviato_il, q.compilato_il,
              q.esito_invio, q.errore_invio, q.creato_da, q.data_creazione,
              q.data_aggiornamento, r.risposte, r.data_compilazione,
              c.ragione_sociale
       FROM questionari q
       LEFT JOIN questionari_risposte r ON r.questionario_id = q.id
       LEFT JOIN clienti c ON c.id = q.cliente_id
       WHERE q.token_hash = ?`
    )
    .get(hashToken(token));
  if (!row) return null;
  return {
    riga: row as unknown as QuestionarioRow,
    azienda: String((row as unknown as QuestionarioRow).ragione_sociale ?? "Azienda"),
  };
}

export async function getQuestionarioDaToken(
  token: string
): Promise<EsitoTokenQuestionario> {
  const trovato = await findByToken(token);
  if (!trovato) return { ok: false, motivo: "non_trovato" };

  const questionario = aTipo(trovato.riga);
  if (questionario.stato === "compilato") {
    return { ok: false, motivo: "compilato" };
  }
  if (questionario.stato === "annullato") {
    return { ok: false, motivo: "annullato" };
  }
  if (questionario.stato === "scaduto") {
    return { ok: false, motivo: "scaduto" };
  }

  return {
    ok: true,
    questionario,
    azienda: trovato.azienda,
    info: {
      azienda: trovato.azienda,
      titolo: questionario.titolo,
      messaggio: questionario.messaggio,
      stato: questionario.stato,
      scadenza: questionario.scadenza,
    },
  };
}

export type EsitoRispostaQuestionario =
  | { ok: true }
  | { ok: false; error: string };

export async function registraRispostaQuestionario(
  token: string,
  input: unknown
): Promise<EsitoRispostaQuestionario> {
  const trovato = await findByToken(token);
  if (!trovato) {
    return { ok: false, error: "Questionario non trovato o link non valido." };
  }
  const questionario = aTipo(trovato.riga);
  if (questionario.stato === "compilato") {
    return { ok: false, error: "Questo questionario è già stato compilato." };
  }
  if (questionario.stato === "annullato") {
    return { ok: false, error: "Questo questionario non è più valido." };
  }
  if (questionario.stato === "scaduto") {
    return { ok: false, error: "Il questionario è scaduto: chiedi un nuovo link." };
  }

  const validazione = validaRisposte(input);
  if (!validazione.ok) return validazione;
  const risposte = validazione.risposte;

  const nowIso = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO questionari_risposte (
           questionario_id, cliente_id, risposte, n_computer, n_server,
           arca_versione, arca_licenze, n_software, nps, consenso_privacy,
           data_compilazione
         ) VALUES (
           @questionario_id, @cliente_id, @risposte, @n_computer, @n_server,
           @arca_versione, @arca_licenze, @n_software, @nps, @consenso,
           @now
         )`
      )
      .run({
        questionario_id: questionario.id,
        cliente_id: questionario.cliente_id,
        risposte: JSON.stringify(risposte),
        n_computer: risposte.parco_pc.computer,
        n_server: risposte.parco_pc.server,
        arca_versione: risposte.arca.versione || null,
        arca_licenze: risposte.arca.licenze,
        n_software: risposte.software.length,
        nps: risposte.soddisfazione.nps,
        consenso: 1,
        now: nowIso,
      });
  } catch (err) {
    console.error("Questionario risposta non salvata", questionario.id, err);
    return { ok: false, error: "Risposta già registrata o non salvabile." };
  }

  await db
    .prepare(
      `UPDATE questionari
       SET stato = 'compilato', compilato_il = @now, data_aggiornamento = @now
       WHERE id = @id`
    )
    .run({ id: questionario.id, now: nowIso });

  await createNotification({
    titolo: "Questionario compilato",
    messaggio: `${trovato.azienda}: ${risposte.azienda.referente || "referente"} ha inviato il questionario.`,
    tipo: "questionario",
  });

  await registra({
    operatoreId: null,
    origine: "api",
    azione: "questionario.compilato",
    entita: "questionario",
    entitaId: questionario.id,
    dettagli: { cliente_id: questionario.cliente_id },
  });

  return { ok: true };
}

export async function annullaQuestionario(
  id: string,
  opts: { operatoreId?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  const questionario = await getQuestionario(id);
  if (!questionario) {
    return { ok: false, error: "Questionario non trovato." };
  }
  if (questionario.stato === "compilato") {
    return { ok: false, error: "Un questionario compilato non può essere annullato." };
  }
  await db
    .prepare(
      `UPDATE questionari SET stato = 'annullato', data_aggiornamento = @now
       WHERE id = @id`
    )
    .run({ id, now: new Date().toISOString() });
  await registra({
    operatoreId: opts.operatoreId ?? null,
    azione: "questionario.annullato",
    entita: "questionario",
    entitaId: id,
  });
  return { ok: true };
}
