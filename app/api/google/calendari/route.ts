import { NextResponse } from "next/server";
import { credenzialiPresenti, ErroreGoogle, listCalendars } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// Elenco dei calendari visibili al service account.
//
// ATTENZIONE: su un account Gmail gratuito un calendario condiviso a mano NON
// compare in questo elenco — il service account non puo' "accettare" la
// condivisione, quindi la sua CalendarList resta vuota. E' il motivo per cui
// la UI affianca sempre un campo di testo per l'id scritto a mano: questo
// endpoint e' un aiuto, non la fonte della verita'.
//
// Status scelti qui e documentati (non esistono precedenti nel repo):
//  503 = sincronizzazione non configurata (mancano le variabili d'ambiente)
//  502 = Google non raggiungibile o ha risposto male (upstream fallito)
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  if (!credenzialiPresenti()) {
    return NextResponse.json(
      { error: "Sincronizzazione Google non configurata." },
      { status: 503 }
    );
  }

  try {
    const calendari = await listCalendars();
    const avviso =
      calendari.length === 0
        ? "Nessun calendario visibile all'account di servizio. Su un account Gmail gratuito è normale: inserisci l'ID del calendario a mano."
        : undefined;
    return NextResponse.json({ calendari, avviso });
  } catch (err) {
    if (err instanceof ErroreGoogle) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("GET /api/google/calendari", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
