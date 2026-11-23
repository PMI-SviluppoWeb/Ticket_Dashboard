import "server-only";
import { db } from "./db";
import type {
  DashboardData,
  DashboardSintesi,
  TaskScadenzaDashboard,
  TempoDashboard,
} from "./types";

// ===========================================================================
// La home in una richiesta.
//
// La dashboard mostra ticket, task, progetti (solo conteggio) e tempo. Sono
// poche SELECT indipendenti dentro UN `db.batchRead`, quindi UNA richiesta
// HTTP. Nel batch non entra niente che dipenda da un risultato precedente:
// e' la regola del batch.
//
// Il calendario e la posta hanno endpoint propri: caricarli qui a ogni poll
// significava pagare query che la maggior parte delle visite non guarda.
//
// ---------------------------------------------------------------------------
// IL FUSO E' LA PARTE DELICATA
//
// Nel database convivono due convenzioni diverse:
//
//   attivita.data_scadenza   "YYYY-MM-DDTHH:mm" dell'ora di ROMA, scritta dal
//                            browser (input datetime-local), senza fuso
//   voci_tempo.inizio/fine   ISO 8601 UTC (lib/tempi.ts: nowISO)
//
// "Oggi" quindi non si ricava da `new Date()` del processo: in Docker il
// server gira in UTC, e `new Date().getHours()` darebbe le 22 di ieri mentre a
// Roma e' gia' oggi. I confini si calcolano esplicitamente in Europe/Rome: e'
// il fuso dei dati, non quello della macchina.
// ===========================================================================

const FUSO = "Europe/Rome";

const PARTI_ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const OFFSET_ROMA = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  timeZoneName: "longOffset",
});

interface PartiData {
  y: number;
  m: number;
  g: number;
}

function due(n: number): string {
  return String(n).padStart(2, "0");
}

