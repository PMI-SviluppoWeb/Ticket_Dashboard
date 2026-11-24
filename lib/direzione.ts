import "server-only";
import { db } from "./db";
import { caricaDashboard, confini } from "./dashboard";
import { getConfigSla } from "./sla-config";
import { inScadenza, valutaSla, type TicketSlaInput } from "./sla";
import type {
  DirezioneCosaFa,
  DirezioneData,
  DirezioneTicketAperto,
  DirezioneTrendPunto,
  PresenzaOperatore,
  Priorita,
  SquadraOperatore,
  StatoTicket,
  VoceApertaDashboard,
} from "./types";

// ===========================================================================
// Direzione: la vista "oggi" dell'admin.
//
// Non esiste un tracking di sessione: la presenza e' INFERITA.
//  - voce tempo aperta        -> "al lavoro" (e mostra su cosa)
//  - ultima azione < 30 min   -> "attivo" (registro o ultimo accesso)
//  - altrimenti               -> "non attivo"
//
// Gli impegni personali riusano caricaDashboard (stessa verita' della home);
// il resto e' un unico batchRead.
// ===========================================================================

const PRESENZA_ATTIVA_MINUTI = 30;
const MAX_TICKET_VALUTATI = 1000;
const TICKET_IN_EVIDENZA = 8;
const GIORNI_TREND = 7;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function testo(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function minutiTra(iso: string | null | undefined, adessoMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((adessoMs - t) / 60000));
}

function entroMinuti(
  iso: string | null | undefined,
  adessoMs: number,
  minuti: number
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && adessoMs - t <= minuti * 60000;
}

