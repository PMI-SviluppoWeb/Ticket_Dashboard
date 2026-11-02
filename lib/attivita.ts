import { db } from "./db";
import { parsePersone, serializzaPersone } from "./persone";
import { setEtichetteAttivita, getEtichettePerAttivita } from "./etichette";
import {
  marcaDaCancellare,
  rimuoviEventoAttivita,
  sincronizzaAttivita,
} from "./google-sync";
import type {
  AttivitaInput,
  AttivitaRow,
  AttivitaUpdate,
  Etichetta,
  EventoCalendario,
  StatoAttivita,
} from "./types";

// ===========================================================================
// ATTENZIONE — QUESTO MODULO E' IL PUNTO DI AGGANCIO DELLA SINCRONIZZAZIONE
// VERSO GOOGLE CALENDAR.
//
// insertAttivita / updateAttivita / deleteAttivita chiamano la sincronizzazione
// e sono l'unico punto attraversato da tutte le rotte che scrivono attivita'
// (app/api/attivita, app/api/attivita/[id], app/api/progetti/[id]/attivita).
//
// Qualunque scrittura futura su `attivita` fatta con SQL in chiaro ALTROVE
// aggira la sincronizzazione e lascia Google disallineato. E' gia' successo
// una volta: la cascata di deleteProgetto cancellava le attivita' con una
// DELETE diretta. Se serve un nuovo percorso di scrittura, farlo passare da
// qui oppure chiamare esplicitamente le funzioni di lib/google-sync.ts.
// ===========================================================================

export const STATI_ATTIVITA: StatoAttivita[] = ["DA_FARE", "IN_CORSO", "COMPLETATA"];

// La sincronizzazione Google e' "best effort" e non lancia mai (vedi
// lib/google-sync.ts): persiste l'esito nella tabella attivita_google, oppure
// lo lascia alla riconciliazione. Aspettarla dentro la richiesta utente
// significava sommare fino a BUDGET_INLINE_MS (4s) di attesa a ogni salvataggio
// per un effetto che l'utente non vede.
//
// Qui parte in background e gli errori vengono solo loggati: la riga di stato
// resta quella che la riconciliazione ("Sincronizza ora") riprendera'.
function avviaSyncInBackground(attivitaId: string): void {
  void sincronizzaAttivita(attivitaId).catch((err) => {
    console.error("Sync Google in background fallita:", attivitaId, err);
  });
}

// Lo stato Google arriva da un LEFT JOIN: null = mai sincronizzata (o
// sincronizzazione non configurata). L'alias evita di toccare i campi di
// dominio di `attivita`.
const ROW_FIELDS = `
  a.id, a.progetto_id, a.cliente_id, a.titolo, a.descrizione, a.stato, a.priorita,
  a.data_inizio, a.data_scadenza, a.data_completamento, a.assegnatario, a.persone,
  a.data_creazione, a.data_aggiornamento,
  ag.stato         AS google_stato,
  ag.ultimo_errore AS google_ultimo_errore,
  ag.data_sync     AS google_data_sync
`;

const FROM_ATTIVITA = `
  attivita a
  LEFT JOIN attivita_google ag ON ag.attivita_id = a.id
`;

// I campi di pianificazione usano "YYYY-MM-DDTHH:mm"; quelli di audit l'ISO.
function nowISO(): string {
  return new Date().toISOString();
}

// `persone` e' TEXT con un array JSON: qui diventa un array vero, una volta
// sola, per tutte le letture. I componenti non devono mai vedere la stringa.
function normalizza(row: Record<string, unknown>): AttivitaRow {
  return { ...row, persone: parsePersone(row.persone) } as unknown as AttivitaRow;
}

