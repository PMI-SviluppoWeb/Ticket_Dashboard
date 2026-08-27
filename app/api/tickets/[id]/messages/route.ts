import { NextResponse } from "next/server";
import { getTicket, insertMessage } from "@/lib/tickets";
import type { RuoloMessaggio } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as { ruolo?: string; contenuto?: string };

  const contenuto = typeof body.contenuto === "string" ? body.contenuto.trim() : "";
  if (!contenuto) {
    return NextResponse.json({ error: "Il messaggio non può essere vuoto." }, { status: 400 });
  }

  const ruolo: RuoloMessaggio = body.ruolo === "assistant" ? "assistant" : "user";

  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  await insertMessage(params.id, { ruolo, contenuto });
  return NextResponse.json(await getTicket(params.id));
}
