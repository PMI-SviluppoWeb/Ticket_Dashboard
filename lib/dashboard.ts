import "server-only";
import { db } from "./db";
import { parsePersone } from "./persone";
import { getEtichettePerAttivita } from "./etichette";
import type {
  DashboardData,
  DashboardSintesi,
  EventoAgendaDashboard,
  ProgettoDashboard,
  TaskScadenzaDashboard,
  TempoDashboard,
  VoceApertaDashboard,
} from "./types";

// ===========================================================================
// La home in una richiesta.
//
// La dashboard mostra ticket, task, agenda, progetti e tempo: cinque domini che
// con un endpoint ciascuno costerebbero cinque viaggi verso il Turso remoto.
// Qui sono dieci SELECT indipendenti dentro UN `db.batchRead`, quindi UNA
// richiesta HTTP. Nel batch non entra niente che dipenda da un risultato
// precedente: e' la regola del batch.
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
  agendaDal: string;
  agendaAl: string;
  // Quanto indietro guarda "in ritardo". Non illimitato: un blocco da 20 righe
  // ordinate per data veniva riempito da task scadute mesi fa, e le cose da
  // fare OGGI restavano fuori dal limite. Una task ferma da piu' di due
  // settimane non e' piu' una scadenza, e' un dato da sistemare altrove.
  taskDal: string;
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
    // La giornata di oggi entra intera (anche la mattina già passata), poi
    // sette giorni in avanti: chi apre la dashboard alle 8 deve vedere anche
    // l'evento delle 9 di stamattina.
    agendaDal: `${oggi}T00:00`,
    agendaAl: `${naive(fraSette)}T23:59`,
    taskDal: `${naive(aggiungiGiorni(r, -14))}T00:00`,
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
    agendaRows,
    progettoRows,
    progettoCountRows,
    oggiRows,
    settimanaRows,
    aperteRows,
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

    // 2 — Le mie task: quante entro 7 giorni, quante gia' scadute.
    // Stessa forma "YYYY-MM-DDTHH:mm", quindi il confronto e' lessicografico.
    // `in_ritardo` usa la stessa finestra del blocco (statement 3): se il
    // conteggio e la lista guardassero intervalli diversi, la cella direbbe
    // "3 in ritardo" e la lista ne mostrerebbe altre.
    {
      sql: `SELECT
              SUM(CASE WHEN data_scadenza >= @adesso AND data_scadenza <= @limite THEN 1 ELSE 0 END) AS in_scadenza,
              SUM(CASE WHEN data_scadenza < @adesso THEN 1 ELSE 0 END) AS in_ritardo
            FROM attivita a
            WHERE ${MIA}
              AND a.stato <> 'COMPLETATA'
              AND a.data_scadenza IS NOT NULL
              AND a.data_scadenza >= @dal`,
      params: {
        ...paramsOperatore,
        adesso: c.adessoNaive,
        limite: c.agendaAl,
        dal: c.taskDal,
      },
    },

    // 3 — Le mie task in scadenza (comprese quelle in ritardo).
    //
    // Ordine: prima le scadute, dalla piu' recente (e' quella su cui si puo'
    // ancora intervenire), poi le prossime in ordine cronologico. Il secondo
    // criterio per le scadute e' "giorni di ritardo" crescente: un solo
    // numero invece del confronto fra date, che in SQLite richiederebbe
    // julianday su entrambi i lati.
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
              AND a.data_scadenza IS NOT NULL
              AND a.data_scadenza >= @dal
              AND a.data_scadenza <= @limite
            ORDER BY
              CASE WHEN a.data_scadenza < @adesso THEN 0 ELSE 1 END,
              CASE WHEN a.data_scadenza < @adesso
                   THEN julianday(@adesso) - julianday(a.data_scadenza)
                   ELSE 0 END,
              a.data_scadenza ASC
            LIMIT 20`,
      params: {
        ...paramsOperatore,
        adesso: c.adessoNaive,
        dal: c.taskDal,
        limite: c.agendaAl,
      },
    },

    // 4 — Agenda: oggi intero + 7 giorni. Gli eventi senza scadenza non
    // esistono per il calendario, ed e' la stessa regola di listEventiCalendario.
    {
      sql: `SELECT a.id, a.titolo, a.stato, a.priorita, a.data_scadenza, a.assegnatario,
                   a.persone, a.progetto_id, a.cliente_id,
                   p.nome   AS progetto_nome,
                   p.codice AS progetto_codice,
                   COALESCE(cp.ragione_sociale, ca.ragione_sociale) AS cliente_ragione_sociale
            FROM attivita a
            LEFT JOIN progetti p  ON p.id  = a.progetto_id
            LEFT JOIN clienti  cp ON cp.id = p.cliente_id
            LEFT JOIN clienti  ca ON ca.id = a.cliente_id
            WHERE a.data_scadenza >= @dal AND a.data_scadenza <= @al
            ORDER BY a.data_scadenza ASC
            LIMIT 60`,
      params: { dal: c.agendaDal, al: c.agendaAl },
    },

    // 5 — Progetti attivi, i primi a scadere. Stesse sottoquery di listProgetti:
    // con (progetto_id, stato) indicizzato costano pochi seek per riga, mentre
    // un GROUP BY sull'intera attivita' scandirebbe tutto a ogni poll.
    {
      sql: `SELECT p.id, p.codice, p.nome, p.stato, p.data_fine,
                   COALESCE(c.ragione_sociale, p.cliente_id) AS cliente_ragione_sociale,
                   (SELECT COUNT(*) FROM attivita a WHERE a.progetto_id = p.id) AS num_attivita,
                   (SELECT COUNT(*) FROM attivita a
                     WHERE a.progetto_id = p.id AND a.stato = 'COMPLETATA') AS num_attivita_completate,
                   (SELECT COUNT(*) FROM progetti_tickets pt WHERE pt.progetto_id = p.id) AS num_ticket
            FROM progetti p
            LEFT JOIN clienti c ON c.id = p.cliente_id
            WHERE p.stato IN ('IN_CORSO', 'IN_PAUSA')
            ORDER BY (p.data_fine IS NULL), p.data_fine ASC, p.nome ASC
            LIMIT 6`,
      params: {},
    },

    // 6 — Il conteggio esatto, perché la lista sopra è limitata a 6.
    {
      sql: `SELECT COUNT(*) AS n FROM progetti WHERE stato IN ('IN_CORSO', 'IN_PAUSA')`,
      params: {},
    },

    // 7 — Minuti di oggi, solo voci CHIUSE e ritagliate sulla finestra.
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

    // 9 — Chi sta lavorando adesso. Il filtro per ruolo si applica in JS:
    // l'elenco nomina i colleghi, e quei nomi restano agli amministratori.
    {
      sql: `SELECT v.operatore_id, v.operatore, v.inizio,
                   CAST(ROUND((julianday(@adesso) - julianday(v.inizio)) * 1440.0) AS INTEGER) AS minuti_finora,
                   CASE
                     WHEN v.attivita_id IS NOT NULL THEN 'attivita'
                     WHEN v.ticket_id   IS NOT NULL THEN 'ticket'
                     ELSE 'generico'
                   END AS tipo,
                   COALESCE(a.titolo, t.numero || ' · ' || t.sommario_problema) AS bersaglio
            FROM voci_tempo v
            LEFT JOIN attivita a ON a.id = v.attivita_id
            LEFT JOIN tickets  t ON t.id = v.ticket_id
            WHERE v.fine IS NULL
            ORDER BY v.inizio ASC
            LIMIT 20`,
      params: { adesso: c.adessoIso },
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

  // Stessa regola di `MIA`, applicata alle righe gia' lette: una task/evento
  // e' mio se compare come assegnatario o fra i collaboratori.
  const appartieneA = (r: Riga, nome: string): boolean =>
    r.assegnatario === nome ||
    parsePersone(r.persone).some((p) => p.toLowerCase() === nome.toLowerCase());

  // Le etichette dell'agenda arrivano con un secondo round-trip: la pivot
  // dipende dagli id appena letti, quindi non puo' entrare nel batch.
  const etichetteAgenda = await getEtichettePerAttivita(
    (agendaRows as Riga[]).map((r) => String(r.id))
  );

  const agenda: EventoAgendaDashboard[] = (agendaRows as Riga[]).map((r) => ({
    id: String(r.id),
    titolo: String(r.titolo),
    stato: r.stato as EventoAgendaDashboard["stato"],
    priorita: r.priorita as EventoAgendaDashboard["priorita"],
    data_scadenza: String(r.data_scadenza),
    assegnatario: testo(r.assegnatario),
    progetto_id: testo(r.progetto_id),
    cliente_id: testo(r.cliente_id),
    progetto_nome: testo(r.progetto_nome),
    progetto_codice: testo(r.progetto_codice),
    cliente_ragione_sociale: testo(r.cliente_ragione_sociale),
    mia: appartieneA(r, operatore.nome),
    in_ritardo: String(r.data_scadenza) < c.adessoNaive,
    etichette: etichetteAgenda.get(String(r.id)) ?? [],
  }));

  const mieTask: TaskScadenzaDashboard[] = (taskRows as Riga[]).map((r) => ({
    id: String(r.id),
    titolo: String(r.titolo),
    stato: r.stato as TaskScadenzaDashboard["stato"],
    priorita: r.priorita as TaskScadenzaDashboard["priorita"],
    data_scadenza: String(r.data_scadenza),
    assegnatario: testo(r.assegnatario),
    progetto_id: testo(r.progetto_id),
    progetto_nome: testo(r.progetto_nome),
    progetto_codice: testo(r.progetto_codice),
    cliente_ragione_sociale: testo(r.cliente_ragione_sociale),
    in_ritardo: String(r.data_scadenza) < c.adessoNaive,
  }));

  const progetti: ProgettoDashboard[] = (progettoRows as Riga[]).map((r) => ({
    id: String(r.id),
    codice: String(r.codice),
    nome: String(r.nome),
    stato: r.stato as ProgettoDashboard["stato"],
    data_fine: testo(r.data_fine),
    cliente_ragione_sociale: String(r.cliente_ragione_sociale ?? ""),
    num_attivita: num(r.num_attivita),
    num_attivita_completate: num(r.num_attivita_completate),
    num_ticket: num(r.num_ticket),
  }));

  const inCorsoOra: VoceApertaDashboard[] =
    operatore.ruolo === "admin"
      ? (aperteRows as Riga[]).map((r) => ({
          operatore_id: String(r.operatore_id),
          operatore: String(r.operatore),
          inizio: String(r.inizio),
          minuti_finora: num(r.minuti_finora),
          tipo: r.tipo as VoceApertaDashboard["tipo"],
          bersaglio: testo(r.bersaglio),
        }))
      : [];

  return {
    operatore,
    generato_il: c.adessoIso,
    sintesi,
    agenda,
    mie_task: mieTask,
    progetti,
    in_corso_ora: inCorsoOra,
  };
}
