import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const GIORNI_SOGGIA = 3;

interface OperatorStats {
  id: string;
  nome: string;
  email: string;
  ruolo: string;
  attivo: boolean;
  ultimo_accesso: string | null;
  ticket_in_corso: number;
  ticket_nuovi: number;
  ticket_risolti: number;
  ticket_chiusi: number;
  ticket_chiusi_settimana: number;
  ticket_totali: number;
  ticket_recenti: {
    id: string;
    numero: string;
    sommario_problema: string;
    priorita: string;
    stato: string;
    data_aggiornamento: string;
  }[];
  ticket_arretrati: {
    id: string;
    numero: string;
    sommario_problema: string;
    priorita: string;
    stato: string;
    data_aggiornamento: string;
    giorni_fermi: number;
  }[];
  ticket_arretrati_count: number;
}

// ===========================================================================
// Statistiche per operatore.
//
// Prima: una query per gli operatori e TRE query per ogni operatore (stats,
// recenti, arretrati), tutte dentro un Promise.all -> 1 + 3N richieste verso un
// DB remoto, ogni 30 secondi. Con cinque operatori erano 16 richieste.
//
// Ora: quattro SELECT in UNA richiesta (`db.batchRead`) e le mappe costruite
// qui. Le aggregazioni le fa SQLite; JS riceve solo le righe che mostra.
//
// ATENZIONE al formato data: `tickets.data_aggiornamento` e' una stringa
// italiana ("26/10/2026, 14:05"), su cui `julianday()`/`date()` restituiscono
// NULL. La espressione ISO_DATA la normalizza in "YYYY-MM-DDTHH:MM" (formato
// che SQLite accetta) e lascia intatta un'eventuale data gia' ISO, cosi' la
// stessa query continua a funzionare il giorno in cui le date passeranno a ISO.
// Era anche il motivo per cui gli arretrati erano SEMPRE vuoti: `new Date(...)`
// su quel formato da' Invalid Date, quindi `giorni_fermi` era NaN.
// ===========================================================================

const ISO_DATA = `(CASE WHEN data_aggiornamento LIKE '__/__/____, __:__'
  THEN substr(data_aggiornamento,7,4)||'-'||substr(data_aggiornamento,4,2)||'-'
       ||substr(data_aggiornamento,1,2)||'T'||substr(data_aggiornamento,13,5)
  ELSE data_aggiornamento END)`;

// Stessa normalizzazione, applicata a data_chiusura (stesso formato italiano).
const ISO_DATA_CHIUSURA = `(CASE WHEN data_chiusura LIKE '__/__/____, __:__'
  THEN substr(data_chiusura,7,4)||'-'||substr(data_chiusura,4,2)||'-'
       ||substr(data_chiusura,1,2)||'T'||substr(data_chiusura,13,5)
  ELSE data_chiusura END)`;

// Soglia nello STESSO orologio delle stringhe salvate (ora locale del
// processo). Con `toISOString()` sarebbe UTC: in un container con TZ diversa da
// UTC la soglia sballerebbe di qualche ora.
function isoLocale(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Giorni trascorsi da una data del DB, leggendo sia il formato italiano sia
// l'ISO. Restituisce 0 se la data non e' interpretabile: meglio "appena
// aggiornato" di "NaN giorni".
function giorniDa(valore: string, adesso: number): number {
  let ms = NaN;
  const iso = Date.parse(valore);
  if (Number.isFinite(iso)) {
    ms = iso;
  } else {
    const m = valore.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
    if (m) ms = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
  }
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((adesso - ms) / 86_400_000));
}

type RigaTicket = {
  operatore: string;
  id: string;
  numero: string;
  sommario_problema: string;
  priorita: string;
  stato: string;
  data_aggiornamento: string;
};

