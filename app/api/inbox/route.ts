import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { puoVedereCasella } from "@/lib/caselle";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
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
  casella_etichetta: string | null;
  casella_indirizzo: string | null;
  stato: string;
  stato_triage: string | null;
  esito_ai: string | null;
  confidenza: number | null;
  motivo: string | null;
  correzione_umana: string | null;
  data_creazione: string;
}

// Posta in arrivo: contiene il testo di tutte le email dei clienti.
//
// L'admin vede tutto. Un operatore vede SOLO le email delle caselle che
// l'admin gli ha assegnato (caselle_operatori): il filtro e' server-side,
// la UI non e' il confine di sicurezza. Le email senza casella (storico)
// restano visibili solo all'admin.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const isAdmin = auth.operatore.ruolo === "admin";
  const { searchParams } = new URL(request.url);
  const filtro = searchParams.get("stato") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

  const condizioni: string[] = [];
  const params: Record<string, string | number> = { limit };

  if (!isAdmin) {
    condizioni.push(
      `i.casella_id IN (SELECT casella_id FROM caselle_operatori WHERE operatore_id = @operatore_id)`
    );
    params.operatore_id = auth.operatore.id;
  }

  // Filtro per singola casella: un operatore puo' chiederla solo se assegnata.
  const casellaId = searchParams.get("casella_id");
  if (casellaId) {
    if (!(await puoVedereCasella(auth.operatore, casellaId))) {
      return NextResponse.json({ error: "Casella non accessibile." }, { status: 403 });
    }
    condizioni.push("i.casella_id = @casella_id");
    params.casella_id = casellaId;
  }

  if (filtro === "da_verificare") {
    condizioni.push("i.stato_triage = 'da_verificare'");
  } else if (filtro === "processata") {
    condizioni.push(
      "(i.stato_triage = 'ticket' OR (i.stato_triage IS NULL AND i.stato = 'processata'))"
    );
  } else if (filtro === "ignorata") {
    condizioni.push(
      "(i.stato_triage = 'ignora' OR (i.stato_triage IS NULL AND i.stato = 'ignorata'))"
    );
  } else if (filtro === "errore") {
    condizioni.push("i.stato = 'errore'");
  }

  try {
    const rows = await db
      .prepare(
        `SELECT i.id, i.message_id, i.from_email, i.from_nome, i.subject, i.body_preview,
                i.ticket_id, t.numero AS numero_ticket, i.casella_id,
                c.etichetta AS casella_etichetta, c.indirizzo AS casella_indirizzo,
                i.stato, i.stato_triage, i.esito_ai, i.confidenza, i.motivo,
                i.correzione_umana, i.data_creazione
         FROM email_inbox i
         LEFT JOIN tickets t ON t.id = i.ticket_id
         LEFT JOIN caselle_email c ON c.id = i.casella_id
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
