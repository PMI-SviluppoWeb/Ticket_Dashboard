import { NextResponse } from "next/server";
import {
  listNotifications,
  getUnreadCount,
  markAllAsRead,
  createNotification,
} from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const soloNonLette = searchParams.get("solo_non_lette") === "true";
    const countOnly = searchParams.get("count") === "true";

    if (countOnly) {
      const n = await getUnreadCount();
      return NextResponse.json({ count: n });
    }

    const notifications = await listNotifications({ solo_non_lette: soloNonLette });
    const count = await getUnreadCount();
    return NextResponse.json({ notifications, count });
  } catch (err) {
    console.error("GET /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    await markAllAsRead();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { titolo, messaggio, ticket_id, tipo } = body as {
      titolo?: string;
      messaggio?: string;
      ticket_id?: string;
      tipo?: string;
    };

    if (!titolo || !messaggio) {
      return NextResponse.json(
        { error: "Titolo e messaggio sono obbligatori." },
        { status: 400 }
      );
    }

    const notification = await createNotification({ titolo, messaggio, ticket_id, tipo });
    return NextResponse.json({ notification }, { status: 201 });
  } catch (err) {
    console.error("POST /api/notifications", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
