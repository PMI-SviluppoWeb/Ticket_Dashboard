import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export interface EmailInboxRiga {
  id: string;
  message_id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  ticket_id: string | null;
  numero_ticket: string | null;
  stato: string;
  data_creazione: string;
}

// Storico delle email ARRIVATE via IMAP: la lista e' il registro di cosa
// il worker ha processato (e se ha creato un ticket). Sola lettura.
export async function GET(request: Request) {
  if (!getOperatorId(request)) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stato = searchParams.get("stato");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

  const where: string[] = [];
  const params: Record<string, string | number> = { limit };
  if (stato === "processata" || stato === "errore" || stato === "ignorata") {
    where.push("i.stato = @stato");
    params.stato = stato;
  }

  try {
    const rows = await db
      .prepare(
        `SELECT i.id, i.message_id, i.from_email, i.from_nome, i.subject, i.body_preview,
                i.ticket_id, t.numero AS numero_ticket, i.stato, i.data_creazione
         FROM email_inbox i
         LEFT JOIN tickets t ON t.id = i.ticket_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY i.data_creazione DESC
         LIMIT @limit`
      )
      .all(params);
    return NextResponse.json({ inbox: rows as unknown as EmailInboxRiga[] }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("GET /api/inbox", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
