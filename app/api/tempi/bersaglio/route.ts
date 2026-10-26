import { NextResponse } from "next/server";
import { listVociAttivita, listVociTicket } from "@/lib/tempi";

export const dynamic = "force-dynamic";

// GET /api/tempi/bersaglio?attivita_id=<id> | ?ticket_id=<id>
//
// Le voci registrate su UN bersaglio, per il totale mostrato accanto al
// pulsante del cronometro nella riga di una task o nel pannello del ticket.
//
// Nota sulla rotta: questo segmento statico vince su [id] (regola di Next:
// segmento statico prima del dinamico), quindi non serve escamotage sulla
// cartella. La lettura e' per bersaglio, non per operatore: il totale somma il
// lavoro di tutti, come il resto dei riepiloghi del progetto.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const attivitaId = searchParams.get("attivita_id");
  const ticketId = searchParams.get("ticket_id");

  if (attivitaId && ticketId) {
    return NextResponse.json(
      { error: "Indicare un'attività o un ticket, non entrambi." },
      { status: 400 }
    );
  }
  if (!attivitaId && !ticketId) {
    return NextResponse.json(
      { error: "Serve attivita_id o ticket_id." },
      { status: 400 }
    );
  }

  try {
    const voci = attivitaId
      ? await listVociAttivita(attivitaId)
      : await listVociTicket(ticketId as string);
    return NextResponse.json({ voci });
  } catch (err) {
    console.error("GET /api/tempi/bersaglio", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
