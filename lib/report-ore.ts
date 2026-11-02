import "server-only";
import { db } from "./db";

// ===========================================================================
// Report ore (fatturazione agenzia).
//
// Risponde a "quante ore su questo cliente a ottobre?": le voci di tempo
// (voci_tempo) vengono agganciate al cliente attraverso i due bersagli
// possibili — attivita' e ticket — con la stessa cascata che usa l'app:
// cliente diretto dell'attivita' -> cliente del progetto -> nome libero sul
// ticket.
//
// NOTE di precisione:
// - `inizio`/`fine` sono ISO UTC, ma il report ragiona per data LOCALE: la
//   query tira su una finestra di +-1 giorno e il filtro preciso e' in JS.
//   Filtro SQL puro sulla data UTC sposterebbe di un giorno le voci partite
//   tra 00:00 e 02:00 locali.
// - Una voce ancora aperta (fine NULL) conta fino ad adesso e viene segnata:
//   e' tempo in corso, non tempo chiuso.
// ===========================================================================

export interface FiltroReport {
  da: string; // YYYY-MM-DD
  a: string; // YYYY-MM-DD
  cliente?: string; // ragione sociale, match ESATTO sul nome risolto
  operatoreId?: string;
}

export interface VoceReport {
  id: string;
  operatore: string;
  cliente: string;
  progetto: string | null;
  bersaglio: string | null;
  tipo: "attivita" | "ticket" | "generico";
  descrizione: string | null;
  inizio: string;
  fine: string | null;
  minuti: number;
  aperta: boolean;
}

export interface ReportOre {
  da: string;
  a: string;
  totaleMinuti: number;
  vociTotali: number;
  vociAperte: number;
  perCliente: { cliente: string; minuti: number; voci: number }[];
  perOperatore: { operatore: string; minuti: number; voci: number }[];
  dettaglio: VoceReport[];
}

const pad = (n: number) => String(n).padStart(2, "0");

