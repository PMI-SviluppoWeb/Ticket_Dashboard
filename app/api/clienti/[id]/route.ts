import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Scheda cliente in sola lettura: l'anagrafica comanda l'ERP, qui si
// consulta. Il cliente puo' non essere in anagrafica (ticket libero).
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const cliente = await getCliente(params.id);
    if (!cliente) {
      return NextResponse.json({ error: "Cliente non trovato." }, { status: 404 });
    }
    return NextResponse.json(cliente, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/clienti/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
