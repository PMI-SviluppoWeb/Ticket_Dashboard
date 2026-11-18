import { NextResponse } from "next/server";
import { richiediChiaveApi } from "@/lib/chiavi-api";
import { cercaClientePerTelefono } from "@/lib/esterni";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/esterni/v1/clienti/cerca?telefono=...
// Il bot cerca il chiamante: riceve solo la SUA anagrafica, mai l'elenco.
export async function GET(request: Request) {
  const auth = await richiediChiaveApi(request, "clienti:read");
  if (!auth.ok) return auth.risposta;

  const telefono = new URL(request.url).searchParams.get("telefono") ?? "";
  if (!telefono.trim()) {
    return NextResponse.json({ error: "Parametro telefono obbligatorio." }, { status: 400 });
  }

  try {
    const cliente = await cercaClientePerTelefono(telefono);
    await registra({
      origine: "api",
      azione: "api.clienti.cerca",
      entita: "cliente",
      entitaId: cliente?.id ?? null,
      dettagli: { chiave_id: auth.chiave.id, trovato: Boolean(cliente) },
    });
    return NextResponse.json({ cliente });
  } catch (err) {
    console.error("GET /api/esterni/v1/clienti/cerca", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