export async function listAttivitaProgetto(progettoId: string): Promise<AttivitaRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${ROW_FIELDS} FROM ${FROM_ATTIVITA}
       WHERE a.progetto_id = @progetto_id
       ORDER BY a.data_scadenza IS NULL, a.data_scadenza ASC, a.rowid DESC`
    )
    .all({ progetto_id: progettoId });
  return (rows as unknown as Record<string, unknown>[]).map(normalizza);
}

// Eventi fuori progetto, con filtro opzionale sull'intervallo di scadenza.
export async function listEventiSenzaProgetto(opts?: {
  dal?: string;
  al?: string;
  cliente_id?: string;
  limite?: number;
}): Promise<AttivitaRow[]> {
  const where: string[] = ["a.progetto_id IS NULL"];
  const params: Record<string, string | number> = {};

  if (opts?.dal) {
    where.push("a.data_scadenza >= @dal");
    params.dal = opts.dal;
  }
  if (opts?.al) {
    where.push("a.data_scadenza <= @al");
    params.al = opts.al;
  }
  if (opts?.cliente_id) {
    where.push("a.cliente_id = @cliente_id");
    params.cliente_id = opts.cliente_id;
  }

  params.limit = Math.min(500, Math.max(1, opts?.limite ?? 200));

  const rows = await db
    .prepare(
      `SELECT ${ROW_FIELDS} FROM ${FROM_ATTIVITA}
       WHERE ${where.join(" AND ")}
       ORDER BY a.data_scadenza IS NULL, a.data_scadenza ASC, a.rowid DESC
       LIMIT @limit`
    )
    .all(params);
  return (rows as unknown as Record<string, unknown>[]).map(normalizza);
}

export async function getAttivita(id: string): Promise<AttivitaRow | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS} FROM ${FROM_ATTIVITA} WHERE a.id = ?`)
    .get(id);
  return row ? normalizza(row as unknown as Record<string, unknown>) : null;
}

export async function insertAttivita(input: AttivitaInput): Promise<AttivitaRow> {
  const id = crypto.randomUUID();
  const ts = nowISO();
  const stato: StatoAttivita = input.stato ?? "DA_FARE";

  await db
    .prepare(
      `INSERT INTO attivita (
         id, progetto_id, cliente_id, titolo, descrizione, stato, priorita,
         data_inizio, data_scadenza, data_completamento, assegnatario, persone,
         data_creazione, data_aggiornamento
       ) VALUES (
         @id, @progetto_id, @cliente_id, @titolo, @descrizione, @stato, @priorita,
         @data_inizio, @data_scadenza, @data_completamento, @assegnatario, @persone,
         @data_creazione, @data_aggiornamento
       )`
    )
    .run({
      id,
      progetto_id: input.progetto_id ?? null,
      cliente_id: input.cliente_id ?? null,
      titolo: input.titolo,
      descrizione: input.descrizione ?? null,
      stato,
      priorita: input.priorita ?? "MEDIA",
      data_inizio: input.data_inizio ?? null,
      data_scadenza: input.data_scadenza ?? null,
      // Coerente con updateAttivita: completata => data di completamento valorizzata.
      data_completamento: stato === "COMPLETATA" ? ts : null,
      assegnatario: input.assegnatario ?? null,
      persone: serializzaPersone(input.persone),
      data_creazione: ts,
      data_aggiornamento: ts,
    });

  // Etichette: la pivot si scrive DOPO che la riga esiste. La chiamata e'
  // best effort come la sync Google: un errore qui non deve perdere
  // l'attivita' appena creata.
  if (input.etichette && input.etichette.length > 0) {
    await setEtichetteAttivita(id, input.etichette);
  }

  // Sincronizzazione in background: un errore verso Google diventa una riga in
  // stato ERRORE, non un fallimento del salvataggio.
  const row = await getAttivita(id);
  if (!row) throw new Error("Inserimento attività non riuscito.");

  avviaSyncInBackground(id);
  return row;
}

