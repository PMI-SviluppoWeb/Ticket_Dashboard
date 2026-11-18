import { NextResponse } from "next/server";
import { markAsRead } from "@/lib/notifications";
import { richiediOperatore } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { id } = await params;
    await markAsRead(id, auth.operatore.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
