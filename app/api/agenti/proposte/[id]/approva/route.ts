import { NextResponse } from "next/server";
import { approvaProposta } from "@/lib/proposte";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agenti/proposte/[id]/approva — crea davvero progetto e attività.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const esito = await approvaProposta(params.id, auth.operatore);
    if (!esito.ok) {
      return NextResponse.json(
        {
          error: esito.error,
          progetto_id: "progetto_id" in esito ? esito.progetto_id : undefined,
          attivita_create:
            "attivita_create" in esito ? esito.attivita_create : undefined,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      proposta: esito.proposta,
      progetto_id: esito.progetto_id,
      progetto_codice: esito.progetto_codice,
      attivita_create: esito.attivita_create,
    });
  } catch (err) {
    console.error("POST /api/agenti/proposte/[id]/approva", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
