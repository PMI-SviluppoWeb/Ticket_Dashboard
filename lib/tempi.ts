import "server-only";
import { db, type BatchStatement } from "./db";
import type { VoceTempoEstesa, VoceTempoInput } from "./types";

// ===========================================================================
// Voci di tempo (cronometro).
//
// Regole del modulo:
//
// - UNA sola voce in corso per operatore. Non e' un vincolo del DB (un indice
//   parziale non e' portabile su tutte le versioni di libSQL), e' una regola
//   applicata qui: `avvia` chiude prima quella eventualmente aperta. Due
//   cronometri aperti in parallelo sommerebbero ore che non esistono.
//
// - Il tempo NON si modifica a posteriori da qui: si registra e si chiude.
//   La correzione manuale resta dove c'era gia' (tempo effettivo del ticket).
//
// - Le voci non hanno FK verso attivita/tickets. Un bersaglio cancellato
//   lascia la voce: il tempo e' stato lavorato davvero, e perderlo
//   nasconderebbe ore reali. `bersaglio` diventa NULL in lettura.
//
// - Le letture usano "no-store" per lo stesso motivo del resto dell'app: le
//   risposte SQL non devono essere congelate dalla cache di fetch di Next.
// ===========================================================================

function nowISO(): string {
  return new Date().toISOString();
}

// Il bersaglio risolto, con il tipo esplicito. COALESCE fra i tre casi:
// attivita' (task o evento), ticket, nessuno.
const SELECT_ESTESA = `
  SELECT v.id, v.attivita_id, v.ticket_id, v.operatore_id, v.operatore,
         v.descrizione, v.inizio, v.fine, v.data_creazione, v.data_aggiornamento,
         CASE
           WHEN v.attivita_id IS NOT NULL THEN 'attivita'
           WHEN v.ticket_id   IS NOT NULL THEN 'ticket'
           ELSE 'generico'
         END AS tipo,
         COALESCE(a.titolo, t.numero || ' · ' || t.sommario_problema) AS bersaglio
  FROM voci_tempo v
  LEFT JOIN attivita a ON a.id = v.attivita_id
  LEFT JOIN tickets  t ON t.id = v.ticket_id
`;

export async function getVoceAperta(operatoreId: string): Promise<VoceTempoEstesa | null> {
  const row = await db
    .prepare(
      `${SELECT_ESTESA}
       WHERE v.operatore_id = @operatore_id AND v.fine IS NULL
       ORDER BY v.inizio DESC
       LIMIT 1`
    )
    .get({ operatore_id: operatoreId });
  return (row as unknown as VoceTempoEstesa | undefined) ?? null;
}

export async function listVociOperatore(
  operatoreId: string,
  opts?: { limite?: number }
): Promise<VoceTempoEstesa[]> {
  const limite = Math.min(500, Math.max(1, opts?.limite ?? 100));
  const rows = await db
    .prepare(
      `${SELECT_ESTESA}
       WHERE v.operatore_id = @operatore_id
       ORDER BY v.inizio DESC
       LIMIT @limite`
    )
    .all({ operatore_id: operatoreId, limite });
  return rows as unknown as VoceTempoEstesa[];
}

// Voci di un bersaglio, per il totale mostrato nella riga della task o nel
// pannello del ticket.
export async function listVociAttivita(attivitaId: string): Promise<VoceTempoEstesa[]> {
  const rows = await db
    .prepare(
      `${SELECT_ESTESA}
       WHERE v.attivita_id = @attivita_id
       ORDER BY v.inizio DESC`
    )
    .all({ attivita_id: attivitaId });
  return rows as unknown as VoceTempoEstesa[];
}

export async function listVociTicket(ticketId: string): Promise<VoceTempoEstesa[]> {
  const rows = await db
    .prepare(
      `${SELECT_ESTESA}
       WHERE v.ticket_id = @ticket_id
       ORDER BY v.inizio DESC`
    )
    .all({ ticket_id: ticketId });
  return rows as unknown as VoceTempoEstesa[];
}