export async function updateAttivita(
  id: string,
  patch: AttivitaUpdate,
  // Il chiamante che ha gia' letto l'attivita' (la PATCH la legge per validare
  // lo spostamento) puo' passarla risparmiando un round-trip.
  existing?: AttivitaRow | null
): Promise<AttivitaRow | null> {
  const corrente = existing ?? (await getAttivita(id));
  if (!corrente) return null;

  const sets: string[] = [];
  const params: Record<string, string | null> = { id };
  const ts = nowISO();

  if (patch.titolo !== undefined) { sets.push("titolo = @titolo"); params.titolo = patch.titolo; }
  if (patch.descrizione !== undefined) { sets.push("descrizione = @descrizione"); params.descrizione = patch.descrizione ?? null; }
  if (patch.priorita !== undefined) { sets.push("priorita = @priorita"); params.priorita = patch.priorita; }
  if (patch.progetto_id !== undefined) { sets.push("progetto_id = @progetto_id"); params.progetto_id = patch.progetto_id ?? null; }
  if (patch.cliente_id !== undefined) { sets.push("cliente_id = @cliente_id"); params.cliente_id = patch.cliente_id ?? null; }
  if (patch.data_inizio !== undefined) { sets.push("data_inizio = @data_inizio"); params.data_inizio = patch.data_inizio ?? null; }
  if (patch.data_scadenza !== undefined) { sets.push("data_scadenza = @data_scadenza"); params.data_scadenza = patch.data_scadenza ?? null; }
  if (patch.assegnatario !== undefined) { sets.push("assegnatario = @assegnatario"); params.assegnatario = patch.assegnatario ?? null; }
  if (patch.persone !== undefined) { sets.push("persone = @persone"); params.persone = serializzaPersone(patch.persone); }

  if (patch.stato !== undefined) {
    sets.push("stato = @stato");
    params.stato = patch.stato;
    // Effetto collaterale sulle transizioni di stato, come per i ticket.
    if (patch.stato === "COMPLETATA" && corrente.stato !== "COMPLETATA") {
      sets.push("data_completamento = @data_completamento");
      params.data_completamento = ts;
    } else if (patch.stato !== "COMPLETATA") {
      sets.push("data_completamento = @data_completamento");
      params.data_completamento = null;
    }
  }

  sets.push("data_aggiornamento = @data_aggiornamento");
  params.data_aggiornamento = ts;

  await db.prepare(`UPDATE attivita SET ${sets.join(", ")} WHERE id = @id`).run(params);

  // Etichette: set sostitutivo, scritto DOPO la riga. Best effort come la
  // sync Google: un errore qui non deve perdere la modifica ai campi.
  if (patch.etichette !== undefined) {
    await setEtichetteAttivita(id, patch.etichette);
  }

  const row = await getAttivita(id);

  // Sincronizzazione in background: copre sia la modifica dei dati sia la
  // rimozione della scadenza (che deve far sparire l'evento da Google).
  avviaSyncInBackground(id);

  return row;
}

// Ora nessun chiamante usa `rimandaGoogle`: la cascata di deleteProgetto usa
// eliminaAttivitaProgetto (una query in blocco). L'opzione resta perche' il
// percorso "marca un tombstone senza chiamare Google" e' parte del contratto
// descritto sotto, e deleteAttivita e' l'unico punto che lo espone.
export async function deleteAttivita(
  id: string,
  opts?: { rimandaGoogle?: boolean }
): Promise<boolean> {
  if (opts?.rimandaGoogle) {
    await marcaDaCancellare(id);
  } else {
    // Va letto PRIMA di cancellare: dopo non c'e' piu' nulla da cui risalire
    // all'evento su Google.
    await rimuoviEventoAttivita(id);
  }

  // La pivot non ha cascata applicata dal DB: la pulizia e' obbligatoria qui.
  const risultati = await db.batch([
    { sql: "DELETE FROM attivita_etichette WHERE attivita_id = ?", params: [id] },
    { sql: "DELETE FROM attivita WHERE id = ?", params: [id] },
  ]);
  return (risultati[1]?.changes ?? 0) > 0;
}

// Cancellazione in massa delle attivita' di un progetto, senza chiamare Google.
// Serve a deleteProgetto oltre la soglia: marca i tombstone (esattamente quello
// che fa deleteAttivita con `rimandaGoogle`) e cancella le righe, in due sole
// query invece di due per attivita'. Resta qui dentro, dove vive il contratto
// con Google Calendar: una DELETE in chiaro da un altro modulo lo aggirerebbe.
export async function eliminaAttivitaProgetto(
  progettoId: string
): Promise<void> {
  await db.batch([
    {
      sql: `UPDATE attivita_google SET stato = 'DA_CANCELLARE', ultimo_errore = NULL
            WHERE attivita_id IN (SELECT id FROM attivita WHERE progetto_id = @progetto_id)`,
      params: { progetto_id: progettoId },
    },
    {
      // La pivot non ha cascata: si pulisce prima di cancellare le righe.
      sql: `DELETE FROM attivita_etichette
            WHERE attivita_id IN (SELECT id FROM attivita WHERE progetto_id = @progetto_id)`,
      params: { progetto_id: progettoId },
    },
    {
      sql: "DELETE FROM attivita WHERE progetto_id = @progetto_id",
      params: { progetto_id: progettoId },
    },
  ]);
}

