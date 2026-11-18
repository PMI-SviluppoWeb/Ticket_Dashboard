import { NextResponse } from "next/server";
import {
  listNotificationsConConteggio,
  getUnreadCount,
  markAllAsRead,
  createNotification,
} from "@/lib/notifications";
import { richiediOperatore } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const { searchParams } = new URL(request.url);
    const soloNonLette = searchParams.get("solo_non_lette") === "true";
    const countOnly = searchParams.get("count") === "true";
    const operatoreId = auth.operatore.id;

    if (countOnly) {
      const n = await getUnreadCount(operatoreId);
      return NextResponse.json({ count: n });
    }

    const { notifications, count } = await listNotificationsConConteggio({
      operatoreId,
      solo_non_lette: soloNonLette,
    });
    return NextResponse.json({ notifications, count });
  } catch (err) {
    console.error("GET /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    await markAllAsRead(auth.operatore.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Una notifica "broadcast" arriva a tutti: solo un admin puo' crearla.
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const body = await request.json();
    const { titolo, messaggio, ticket_id, tipo, destinatario_id } = body as {
      titolo?: string;
      messaggio?: string;
      ticket_id?: string;
      tipo?: string;
      destinatario_id?: string | null;
    };

    if (!titolo || !messaggio) {
      return NextResponse.json(
        { error: "Titolo e messaggio sono obbligatori." },
        { status: 400 }
      );
    }

    const notification = await createNotification({
      titolo,
      messaggio,
      ticket_id,
      tipo,
      destinatario_id: typeof destinatario_id === "string" ? destinatario_id : null,
    });
    return NextResponse.json({ notification }, { status: 201 });
  } catch (err) {
    console.error("POST /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
