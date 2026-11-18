import { NextResponse } from "next/server";
import { riconcilia } from "@/lib/google-sync";
import { credenzialiPresenti, ErroreGoogle } from "@/lib/google-calendar";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

// "Sincronizza ora": un solo pulsante per tre esigenze che sono lo stesso
// problema (allineare lo stato locale a quello desiderato):
//   1. primo popolamento;
//   2. recupero dopo errori transitori;
//   3. migrazione dopo un cambio di mappatura.
// Non e' automatico al salvataggio della configurazione perche' comporta N
// chiamate a Google e delle cancellazioni: e' meglio che l'utente lo veda e
// ne legga l'esito.
//
// Status: 503 = non configurato / configurazione incompleta.
export async function POST(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  if (!credenzialiPresenti()) {
    return NextResponse.json(
      { error: "Sincronizzazione Google non configurata." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limite?: number;
      includi_passati?: boolean;
      solo_errori?: boolean;
    };

    let limite = 200;
    if (body.limite !== undefined) {
      const n = Number(body.limite);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return NextResponse.json(
          { error: "Il limite deve essere un intero tra 1 e 500." },
          { status: 400 }
        );
      }
      limite = n;
    }

    const esito = await riconcilia({
      limite,
      includi_passati: body.includi_passati === true,
      solo_errori: body.solo_errori === true,
    });

    // I dettagli dei singoli errori NON viaggiano qui (troppo rumore): la UI
    // li legge da GET /api/google/stato.
    return NextResponse.json({ ok: true, ...esito });
  } catch (err) {
    if (err instanceof ErroreGoogle) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("POST /api/google/sync", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
