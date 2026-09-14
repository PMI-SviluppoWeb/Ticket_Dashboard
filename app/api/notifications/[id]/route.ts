import { NextResponse } from "next/server";
import { markAsRead } from "@/lib/notifications";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await markAsRead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