function partiRoma(d: Date): PartiData & { h: number; min: number } {
  const p: Record<string, string> = {};
  for (const parte of PARTI_ROMA.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return {
    y: Number(p.year),
    m: Number(p.month),
    g: Number(p.day),
    // Alcune versioni ICU rendono la mezzanotte come "24" invece di "00".
    h: Number(p.hour === "24" ? "0" : p.hour),
    min: Number(p.minute),
  };
}

// Scostamento di Roma dall'UTC nell'istante dato, in millisecondi.
function offsetRomaMs(d: Date): number {
  const nome =
    OFFSET_ROMA.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ??
    "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(nome);
  if (!m) return 0; // "GMT" secco = UTC (non succede a Roma, ma non si sa mai)
  const segno = m[1] === "-" ? -1 : 1;
  return segno * (Number(m[2]) * 60 + Number(m[3] ?? "0")) * 60_000;
}

// Istante UTC in cui a Roma e' mezzanotte del giorno indicato.
//
// Due passaggi: l'offset da applicare dipende dall'istante, e l'istante
// dipende dall'offset. Il primo tentativo parte da mezzanotte UTC; il secondo
// usa l'offset di quell'istante. Serve perche' il giorno del cambio d'ora non
// ha lo stesso offset a inizio e fine giornata.
function mezzanotteRomaIso(y: number, m: number, g: number): string {
  const fintoUtc = Date.UTC(y, m - 1, g, 0, 0, 0);
  const primo = fintoUtc - offsetRomaMs(new Date(fintoUtc));
  const secondo = fintoUtc - offsetRomaMs(new Date(primo));
  return new Date(secondo).toISOString();
}

function aggiungiGiorni({ y, m, g }: PartiData, n: number): PartiData {
  const d = new Date(Date.UTC(y, m - 1, g + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, g: d.getUTCDate() };
}

function naive({ y, m, g }: PartiData): string {
  return `${y}-${due(m)}-${due(g)}`;
}

interface Confini {
  // ISO UTC: confini per voci_tempo (confrontabili come stringhe).
  adessoIso: string;
  oggiInizioIso: string;
  settimanaInizioIso: string;
  // "YYYY-MM-DDTHH:mm" di Roma: confini per attivita.data_scadenza.
  adessoNaive: string;
  // Orizzonte "in scadenza" (prossimi 7 giorni). La lista task invece mostra
  // tutte le aperte: qui serve solo per il conteggio della KPI.
  agendaAl: string;
}

function confini(adesso = new Date()): Confini {
  const r = partiRoma(adesso);
  const oggi = naive(r);
  const fraSette = aggiungiGiorni(r, 7);

  // Lunedì della settimana corrente: getUTCDay() su una data "finta" UTC
  // costruttita dai pezzi di Roma, così il calcolo non dipende dal fuso del
  // processo. 0 = domenica -> 6 giorni indietro.
  const giornoSettimana =
    (new Date(Date.UTC(r.y, r.m - 1, r.g)).getUTCDay() + 6) % 7;
  const lunedi = aggiungiGiorni(r, -giornoSettimana);

  return {
    adessoIso: adesso.toISOString(),
    oggiInizioIso: mezzanotteRomaIso(r.y, r.m, r.g),
    settimanaInizioIso: mezzanotteRomaIso(lunedi.y, lunedi.m, lunedi.g),
    adessoNaive: `${oggi}T${due(r.h)}:${due(r.min)}`,
    agendaAl: `${naive(fraSette)}T23:59`,
  };
}

// Le righe del batch arrivano come Record<string, unknown>: SUM(...) su zero
// righe e' NULL, non 0.
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function testo(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

type Riga = Record<string, unknown>;

// "Questa task e' mia": assegnatario OPPURE uno dei collaboratori.
//
// L'identita' resta il nome (lib/persone.ts), quindi la corrispondenza e' sul
// nome dell'operatore: una seek sulla primary key dentro la stessa query, non
// un round-trip in piu'. `json_each` srotola la colonna JSON in righe, cosi'
// l'appartenenza si verifica in SQL e non trascinando tutte le task nel
// processo per filtrarle in JS.
const MIA = `(
  a.assegnatario = (SELECT nome FROM operatori WHERE id = @operatore_id)
  OR EXISTS (
    SELECT 1 FROM json_each(a.persone)
    WHERE value = (SELECT nome FROM operatori WHERE id = @operatore_id)
  )
)`;

// Proiezione unica per lista personale e team: stesse colonne, stesso calcolo
// di "in ritardo"/"in scadenza". Evita che le due viste divergano.
function mappaTask(rows: Riga[], adessoNaive: string, agendaAl: string): TaskScadenzaDashboard[] {
  return rows.map((r) => {
    const data = testo(r.data_scadenza);
    return {
      id: String(r.id),
      titolo: String(r.titolo),
      stato: r.stato as TaskScadenzaDashboard["stato"],
      priorita: r.priorita as TaskScadenzaDashboard["priorita"],
      data_scadenza: data,
      assegnatario: testo(r.assegnatario),
      progetto_id: testo(r.progetto_id),
      progetto_nome: testo(r.progetto_nome),
      progetto_codice: testo(r.progetto_codice),
      cliente_ragione_sociale: testo(r.cliente_ragione_sociale),
      in_ritardo: Boolean(data && data < adessoNaive),
      in_scadenza: Boolean(data && data >= adessoNaive && data <= agendaAl),
    };
  });
}

export async function caricaDashboard(
  operatoreId: string
): Promise<DashboardData | null> {
  const c = confini();
  const paramsOperatore = { operatore_id: operatoreId };

  const [
    operatori,
    ticketRows,
    taskCountRows,
    taskRows,
    progettoCountRows,
    oggiRows,
    settimanaRows,
  ] = await db.batchRead([
    // 0 — Identità. Se l'id dell'header non esiste più, la route risponde 401.
    {
      sql: `SELECT id, nome, ruolo FROM operatori WHERE id = @operatore_id`,
      params: paramsOperatore,
    },

    // 1 — Ticket aperti: numeri di squadra e personali in UNA scansione.
    // `operatore` e' testo libero, quindi il confronto passa dalla sottoquery
    // sul nome: una seek sulla primary key, non un round-trip in più.
    {
      sql: `SELECT
              COUNT(*) AS tutti_aperti,
              SUM(CASE WHEN stato = 'NUOVO' THEN 1 ELSE 0 END) AS tutti_nuovi,
              SUM(CASE WHEN stato = 'IN_CORSO' THEN 1 ELSE 0 END) AS tutti_in_corso,
              SUM(CASE WHEN operatore IS NULL AND stato = 'NUOVO' THEN 1 ELSE 0 END) AS da_prendere,
              SUM(CASE WHEN operatore = (SELECT nome FROM operatori WHERE id = @operatore_id) THEN 1 ELSE 0 END) AS miei_aperti,
              SUM(CASE WHEN operatore = (SELECT nome FROM operatori WHERE id = @operatore_id) AND stato = 'NUOVO' THEN 1 ELSE 0 END) AS miei_nuovi,
              SUM(CASE WHEN operatore = (SELECT nome FROM operatori WHERE id = @operatore_id) AND stato = 'IN_CORSO' THEN 1 ELSE 0 END) AS miei_in_corso
            FROM tickets
            WHERE stato IN ('NUOVO', 'IN_CORSO')`,
      params: paramsOperatore,
    },

    // 2 — Le mie task: quante entro 7 giorni, quante già scadute. Il conteggio
    // resta sull'orizzonte breve della KPI; la lista sotto invece è completa.
    {
      sql: `SELECT
              SUM(CASE WHEN data_scadenza >= @adesso AND data_scadenza <= @limite THEN 1 ELSE 0 END) AS in_scadenza,
              SUM(CASE WHEN data_scadenza < @adesso THEN 1 ELSE 0 END) AS in_ritardo
            FROM attivita a
            WHERE ${MIA}
              AND a.stato <> 'COMPLETATA'
              AND a.data_scadenza IS NOT NULL`,
      params: {
        ...paramsOperatore,
        adesso: c.adessoNaive,
        limite: c.agendaAl,
      },
    },

    // 3 — Tutte le mie task aperte: con scadenza, in ritardo o senza data.
    //
    // Ordine: prima le scadute (dalla più recente, quella su cui si può ancora
    // intervenire), poi le prossime in ordine cronologico, infine le task senza
    // scadenza. `data_creazione DESC` dà un ordine stabile alle senza data.
    {
      sql: `SELECT a.id, a.titolo, a.stato, a.priorita, a.data_scadenza, a.assegnatario,
                   a.progetto_id,
                   p.nome   AS progetto_nome,
                   p.codice AS progetto_codice,
                   COALESCE(cp.ragione_sociale, ca.ragione_sociale) AS cliente_ragione_sociale
            FROM attivita a
            LEFT JOIN progetti p  ON p.id  = a.progetto_id
            LEFT JOIN clienti  cp ON cp.id = p.cliente_id
            LEFT JOIN clienti  ca ON ca.id = a.cliente_id
            WHERE ${MIA}
              AND a.stato <> 'COMPLETATA'
            ORDER BY
              CASE WHEN a.data_scadenza IS NULL THEN 1 ELSE 0 END,
              CASE WHEN a.data_scadenza < @adesso THEN 0 ELSE 1 END,
              CASE WHEN a.data_scadenza < @adesso
                   THEN julianday(@adesso) - julianday(a.data_scadenza)
                   ELSE 0 END,
              a.data_scadenza ASC,
              a.data_creazione DESC
            LIMIT 50`,
      params: {
        ...paramsOperatore,
        adesso: c.adessoNaive,
      },
    },

    // 4 — Il conteggio esatto dei progetti attivi (la lista non serve più:
    // la home mostra solo la cifra nella KPI).
    {
      sql: `SELECT COUNT(*) AS n FROM progetti WHERE stato IN ('IN_CORSO', 'IN_PAUSA')`,
      params: {},
    },

    // 5 — Minuti di oggi, solo voci CHIUSE e ritagliate sulla finestra.
    //
    // La voce aperta non entra: non ha un totale definitivo, e il client vi
    // somma il cronometro che scorre (stessa regola di minutiPerAttivita in
    // lib/tempi.ts). Sommarla qui la conterebbe due volte.
    {
      sql: `SELECT v.operatore_id, v.operatore,
                   CAST(ROUND(SUM(
                     (julianday(MIN(v.fine, @al)) - julianday(MAX(v.inizio, @dal))) * 1440.0
                   )) AS INTEGER) AS minuti
            FROM voci_tempo v
            WHERE v.fine IS NOT NULL AND v.fine > @dal AND v.inizio < @al
            GROUP BY v.operatore_id, v.operatore`,
      params: { dal: c.oggiInizioIso, al: c.adessoIso },
    },

    // 8 — Minuti da lunedì 00:00 (ora di Roma).
    {
      sql: `SELECT v.operatore_id, v.operatore,
                   CAST(ROUND(SUM(
                     (julianday(MIN(v.fine, @al)) - julianday(MAX(v.inizio, @dal))) * 1440.0
                   )) AS INTEGER) AS minuti
            FROM voci_tempo v
            WHERE v.fine IS NOT NULL AND v.fine > @dal AND v.inizio < @al
            GROUP BY v.operatore_id, v.operatore`,
      params: { dal: c.settimanaInizioIso, al: c.adessoIso },
    },
  ]);

  const operatore = operatori[0] as
    | { id: string; nome: string; ruolo: "admin" | "operatore" }
    | undefined;
  if (!operatore) return null;

  const tk = (ticketRows[0] ?? {}) as Riga;
  const tc = (taskCountRows[0] ?? {}) as Riga;

  // Tempo: le due query restituiscono una riga per operatore. "Mio" e "tutti"
  // si ricavano dallo stesso risultato, senza una terza query.
  const somma = (rows: Riga[]): number =>
    rows.reduce((acc, r) => acc + num(r.minuti), 0);
  const mieiMinuti = (rows: Riga[]): number =>
    num(rows.find((r) => r.operatore_id === operatore.id)?.minuti);

  const tempoMio: TempoDashboard = {
    minuti_oggi: mieiMinuti(oggiRows as Riga[]),
    minuti_settimana: mieiMinuti(settimanaRows as Riga[]),
  };
  const tempoTutti: TempoDashboard = {
    minuti_oggi: somma(oggiRows as Riga[]),
    minuti_settimana: somma(settimanaRows as Riga[]),
  };

  const sintesi: DashboardSintesi = {
    ticket: {
      miei: {
        aperti: num(tk.miei_aperti),
        nuovi: num(tk.miei_nuovi),
        in_corso: num(tk.miei_in_corso),
      },
      tutti: {
        aperti: num(tk.tutti_aperti),
        nuovi: num(tk.tutti_nuovi),
        in_corso: num(tk.tutti_in_corso),
        da_prendere: num(tk.da_prendere),
      },
    },
    task_miei: {
      in_scadenza: num(tc.in_scadenza),
      in_ritardo: num(tc.in_ritardo),
    },
    progetti_attivi: num((progettoCountRows[0] as Riga | undefined)?.n),
    tempo: { mio: tempoMio, tutti: tempoTutti },
  };

  const mieTask = mappaTask(taskRows as Riga[], c.adessoNaive, c.agendaAl);

  return {
    operatore,
    generato_il: c.adessoIso,
    sintesi,
    mie_task: mieTask,
  };
}

// Lista team: tutte le task aperte di tutti gli operatori. È admin-only ed è
// caricata solo quando l'admin attiva il toggle "Team" (endpoint dedicato),
// così la dashboard personale non paga questa query a ogni poll.
export async function caricaTaskTeam(): Promise<TaskScadenzaDashboard[]> {
  const c = confini();
  const rows = (await db
    .prepare(
      `SELECT a.id, a.titolo, a.stato, a.priorita, a.data_scadenza, a.assegnatario,
              a.progetto_id,
              p.nome   AS progetto_nome,
              p.codice AS progetto_codice,
              COALESCE(cp.ragione_sociale, ca.ragione_sociale) AS cliente_ragione_sociale
       FROM attivita a
       LEFT JOIN progetti p  ON p.id  = a.progetto_id
       LEFT JOIN clienti  cp ON cp.id = p.cliente_id
       LEFT JOIN clienti  ca ON ca.id = a.cliente_id
       WHERE a.stato <> 'COMPLETATA'
       ORDER BY
         CASE WHEN a.data_scadenza IS NULL THEN 1 ELSE 0 END,
         CASE WHEN a.data_scadenza < @adesso THEN 0 ELSE 1 END,
         CASE WHEN a.data_scadenza < @adesso
              THEN julianday(@adesso) - julianday(a.data_scadenza)
              ELSE 0 END,
         a.data_scadenza ASC,
         a.data_creazione DESC
       LIMIT 50`
    )
    .all({ adesso: c.adessoNaive })) as unknown as Riga[];

  return mappaTask(rows, c.adessoNaive, c.agendaAl);
}
