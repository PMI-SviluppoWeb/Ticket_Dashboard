import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";
import { revocaChiaveApi } from "@/lib/chiavi-api";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const ok = await revocaChiaveApi(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Chiave non trovata." }, { status: 404 });
    }
    await registra({
      operatoreId: auth.operatore.id,
      azione: "chiave_api.revocata",
      entita: "chiave_api",
      entitaId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/chiavi-api/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