function ultimiGiorni(adessoMs: number, n: number): string[] {
  const base = new Date(adessoMs);
  const giorno = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(giorno.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

interface OperatoreRow {
  id: string;
  nome: string;
  ruolo: string;
  ultimo_accesso: string | null;
}

interface VoceApertaRow {
  operatore_id: string;
  operatore: string;
  inizio: string;
  descrizione: string | null;
  ticket_id: string | null;
  attivita_id: string | null;
  ticket_numero: string | null;
  ticket_sommario: string | null;
  attivita_titolo: string | null;
  attivita_progetto_id: string | null;
}

interface TicketRow {
  id: string;
  numero: string;
  cliente: string;
  sommario_problema: string;
  priorita: Priorita;
  stato: string;
  operatore: string | null;
  creato_il: string | null;
  preso_in_carico_il: string | null;
  chiuso_il: string | null;
}

function cosaFaDaVoce(row: VoceApertaRow, adessoMs: number): DirezioneCosaFa {
  const inizio = testo(row.inizio) ?? new Date(adessoMs).toISOString();
  const minuti = minutiTra(inizio, adessoMs);

  if (row.ticket_id) {
    const etichetta =
      [row.ticket_numero, row.ticket_sommario].filter(Boolean).join(" · ") ||
      "Ticket";
    return {
      tipo: "ticket",
      id: row.ticket_id,
      etichetta,
      progetto_id: null,
      inizio,
      minuti_finora: minuti,
    };
  }
  if (row.attivita_id) {
    return {
      tipo: "attivita",
      id: row.attivita_id,
      etichetta: row.attivita_titolo || "Attività",
      progetto_id: testo(row.attivita_progetto_id),
      inizio,
      minuti_finora: minuti,
    };
  }
  return {
    tipo: "generico",
    id: null,
    etichetta: row.descrizione || "Lavoro generico",
    progetto_id: null,
    inizio,
    minuti_finora: minuti,
  };
}

function rankSla(sla: DirezioneTicketAperto["sla"]): number {
  return sla === "scaduto" ? 0 : sla === "in_scadenza" ? 1 : 2;
}

const RANK_PRIORITA: Record<Priorita, number> = {
  ALTA: 0,
  MEDIA: 1,
  BASSA: 2,
};

export async function caricaDirezione(
  adminId: string
): Promise<DirezioneData | null> {
  const adesso = new Date();
  const adessoMs = adesso.getTime();
  const adessoIso = adesso.toISOString();
  const c = confini(adesso);
  const primoGiornoTrend = `${ultimiGiorni(adessoMs, GIORNI_TREND)[0]}T00:00:00.000Z`;

  const [base, righe, config] = await Promise.all([
    caricaDashboard(adminId),
    db.batchRead([
      // 0 — Operatori attivi.
      {
        sql: `SELECT id, nome, ruolo, ultimo_accesso FROM operatori
              WHERE attivo = 1 ORDER BY nome`,
        params: {},
      },
      // 1 — Voci tempo APERTE: cosa sta facendo ciascuno, adesso.
      {
        sql: `SELECT v.operatore_id, v.operatore, v.inizio, v.descrizione,
                     v.ticket_id, v.attivita_id,
                     t.numero AS ticket_numero,
                     t.sommario_problema AS ticket_sommario,
                     a.titolo AS attivita_titolo,
                     a.progetto_id AS attivita_progetto_id
              FROM voci_tempo v
              LEFT JOIN tickets t  ON t.id = v.ticket_id
              LEFT JOIN attivita a ON a.id = v.attivita_id
              WHERE v.fine IS NULL`,
        params: {},
      },
      // 2 — Minuti di oggi per operatore (solo voci chiuse, ritagliate).
      {
        sql: `SELECT v.operatore_id,
                     CAST(ROUND(SUM(
                       (julianday(MIN(v.fine, @al)) - julianday(MAX(v.inizio, @dal))) * 1440.0
                     )) AS INTEGER) AS minuti
              FROM voci_tempo v
              WHERE v.fine IS NOT NULL AND v.fine > @dal AND v.inizio < @al
              GROUP BY v.operatore_id`,
        params: { dal: c.oggiInizioIso, al: c.adessoIso },
      },
      // 3 — Minuti da lunedì per operatore.
      {
        sql: `SELECT v.operatore_id,
                     CAST(ROUND(SUM(
                       (julianday(MIN(v.fine, @al)) - julianday(MAX(v.inizio, @dal))) * 1440.0
                     )) AS INTEGER) AS minuti
              FROM voci_tempo v
              WHERE v.fine IS NOT NULL AND v.fine > @dal AND v.inizio < @al
              GROUP BY v.operatore_id`,
        params: { dal: c.settimanaInizioIso, al: c.adessoIso },
      },
      // 4 — Ticket aperti per operatore (nome testuale, come sul ticket).
      {
        sql: `SELECT operatore, COUNT(*) AS n FROM tickets
              WHERE eliminato_il IS NULL
                AND stato IN ('NUOVO','IN_CORSO')
                AND operatore IS NOT NULL
              GROUP BY operatore`,
        params: {},
      },
      // 5 — Task in ritardo per operatore (assegnatario O collaboratore).
      {
        sql: `SELECT o.id AS operatore_id, COUNT(DISTINCT a.id) AS n
              FROM operatori o
              JOIN attivita a
                ON a.stato <> 'COMPLETATA'
               AND a.data_scadenza IS NOT NULL
               AND a.data_scadenza < @adesso
               AND (
                 a.assegnatario = o.nome
                 OR EXISTS (SELECT 1 FROM json_each(a.persone) WHERE value = o.nome)
               )
              WHERE o.attivo = 1
              GROUP BY o.id`,
        params: { adesso: c.adessoNaive },
      },
      // 6 — Ultima azione registrata per operatore.
      {
        sql: `SELECT operatore_id, MAX(data) AS ultima
              FROM registro_attivita
              WHERE operatore_id IS NOT NULL
              GROUP BY operatore_id`,
        params: {},
      },
      // 7 — Ticket aperti per SLA e per la lista "in evidenza".
      {
        sql: `SELECT id, numero, cliente, sommario_problema, priorita, stato,
                     operatore, creato_il, preso_in_carico_il, chiuso_il
              FROM tickets
              WHERE eliminato_il IS NULL AND stato IN ('NUOVO','IN_CORSO')
              ORDER BY creato_il ASC
              LIMIT @limite`,
        params: { limite: MAX_TICKET_VALUTATI },
      },
      // 8 — Email in attesa di decisione umana.
      {
        sql: `SELECT COUNT(*) AS n FROM email_inbox
              WHERE stato_triage = 'da_verificare'`,
        params: {},
      },
      // 9 — Trend: ticket creati per giorno.
      {
        sql: `SELECT substr(creato_il, 1, 10) AS giorno, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND creato_il >= @da
              GROUP BY giorno`,
        params: { da: primoGiornoTrend },
      },
      // 10 — Trend: ticket chiusi per giorno.
      {
        sql: `SELECT substr(chiuso_il, 1, 10) AS giorno, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND chiuso_il >= @da
                AND stato IN ('CHIUSO','RISOLTO')
              GROUP BY giorno`,
        params: { da: primoGiornoTrend },
      },
    ]),
    getConfigSla(),
  ]);

  if (!base) return null;

  const [
    operatoriRows,
    vociAperteRows,
    oggiRows,
    settimanaRows,
    ticketPerOperatoreRows,
    taskRitardoRows,
    ultimaAttivitaRows,
    ticketApertiRows,
    inboxRows,
    trendCreatiRows,
    trendChiusiRows,
  ] = righe;

  const operatori = operatoriRows as unknown as OperatoreRow[];
  const vociAperte = vociAperteRows as unknown as VoceApertaRow[];
  const ticketAperti = ticketApertiRows as unknown as TicketRow[];

  const minutiOggi = new Map<string, number>();
  for (const r of oggiRows) {
    const id = testo(r.operatore_id);
    if (id) minutiOggi.set(id, num(r.minuti));
  }
  const minutiSettimana = new Map<string, number>();
  for (const r of settimanaRows) {
    const id = testo(r.operatore_id);
    if (id) minutiSettimana.set(id, num(r.minuti));
  }
  const ticketPerNome = new Map<string, number>();
  for (const r of ticketPerOperatoreRows) {
    const nome = testo(r.operatore);
    if (nome) ticketPerNome.set(nome, num(r.n));
  }
  const taskRitardoPerId = new Map<string, number>();
  for (const r of taskRitardoRows) {
    const id = testo(r.operatore_id);
    if (id) taskRitardoPerId.set(id, num(r.n));
  }
  const ultimaAttivita = new Map<string, string>();
  for (const r of ultimaAttivitaRows) {
    const id = testo(r.operatore_id);
    const quando = testo(r.ultima);
    if (id && quando) ultimaAttivita.set(id, quando);
  }
  const vocePerOperatore = new Map<string, VoceApertaRow>();
  for (const v of vociAperte) {
    vocePerOperatore.set(v.operatore_id, v);
  }

  const squadra: SquadraOperatore[] = operatori.map((o) => {
    const voce = vocePerOperatore.get(o.id) ?? null;
    const ultima = ultimaAttivita.get(o.id) ?? null;
    const presenza: PresenzaOperatore = voce
      ? "al_lavoro"
      : entroMinuti(ultima, adessoMs, PRESENZA_ATTIVA_MINUTI) ||
          entroMinuti(o.ultimo_accesso, adessoMs, PRESENZA_ATTIVA_MINUTI)
        ? "attivo"
        : "non_attivo";

    return {
      id: o.id,
      nome: o.nome,
      ruolo: o.ruolo === "admin" ? "admin" : "operatore",
      presenza,
      ultimo_accesso: o.ultimo_accesso,
      ultima_attivita: ultima,
      attivita_aperta: voce ? cosaFaDaVoce(voce, adessoMs) : null,
      minuti_oggi: minutiOggi.get(o.id) ?? 0,
      minuti_settimana: minutiSettimana.get(o.id) ?? 0,
      ticket_aperti: ticketPerNome.get(o.nome) ?? 0,
      task_in_ritardo: taskRitardoPerId.get(o.id) ?? 0,
    };
  });

  const ordinePresenza: Record<PresenzaOperatore, number> = {
    al_lavoro: 0,
    attivo: 1,
    non_attivo: 2,
  };
  squadra.sort(
    (a, b) =>
      ordinePresenza[a.presenza] - ordinePresenza[b.presenza] ||
      a.nome.localeCompare(b.nome, "it")
  );

  let slaScaduti = 0;
  let slaInScadenza = 0;
  const aperti: DirezioneTicketAperto[] = ticketAperti.map((t) => {
    const input: TicketSlaInput = {
      id: t.id,
      numero: t.numero,
      priorita: t.priorita,
      stato: t.stato,
      creatoIl: t.creato_il,
      presoIl: t.preso_in_carico_il,
      chiusoIl: t.chiuso_il,
    };
    const esito = valutaSla(input, config, adessoMs);
    const sla: DirezioneTicketAperto["sla"] = !esito
      ? null
      : esito.presaScaduta || esito.risoluzioneScaduta
        ? "scaduto"
        : inScadenza(esito, adessoMs)
          ? "in_scadenza"
          : null;
    if (sla === "scaduto") slaScaduti += 1;
    if (sla === "in_scadenza") slaInScadenza += 1;

    const creato = t.creato_il ? new Date(t.creato_il).getTime() : NaN;
    const etaOre = Number.isFinite(creato)
      ? Math.max(0, Math.round((adessoMs - creato) / 3_600_000))
      : 0;

    return {
      id: t.id,
      numero: t.numero,
      cliente: t.cliente,
      sommario: t.sommario_problema,
      priorita: t.priorita,
      stato: t.stato as StatoTicket,
      operatore: t.operatore,
      creato_il: t.creato_il,
      eta_ore: etaOre,
      sla,
    };
  });

  aperti.sort(
    (a, b) =>
      rankSla(a.sla) - rankSla(b.sla) ||
      RANK_PRIORITA[a.priorita] - RANK_PRIORITA[b.priorita] ||
      (a.creato_il ?? "").localeCompare(b.creato_il ?? "")
  );

  const trendCreati = new Map<string, number>();
  for (const r of trendCreatiRows) {
    const g = testo(r.giorno);
    if (g) trendCreati.set(g, num(r.n));
  }
  const trendChiusi = new Map<string, number>();
  for (const r of trendChiusiRows) {
    const g = testo(r.giorno);
    if (g) trendChiusi.set(g, num(r.n));
  }
  const trend: DirezioneTrendPunto[] = ultimiGiorni(adessoMs, GIORNI_TREND).map(
    (giorno) => ({
      giorno,
      creati: trendCreati.get(giorno) ?? 0,
      chiusi: trendChiusi.get(giorno) ?? 0,
    })
  );

  const voceAdmin = vocePerOperatore.get(adminId) ?? null;
  const attivitaApertaAdmin: VoceApertaDashboard | null = voceAdmin
    ? {
        operatore_id: voceAdmin.operatore_id,
        operatore: voceAdmin.operatore,
        inizio: voceAdmin.inizio,
        minuti_finora: minutiTra(voceAdmin.inizio, adessoMs),
        tipo: voceAdmin.ticket_id
          ? "ticket"
          : voceAdmin.attivita_id
            ? "attivita"
            : "generico",
        bersaglio: voceAdmin.ticket_id
          ? [voceAdmin.ticket_numero, voceAdmin.ticket_sommario]
              .filter(Boolean)
              .join(" · ") || "Ticket"
          : voceAdmin.attivita_id
            ? voceAdmin.attivita_titolo
            : voceAdmin.descrizione,
      }
    : null;

  const alLavoro = squadra.filter((o) => o.presenza === "al_lavoro").length;
  const attivi = squadra.filter((o) => o.presenza === "attivo").length;

  return {
    generato_il: adessoIso,
    kpi: {
      ticket: base.sintesi.ticket.tutti,
      sla: { scaduti: slaScaduti, in_scadenza: slaInScadenza },
      tempo: {
        oggi_minuti: base.sintesi.tempo.tutti.minuti_oggi,
        settimana_minuti: base.sintesi.tempo.tutti.minuti_settimana,
      },
      squadra: { al_lavoro: alLavoro, attivi, totale: squadra.length },
      inbox_da_verificare: num(inboxRows[0]?.n),
      progetti_attivi: base.sintesi.progetti_attivi,
    },
    squadra,
    ticket_aperti: aperti.slice(0, TICKET_IN_EVIDENZA),
    miei: {
      ticket: base.sintesi.ticket.miei,
      task: base.sintesi.task_miei,
      task_lista: base.mie_task,
      tempo: base.sintesi.tempo.mio,
      attivita_aperta: attivitaApertaAdmin,
    },
    trend,
  };
}
