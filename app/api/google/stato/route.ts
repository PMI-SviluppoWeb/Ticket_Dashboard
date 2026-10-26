import { NextResponse } from "next/server";
import { conteggiGoogle, getConfigGoogle, listaErroriGoogle } from "@/lib/google-sync";
import { credenzialiPresenti } from "@/lib/google-calendar";
import { configurazioneCompleta } from "@/lib/google-evento";

export const dynamic = "force-dynamic";

// Stato della sincronizzazione. In LETTURA basta l'autenticazione: il badge di
// stato deve funzionare per tutti gli operatori, non solo per gli admin.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const config = await getConfigGoogle();
    const conteggi = await conteggiGoogle();
    const errori = await listaErroriGoogle(20);

    return NextResponse.json({
      configurato: credenzialiPresenti(),
      completo: configurazioneCompleta(config),
      abilitato: config.abilitato,
      modalita: config.modalita,
      mappatura: config.mappatura,
      calendario_default: config.calendario_default,
      timezone: config.timezone,
      finestra_giorni: config.finestra_giorni,
      conteggi,
      errori,
    });
  } catch (err) {
    console.error("GET /api/google/stato", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
