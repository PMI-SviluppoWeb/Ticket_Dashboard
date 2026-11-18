import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface EmailInboxRiga {
  id: string;
  message_id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  ticket_id: string | null;
  numero_ticket: string | null;
  casella_id: string | null;
  stato: string;
  stato_triage: string | null;
  esito_ai: string | null;
  confidenza: number | null;
  motivo: string | null;
  correzione_umana: string | null;
  data_creazione: string;
}

// Posta in arrivo: contiene il testo di tutte le email dei clienti, quindi e'
// visibile solo agli amministratori.
//
// Il filtro usa `stato_triage` (esito finale), con fallback sulla colonna
// storica `stato` per le righe scritte prima di questa feature.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const { searchParams } = new URL(request.url);
  const filtro = searchParams.get("stato") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

  const condizioni: string[] = [];
  const params: Record<string, string | number> = { limit };
  if (filtro === "da_verificare") {
    condizioni.push("i.stato_triage = 'da_verificare'");
  } else if (filtro === "processata") {
    condizioni.push("(i.stato_triage = 'ticket' OR (i.stato_triage IS NULL AND i.stato = 'processata'))");
  } else if (filtro === "ignorata") {
    condizioni.push("(i.stato_triage = 'ignora' OR (i.stato_triage IS NULL AND i.stato = 'ignorata'))");
  } else if (filtro === "errore") {
    condizioni.push("i.stato = 'errore'");
  }

  try {
    const rows = await db
      .prepare(
        `SELECT i.id, i.message_id, i.from_email, i.from_nome, i.subject, i.body_preview,
                i.ticket_id, t.numero AS numero_ticket, i.casella_id, i.stato, i.stato_triage,
                i.esito_ai, i.confidenza, i.motivo, i.correzione_umana, i.data_creazione
         FROM email_inbox i
         LEFT JOIN tickets t ON t.id = i.ticket_id
         ${condizioni.length ? `WHERE ${condizioni.join(" AND ")}` : ""}
         ORDER BY i.data_creazione DESC
         LIMIT @limit`
      )
      .all(params);
    return NextResponse.json({ inbox: rows as unknown as EmailInboxRiga[] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("GET /api/inbox", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