export async function GET() {
  try {
    await requireAdmin();

    const adesso = Date.now();
    const soglia = isoLocale(adesso - GIORNI_SOGGIA * 86_400_000);

    // Inizio settimana corrente (lunedì, 00:00 ora locale): serve per il
    // conteggio "chiusi questa settimana", che prima era il totale di sempre
    // etichettato male nella UI.
    const oggi = new Date(adesso);
    const giornoSettimana = (oggi.getDay() + 6) % 7; // 0 = lunedì
    const inizioSettimana = isoLocale(
      new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - giornoSettimana).getTime()
    );

    const [operatori, stats, recenti, arretrati] = await db.batchRead([
      { sql: `SELECT id, nome, email, ruolo, attivo, ultimo_accesso FROM operatori ORDER BY nome` },

      {
        sql: `SELECT operatore,
                 SUM(stato = 'IN_CORSO') AS in_corso,
                 SUM(stato = 'NUOVO')    AS nuovi,
                 SUM(stato = 'RISOLTO')  AS risolti,
                 SUM(stato = 'CHIUSO')   AS chiusi,
                 COUNT(*)                AS totali,
                 SUM(CASE WHEN stato = 'CHIUSO' AND ${ISO_DATA_CHIUSURA} >= @inizioSettimana
                          THEN 1 ELSE 0 END) AS chiusi_settimana,
                 SUM(CASE WHEN stato IN ('NUOVO','IN_CORSO') AND ${ISO_DATA} < @soglia
                          THEN 1 ELSE 0 END) AS arretrati
              FROM tickets
              WHERE operatore IS NOT NULL
              GROUP BY operatore`,
        params: { soglia, inizioSettimana },
      },

      {
        // I 5 ticket aperti aggiornati piu' di recente, per ogni operatore.
        // ROW_NUMBER() evita la query "ultimi 5" ripetuta per ognuno.
        sql: `SELECT operatore, id, numero, sommario_problema, priorita, stato, data_aggiornamento
              FROM (
                SELECT operatore, id, numero, sommario_problema, priorita, stato, data_aggiornamento,
                       ROW_NUMBER() OVER (PARTITION BY operatore
                                          ORDER BY ${ISO_DATA} DESC, rowid DESC) AS rn
                FROM tickets
                WHERE operatore IS NOT NULL AND stato IN ('NUOVO','IN_CORSO')
              ) WHERE rn <= 5`,
      },

      {
        // Arretrati: fermo da almeno GIORNI_SOGGIA giorni. Il filtro e' in SQL
        // (prima si scaricavano TUTTI i ticket aperti e si scartavano qui).
        // Il LIMIT protegge il payload: il conteggio esatto arriva da `stats`.
        sql: `SELECT operatore, id, numero, sommario_problema, priorita, stato, data_aggiornamento
              FROM tickets
              WHERE operatore IS NOT NULL AND stato IN ('NUOVO','IN_CORSO')
                AND ${ISO_DATA} < @soglia
              ORDER BY ${ISO_DATA} ASC
              LIMIT 200`,
        params: { soglia },
      },
    ]);

    type RigaStats = {
      operatore: string;
      in_corso: number;
      nuovi: number;
      risolti: number;
      chiusi: number;
      chiusi_settimana: number;
      totali: number;
      arretrati: number;
    };

    const perOperatore = new Map<string, RigaStats>();
    for (const r of stats as unknown as RigaStats[]) perOperatore.set(r.operatore, r);

    const recentiPerOperatore = new Map<string, RigaTicket[]>();
    for (const r of recenti as unknown as RigaTicket[]) {
      const lista = recentiPerOperatore.get(r.operatore);
      if (lista) lista.push(r);
      else recentiPerOperatore.set(r.operatore, [r]);
    }

    const arretratiPerOperatore = new Map<string, RigaTicket[]>();
    for (const r of arretrati as unknown as RigaTicket[]) {
      const lista = arretratiPerOperatore.get(r.operatore);
      if (lista) lista.push(r);
      else arretratiPerOperatore.set(r.operatore, [r]);
    }

    const result: OperatorStats[] = (
      operatori as unknown as {
        id: string;
        nome: string;
        email: string;
        ruolo: string;
        attivo: number;
        ultimo_accesso: string | null;
      }[]
    ).map((op) => {
      const s = perOperatore.get(op.nome);
      return {
        id: op.id,
        nome: op.nome,
        email: op.email,
        ruolo: op.ruolo,
        attivo: !!op.attivo,
        ultimo_accesso: op.ultimo_accesso,
        ticket_in_corso: s?.in_corso ?? 0,
        ticket_nuovi: s?.nuovi ?? 0,
        ticket_risolti: s?.risolti ?? 0,
        ticket_chiusi: s?.chiusi ?? 0,
        ticket_chiusi_settimana: s?.chiusi_settimana ?? 0,
        ticket_totali: s?.totali ?? 0,
        ticket_recenti: recentiPerOperatore.get(op.nome) ?? [],
        ticket_arretrati: (arretratiPerOperatore.get(op.nome) ?? []).map((t) => ({
          ...t,
          giorni_fermi: giorniDa(t.data_aggiornamento, adesso),
        })),
        // Conteggio ESATTO dal SQL: la lista puo' essere troncata dal LIMIT, il
        // numero no. Prima era `array.length`, quindi sbagliava se > 200.
        ticket_arretrati_count: s?.arretrati ?? 0,
      };
    });

    return NextResponse.json({ operatori: result });
  } catch (err) {
    if (err instanceof Error && err.message.includes("autenticato")) {
      return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("amministratori")) {
      return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
    }
    console.error("GET /api/operatori/stats", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