// Totali per un insieme di attivita', in una sola query invece di una per
// riga: la board mostra il tempo su ogni task e N query sarebbero N round-trip
// verso il DB remoto. Restituisce solo gli id che hanno almeno una voce.
//
// Solo voci CHIUSE. Una voce ancora in corso non ha un totale definitivo, e la
// riga la somma da sola dal cronometro (`secondi`): includerla qui la contare
// due volte, perche' la riga aggiungerebbe il tempo che sta scorrendo a un
// numero che lo contiene gia' fino all'istante della query.
export async function minutiPerAttivita(
  progettoId: string
): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT v.attivita_id AS id,
              SUM((julianday(v.fine) - julianday(v.inizio)) * 24 * 60) AS minuti
       FROM voci_tempo v
       JOIN attivita a ON a.id = v.attivita_id
       WHERE a.progetto_id = @progetto_id AND v.fine IS NOT NULL
       GROUP BY v.attivita_id`
    )
    .all({ progetto_id: progettoId });

  const result: Record<string, number> = {};
  for (const r of rows as unknown as { id: string; minuti: number | null }[]) {
    if (r.id) result[r.id] = Math.round(Number(r.minuti ?? 0));
  }
  return result;
}

// Avvia un cronometro. Chiude prima l'eventuale voce aperta dello stesso
// operatore: e' l'unico punto in cui si puo' creare una voce, quindi la regola
// "una sola voce in corso" vale per tutti i percorsi.
export async function avviaVoce(
  operatore: { id: string; nome: string },
  input: VoceTempoInput
): Promise<VoceTempoEstesa> {
  const attivitaId = input.attivita_id || null;
  const ticketId = input.ticket_id || null;

  // Il CHECK della tabella lo impedirebbe comunque, ma qui il messaggio e'
  // utile all'utente; al DB arriverebbe un errore di constraint generico.
  if (attivitaId && ticketId) {
    throw new Error("Una voce di tempo non può riferirsi a un'attività e a un ticket insieme.");
  }

  const ts = nowISO();
  const id = crypto.randomUUID();

  // L'annotazione esplicita e' necessaria: senza, TypeScript unifica i due
  // `params` in un'unione con proprieta' opzionali `undefined`, che non e' un
  // Record valido per il batch.
  const statements: BatchStatement[] = [
    // Chiude l'eventuale voce aperta. Un solo cronometro per operatore.
    {
      sql: `UPDATE voci_tempo SET fine = @ts, data_aggiornamento = @ts
            WHERE operatore_id = @operatore_id AND fine IS NULL`,
      params: { ts, operatore_id: operatore.id },
    },
    {
      sql: `INSERT INTO voci_tempo (
              id, attivita_id, ticket_id, operatore_id, operatore, descrizione,
              inizio, fine, data_creazione, data_aggiornamento
            ) VALUES (
              @id, @attivita_id, @ticket_id, @operatore_id, @operatore, @descrizione,
              @inizio, NULL, @ts, @ts
            )`,
      params: {
        id,
        attivita_id: attivitaId,
        ticket_id: ticketId,
        operatore_id: operatore.id,
        operatore: operatore.nome,
        descrizione: input.descrizione?.trim() || null,
        inizio: ts,
        ts,
      },
    },
  ];

  await db.batch(statements);

  const row = await db
    .prepare(`${SELECT_ESTESA} WHERE v.id = @id`)
    .get({ id });
  if (!row) throw new Error("Registrazione della voce di tempo non riuscita.");
  return row as unknown as VoceTempoEstesa;
}

// Ferma una voce. `operatoreId` e' richiesto: fermare il cronometro di un
// altro non e' un'operazione che l'app espone.
export async function fermaVoce(
  id: string,
  operatoreId: string
): Promise<VoceTempoEstesa | null> {
  const corrente = await db
    .prepare("SELECT id, operatore_id, fine FROM voci_tempo WHERE id = ?")
    .get(id);
  if (!corrente) return null;
  if (corrente.operatore_id !== operatoreId) return null;

  // Gia' chiusa: idempotente. Due clic ravvicinati non devono sovrascrivere la
  // fine con un istante piu' tardo, allungando la voce.
  if (corrente.fine) {
    const row = await db.prepare(`${SELECT_ESTESA} WHERE v.id = @id`).get({ id });
    return (row as unknown as VoceTempoEstesa | undefined) ?? null;
  }

  const ts = nowISO();
  await db
    .prepare("UPDATE voci_tempo SET fine = @ts, data_aggiornamento = @ts WHERE id = @id")
    .run({ id, ts });

  const row = await db.prepare(`${SELECT_ESTESA} WHERE v.id = @id`).get({ id });
  return (row as unknown as VoceTempoEstesa | undefined) ?? null;
}

// Elimina una voce registrata per errore (es. timer dimenticato aperto per
// due giorni). Solo il proprietario. Una voce in corso va fermata, non
// cancellata: e' il cronometro, non un dato storico.
export async function eliminaVoce(id: string, operatoreId: string): Promise<boolean> {
  const res = await db
    .prepare(
      "DELETE FROM voci_tempo WHERE id = @id AND operatore_id = @operatore_id AND fine IS NOT NULL"
    )
    .run({ id, operatore_id: operatoreId });
  return res.changes > 0;
}

// Totali per il riepilogo del progetto: minuti per operatore su tutte le voci
// delle attivita' del progetto, piu' quelle agganciate ai suoi ticket.
export async function riepilogoTempiProgetto(progettoId: string): Promise<{
  totale: number;
  perOperatore: { nome: string; minuti: number }[];
}> {
  const rows = await db
    .prepare(
      `SELECT v.operatore AS nome,
              SUM((julianday(COALESCE(v.fine, @adesso)) - julianday(v.inizio)) * 24 * 60) AS minuti
       FROM voci_tempo v
       WHERE v.attivita_id IN (SELECT id FROM attivita WHERE progetto_id = @progetto_id)
          OR v.ticket_id IN (SELECT ticket_id FROM progetti_tickets WHERE progetto_id = @progetto_id)
       GROUP BY v.operatore
       ORDER BY minuti DESC`
    )
    .all({ progetto_id: progettoId, adesso: nowISO() });

  const perOperatore = (rows as unknown as { nome: string; minuti: number | null }[]).map(
    (r) => ({ nome: r.nome || "Non assegnato", minuti: Math.round(Number(r.minuti ?? 0)) })
  );
  return {
    totale: perOperatore.reduce((acc, r) => acc + r.minuti, 0),
    perOperatore,
  };
}
