import { NextResponse } from "next/server";
import { getTicket, insertTechnicalNote } from "@/lib/tickets";

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

  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  await insertTechnicalNote(params.id, {
    titolo,
    problema,
    soluzione,
    operatore: body.operatore ?? operatorName ?? null,
  });

  return NextResponse.json(await getTicket(params.id));
}
