import { NextResponse } from "next/server";
import { getOperatorById } from "@/lib/auth";
import { getAttivita } from "@/lib/attivita";
import { getTicket } from "@/lib/tickets";
import {
  avviaVoce,
  getVoceAperta,
  listVociOperatore,
  minutiPerAttivita,
  riepilogoTempiProgetto,
} from "@/lib/tempi";
import type { VoceTempoInput } from "@/lib/types";

export const dynamic = "force-dynamic";

// Il cronometro e' personale: ogni rotta lavora SOLO sulle voci dell'operatore
// in sessione. L'id arriva dal middleware, mai dal body.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

// GET /api/tempi
//   ?attivita_minuti=<progetto_id>  -> totali per task del progetto
//   ?progetto=<progetto_id>         -> riepilogo del pannello Tempi: totale
//                                      e minuti per operatore, dalle voci reali
//   (nessun parametro)              -> voce aperta + ultime voci dell'operatore
export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const progettoId = searchParams.get("attivita_minuti");
  const riepilogoId = searchParams.get("progetto");

  try {
    // I totali per task non riguardano l'operatore: sono la somma di tutti,
    // come il resto della vista progetto.
    if (progettoId) {
      const minuti = await minutiPerAttivita(progettoId);
      return NextResponse.json({ minuti });
    }

    if (riepilogoId) {
      const riepilogo = await riepilogoTempiProgetto(riepilogoId);
      return NextResponse.json(riepilogo);
    }

    const [aperta, voci] = await Promise.all([
      getVoceAperta(operatorId),
      listVociOperatore(operatorId, { limite: 50 }),
    ]);
    return NextResponse.json({ aperta, voci });
  } catch (err) {
    console.error("GET /api/tempi", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

// POST /api/tempi — avvia un cronometro.
// body: { attivita_id?, ticket_id?, descrizione? }
// Nessun bersaglio = tempo generico: e' un caso reale (riunione, telefonata),
// non un errore.
export async function POST(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as VoceTempoInput;

    const attivitaId =
      typeof body.attivita_id === "string" && body.attivita_id ? body.attivita_id : null;
    const ticketId =
      typeof body.ticket_id === "string" && body.ticket_id ? body.ticket_id : null;

    if (attivitaId && ticketId) {
      return NextResponse.json(
        { error: "Una voce di tempo non può riferirsi a un'attività e a un ticket insieme." },
        { status: 400 }
      );
    }

    // Il nome dell'operatore viene dal DB, non dal client: la colonna
    // `operatore` e' denormalizzata per i riepiloghi e non deve poter essere
    // scelta da chi chiama.
    const operatore = await getOperatorById(operatorId);
    if (!operatore) {
      return NextResponse.json({ error: "Operatore non trovato." }, { status: 401 });
    }

    // Le FK non sono applicate dal DB: il bersaglio va verificato qui.
    if (attivitaId && !(await getAttivita(attivitaId))) {
      return NextResponse.json({ error: "Attività non trovata." }, { status: 404 });
    }
    if (ticketId && !(await getTicket(ticketId))) {
      return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
    }

    const voce = await avviaVoce(
      { id: operatore.id, nome: operatore.nome },
      { attivita_id: attivitaId, ticket_id: ticketId, descrizione: body.descrizione ?? null }
    );

    return NextResponse.json(voce, { status: 201 });
  } catch (err) {
    console.error("POST /api/tempi", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
