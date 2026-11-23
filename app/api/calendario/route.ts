import { NextResponse } from "next/server";
import { listEventiCalendario, STATI_ATTIVITA } from "@/lib/attivita";
import { RE_DATETIME_LOCAL } from "@/lib/calendario";
import { richiediOperatore } from "@/lib/auth";
import type { StatoAttivita } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const { searchParams } = new URL(request.url);
  const dal = searchParams.get("dal") ?? "";
  const al = searchParams.get("al") ?? "";

  if (!dal || !al) {
    return NextResponse.json(
      { error: "Parametri 'dal' e 'al' obbligatori." },
      { status: 400 }
    );
  }
  if (!RE_DATETIME_LOCAL.test(dal) || !RE_DATETIME_LOCAL.test(al)) {
    return NextResponse.json({ error: "Intervallo date non valido." }, { status: 400 });
  }
  if (dal > al) {
    return NextResponse.json(
      { error: "La data iniziale non può essere successiva a quella finale." },
      { status: 400 }
    );
  }

  const progettoId = searchParams.get("progetto_id") || undefined;
  const clienteId = searchParams.get("cliente_id") || undefined;
  const etichettaId = searchParams.get("etichetta_id") || undefined;
  const statoParam = searchParams.get("stato") ?? "TUTTE";
  const stato: StatoAttivita | "TUTTE" = STATI_ATTIVITA.includes(statoParam as StatoAttivita)
    ? (statoParam as StatoAttivita)
    : "TUTTE";
  const light = searchParams.get("light") === "1";

  try {
    const eventi = await listEventiCalendario({
      dal,
      al,
      progetto_id: progettoId,
      cliente_id: clienteId,
      stato,
      etichetta_id: etichettaId,
      light,
    });
    return NextResponse.json({ eventi, dal, al });
  } catch (err) {
    console.error("GET /api/calendario", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