export async function countAttivita(progettoId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM attivita WHERE progetto_id = @progetto_id")
    .get({ progetto_id: progettoId });
  return (row?.n as number) ?? 0;
}

// ---------------------------------------------------------------------------
// La query del calendario.
//
// Un elemento compare in calendario SOLO se ha data_scadenza: la condizione
// e' implicita nel confronto (un NULL non soddisfa ">= @dal"), quindi non
// serve un IS NOT NULL esplicito. E' il meccanismo portante del modulo.
//
// Le tre origini (progetto / cliente / generico) sono distinte dagli id
// nulli; il cliente mostrato e' quello del progetto se presente, altrimenti
// quello diretto dell'evento.
// ---------------------------------------------------------------------------
export async function listEventiCalendario(opts: {
  dal: string;
  al: string;
  progetto_id?: string;
  cliente_id?: string;
  stato?: StatoAttivita | "TUTTE";
  etichetta_id?: string;
}): Promise<EventoCalendario[]> {
  const where: string[] = ["a.data_scadenza >= @dal", "a.data_scadenza <= @al"];
  const params: Record<string, string> = { dal: opts.dal, al: opts.al };

  if (opts.progetto_id) {
    where.push("a.progetto_id = @progetto_id");
    params.progetto_id = opts.progetto_id;
  }
  if (opts.cliente_id) {
    // Filtro doppio: le attività dei progetti del cliente E gli eventi
    // sciolti collegati direttamente al cliente.
    where.push("(a.cliente_id = @cliente_id OR p.cliente_id = @cliente_id)");
    params.cliente_id = opts.cliente_id;
  }
  if (opts.stato && opts.stato !== "TUTTE") {
    where.push("a.stato = @stato");
    params.stato = opts.stato;
  }
  if (opts.etichetta_id) {
    // Solo gli eventi che portano l'etichetta: EXISTS sulla pivot, costa
    // pochi seek con l'indice (attivita_id, etichetta_id).
    where.push(
      "EXISTS (SELECT 1 FROM attivita_etichette ae WHERE ae.attivita_id = a.id AND ae.etichetta_id = @etichetta_id)"
    );
    params.etichetta_id = opts.etichetta_id;
  }

  const rows = await db
    .prepare(
      `SELECT a.id, a.progetto_id, a.cliente_id, a.titolo, a.descrizione, a.stato,
              a.priorita, a.data_inizio, a.data_scadenza, a.data_completamento,
              a.assegnatario, a.persone, a.data_creazione, a.data_aggiornamento,
              ag.stato         AS google_stato,
              ag.ultimo_errore AS google_ultimo_errore,
              ag.data_sync     AS google_data_sync,
              p.nome   AS progetto_nome,
              p.codice AS progetto_codice,
              COALESCE(cp.ragione_sociale, ca.ragione_sociale) AS cliente_ragione_sociale
       FROM attivita a
       LEFT JOIN progetti p  ON p.id  = a.progetto_id
       LEFT JOIN clienti  cp ON cp.id = p.cliente_id
       LEFT JOIN clienti  ca ON ca.id = a.cliente_id
       LEFT JOIN attivita_google ag ON ag.attivita_id = a.id
       WHERE ${where.join(" AND ")}
       ORDER BY a.data_scadenza ASC`
    )
    .all(params);

  // Le etichette arrivano con un secondo round-trip (una sola query per
  // tutti gli id): SQLite non ha un modo pulito di fare JSON aggregation
  // multi-join qui, e il calendario e' l'unico caller che le vuole.
  const etichettePerId = await getEtichettePerAttivita(
    (rows as unknown as { id: string }[]).map((r) => r.id)
  );

  return (rows as unknown as Record<string, unknown>[]).map((r): EventoCalendario => {
    const evento: EventoCalendario = {
      ...normalizza(r),
      // Le tre colonne del JOIN ci sono gia' nella riga, ma `normalizza`
      // restituisce il tipo base dell'attivita': qui vanno riportate perche'
      // il calendario le mostra (nome e codice del progetto, ragione sociale).
      progetto_nome: (r.progetto_nome as string | null) ?? null,
      progetto_codice: (r.progetto_codice as string | null) ?? null,
      cliente_ragione_sociale: (r.cliente_ragione_sociale as string | null) ?? null,
      etichette: etichettePerId.get(r.id as string) ?? [],
      tipo: "attivita",
    };
    return evento;
  });
}
