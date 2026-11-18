import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertTechnicalNote } from "@/lib/tickets";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const operatorName = auth.operatore.nome;

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

  await registra({
    operatoreId: auth.operatore.id,
    azione: "nota_tecnica.creata",
    entita: "nota_tecnica",
    entitaId: nota.id,
    dettagli: { ticket_id: params.id, titolo },
  });

  return NextResponse.json({ nota }, { status: 201 });
}