// Data locale (YYYY-MM-DD) di un timestamp ISO.
function dataLocale(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sposta una data YYYY-MM-DD di +/- giorni (per la finestra SQL larga).
function spostaData(data: string, giorni: number): string {
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + giorni);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function minutiTra(inizio: string, fine: string | null, adessoMs: number): number {
  const start = Date.parse(inizio);
  const end = fine ? Date.parse(fine) : adessoMs;
  if (!Number.isFinite(start)) return 0;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

type RigaSQL = {
  id: string;
  operatore: string;
  inizio: string;
  fine: string | null;
  descrizione: string | null;
  tipo: "attivita" | "ticket" | "generico";
  bersaglio: string | null;
  cliente: string | null;
  progetto: string | null;
};

export async function reportOre(filtro: FiltroReport): Promise<ReportOre> {
  const adessoMs = Date.now();

  // Finestra SQL larga di un giorno a ogni lato: il confine preciso lo decide
  // il filtro per data locale qui sotto.
  const righe = (await db
    .prepare(
      `SELECT v.id,
              v.operatore,
              v.inizio,
              v.fine,
              v.descrizione,
              CASE
                WHEN v.attivita_id IS NOT NULL THEN 'attivita'
                WHEN v.ticket_id   IS NOT NULL THEN 'ticket'
                ELSE 'generico'
              END AS tipo,
              COALESCE(a.titolo, t.numero || ' · ' || t.sommario_problema) AS bersaglio,
              COALESCE(ca.ragione_sociale, cpa.ragione_sociale, cpt.ragione_sociale,
                       t.cliente) AS cliente,
              COALESCE(p_att.nome, p_tik.nome) AS progetto
       FROM voci_tempo v
       LEFT JOIN attivita a              ON a.id = v.attivita_id
       LEFT JOIN clienti ca              ON ca.id = a.cliente_id
       LEFT JOIN progetti p_att          ON p_att.id = a.progetto_id
       LEFT JOIN clienti cpa             ON cpa.id = p_att.cliente_id
       LEFT JOIN tickets t               ON t.id = v.ticket_id
       LEFT JOIN progetti_tickets pt     ON pt.ticket_id = t.id
       LEFT JOIN progetti p_tik          ON p_tik.id = pt.progetto_id
       LEFT JOIN clienti cpt             ON cpt.id = p_tik.cliente_id
       WHERE substr(v.inizio, 1, 10) BETWEEN @da_larga AND @a_larga
         AND (@operatore_id IS NULL OR v.operatore_id = @operatore_id)
       ORDER BY v.inizio DESC`
    )
    .all({
      da_larga: spostaData(filtro.da, -1),
      a_larga: spostaData(filtro.a, 1),
      operatore_id: filtro.operatoreId ?? null,
    })) as unknown as RigaSQL[];

  const voci: VoceReport[] = [];
  for (const r of righe) {
    if (dataLocale(r.inizio) < filtro.da || dataLocale(r.inizio) > filtro.a) continue;
    const cliente = r.cliente ?? "(nessun cliente)";
    if (filtro.cliente && cliente !== filtro.cliente) continue;
    voci.push({
      id: r.id,
      operatore: r.operatore,
      cliente,
      progetto: r.progetto,
      bersaglio: r.bersaglio,
      tipo: r.tipo,
      descrizione: r.descrizione,
      inizio: r.inizio,
      fine: r.fine,
      minuti: minutiTra(r.inizio, r.fine, adessoMs),
      aperta: !r.fine,
    });
  }

  const aggrega = (
    key: (v: VoceReport) => string
  ): { nome: string; minuti: number; voci: number }[] => {
    const agg = new Map<string, { minuti: number; voci: number }>();
    for (const v of voci) {
      const k = key(v);
      const cur = agg.get(k) ?? { minuti: 0, voci: 0 };
      cur.minuti += v.minuti;
      cur.voci += 1;
      agg.set(k, cur);
    }
    return Array.from(agg.entries())
      .map(([nome, val]) => ({ nome, ...val }))
      .sort((x, y) => y.minuti - x.minuti);
  };

  const perCliente = aggrega((v) => v.cliente).map(({ nome, minuti, voci: n }) => ({
    cliente: nome,
    minuti,
    voci: n,
  }));
  const perOperatore = aggrega((v) => v.operatore || "Non assegnato").map(
    ({ nome, minuti, voci: n }) => ({ operatore: nome, minuti, voci: n })
  );

  return {
    da: filtro.da,
    a: filtro.a,
    totaleMinuti: voci.reduce((s, v) => s + v.minuti, 0),
    vociTotali: voci.length,
    vociAperte: voci.filter((v) => v.aperta).length,
    perCliente,
    perOperatore,
    dettaglio: voci,
  };
}

// Export CSV per Excel IT: BOM UTF-8 (altrimenti accenti mojibake) e ";" come
// separatore (la virgola e' il separatore decimale nelle locale italiane).
export function reportCsv(report: ReportOre): string {
  const esc = (v: string | number | null): string => {
    const s = String(v ?? "");
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const quando = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const header = [
    "Cliente",
    "Progetto",
    "Bersaglio",
    "Tipo",
    "Operatore",
    "Descrizione",
    "Inizio",
    "Fine",
    "Minuti",
    "Stato",
  ];
  const righe = report.dettaglio.map((v) =>
    [
      esc(v.cliente),
      esc(v.progetto ?? ""),
      esc(v.bersaglio ?? ""),
      esc(v.tipo),
      esc(v.operatore),
      esc(v.descrizione ?? ""),
      esc(quando(v.inizio)),
      esc(quando(v.fine)),
      esc(v.minuti),
      esc(v.aperta ? "in corso" : "chiusa"),
    ].join(";")
  );

  // BOM prima di ogni riga: Excel riconosce l'UTF-8 solo con il BOM.
  return "\uFEFF" + [header.join(";"), ...righe].join("\r\n") + "\r\n";
}
