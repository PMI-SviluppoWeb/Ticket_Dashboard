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

export async function GET() {
  try {
    await requireAdmin();

    const operators = (await db
      .prepare(
        `SELECT id, nome, email, ruolo, attivo, ultimo_accesso FROM operatori ORDER BY nome`
      )
      .all()) as {
      id: string;
      nome: string;
      email: string;
      ruolo: string;
      attivo: number;
      ultimo_accesso: string | null;
    }[];

    const result: OperatorStats[] = await Promise.all(
      operators.map(async (op) => {
        const stats = (await db
          .prepare(
            `SELECT
               SUM(CASE WHEN stato = 'IN_CORSO' THEN 1 ELSE 0 END) AS in_corso,
               SUM(CASE WHEN stato = 'NUOVO' THEN 1 ELSE 0 END) AS nuovi,
               SUM(CASE WHEN stato = 'RISOLTO' THEN 1 ELSE 0 END) AS risolti,
               SUM(CASE WHEN stato = 'CHIUSO' THEN 1 ELSE 0 END) AS chiusi,
               COUNT(*) AS totali
             FROM tickets WHERE operatore = ?`
          )
          .get(op.nome)) as {
          in_corso: number;
          nuovi: number;
          risolti: number;
          chiusi: number;
          totali: number;
        };

        const recenti = (await db
          .prepare(
            `SELECT id, numero, sommario_problema, priorita, stato, data_aggiornamento
             FROM tickets WHERE operatore = ? AND stato IN ('IN_CORSO', 'NUOVO')
             ORDER BY data_aggiornamento DESC LIMIT 5`
          )
          .all(op.nome)) as {
          id: string;
          numero: string;
          sommario_problema: string;
          priorita: string;
          stato: string;
          data_aggiornamento: string;
        }[];

        const now = Date.now();
        const sogliaMs = GIORNI_SOGGIA * 24 * 60 * 60 * 1000;

        const arretratiRaw = (await db
          .prepare(
            `SELECT id, numero, sommario_problema, priorita, stato, data_aggiornamento
             FROM tickets WHERE operatore = ? AND stato IN ('IN_CORSO', 'NUOVO')
             ORDER BY data_aggiornamento ASC`
          )
          .all(op.nome)) as {
          id: string;
          numero: string;
          sommario_problema: string;
          priorita: string;
          stato: string;
          data_aggiornamento: string;
        }[];

        const ticket_arretrati = arretratiRaw
          .map((t) => {
            const dataAgg = new Date(t.data_aggiornamento).getTime();
            const giorniFermi = Math.floor((now - dataAgg) / (24 * 60 * 60 * 1000));
            return { ...t, giorni_fermi: giorniFermi };
          })
          .filter((t) => t.giorni_fermi >= GIORNI_SOGGIA)
          .sort((a, b) => b.giorni_fermi - a.giorni_fermi);

        return {
          id: op.id,
          nome: op.nome,
          email: op.email,
          ruolo: op.ruolo,
          attivo: !!op.attivo,
          ultimo_accesso: op.ultimo_accesso,
          ticket_in_corso: stats?.in_corso ?? 0,
          ticket_nuovi: stats?.nuovi ?? 0,
          ticket_risolti: stats?.risolti ?? 0,
          ticket_chiusi: stats?.chiusi ?? 0,
          ticket_totali: stats?.totali ?? 0,
          ticket_recenti: recenti,
          ticket_arretrati,
          ticket_arretrati_count: ticket_arretrati.length,
        };
      })
    );

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
