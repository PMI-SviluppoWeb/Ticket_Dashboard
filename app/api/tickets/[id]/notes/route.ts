import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertTechnicalNote } from "@/lib/tickets";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = request.headers.get("x-operator-id");
  const operatorName = request.headers.get("x-operator-email")?.split("@")[0];

  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const body = (await request.json()) as {
    titolo?: string;
    problema?: string;
    soluzione?: string;
    operatore?: string | null;
  };

  const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
  const problema = typeof body.problema === "string" ? body.problema.trim() : "";
  const soluzione = typeof body.soluzione === "string" ? body.soluzione.trim() : "";

  if (!titolo || !soluzione) {
    return NextResponse.json(
      { error: "Campi obbligatori mancanti: titolo e soluzione." },
      { status: 400 }
    );
  }

  // Esistenza del ticket con una SELECT che non legge nulla: `getTicket`
  // caricava riga, messaggi, note e allegati solo per decidere se rispondere
  // 404, ed era il viaggio piu' costoso della richiesta.
  const esiste = await db.prepare(`SELECT 1 AS uno FROM tickets WHERE id = ?`).get(params.id);
  if (!esiste) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  // Si restituisce SOLO la nota creata. Il client la inserisce nel ticket che
  // ha gia' in memoria; rileggere l'intero ticket qui era un secondo viaggio
  // per dati che il chiamante non usa.
  const nota = await insertTechnicalNote(params.id, {
    titolo,
    problema,
    soluzione,
    operatore: body.operatore ?? operatorName ?? null,
  });

  return NextResponse.json({ nota }, { status: 201 });
}
