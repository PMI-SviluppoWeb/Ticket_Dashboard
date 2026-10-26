import { NextResponse } from "next/server";
import { getConfigGoogle, salvaConfigGoogle } from "@/lib/google-sync";
import { ORIGINI, TIMEZONE_DEFAULT } from "@/lib/google-evento";
import type { ConfigGoogle, GoogleModalita, OrigineEvento } from "@/lib/types";

export const dynamic = "force-dynamic";

// Scrittura riservata agli admin: qui si decide dove finiscono gli eventi
// dell'azienda su Google, ed e' la configurazione che governa la
// riconciliazione. In lettura invece basta l'autenticazione (vedi /stato).
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

const MODALITA: GoogleModalita[] = ["per_origine", "unico"];

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    return NextResponse.json(await getConfigGoogle());
  } catch (err) {
    console.error("GET /api/google/config", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (getOperatorRole(request) !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ConfigGoogle>;
    const patch: Partial<ConfigGoogle> = {};

    if (body.abilitato !== undefined) {
      if (typeof body.abilitato !== "boolean") {
        return NextResponse.json({ error: "Valore 'abilitato' non valido." }, { status: 400 });
      }
      patch.abilitato = body.abilitato;
    }

    if (body.modalita !== undefined) {
      if (!MODALITA.includes(body.modalita)) {
        return NextResponse.json({ error: "Modalità non valida." }, { status: 400 });
      }
      patch.modalita = body.modalita;
    }

    if (body.calendario_default !== undefined) {
      if (typeof body.calendario_default !== "string" || body.calendario_default.length > 1024) {
        return NextResponse.json({ error: "Calendario non valido." }, { status: 400 });
      }
      patch.calendario_default = body.calendario_default.trim();
    }

    if (body.mappatura !== undefined) {
      if (!body.mappatura || typeof body.mappatura !== "object" || Array.isArray(body.mappatura)) {
        return NextResponse.json({ error: "Mappatura non valida." }, { status: 400 });
      }
      const mappatura: Partial<Record<OrigineEvento, string>> = {};
      for (const [chiave, valore] of Object.entries(body.mappatura)) {
        if (!ORIGINI.includes(chiave as OrigineEvento)) {
          return NextResponse.json({ error: `Origine non valida: ${chiave}.` }, { status: 400 });
        }
        if (typeof valore !== "string" || valore.length > 1024) {
          return NextResponse.json({ error: "Id calendario non valido." }, { status: 400 });
        }
        // Un valore vuoto significa "usa il default": si omette invece di
        // salvare una stringa vuota.
        const pulito = valore.trim();
        if (pulito) mappatura[chiave as OrigineEvento] = pulito;
      }
      patch.mappatura = mappatura;
    }

    if (body.timezone !== undefined) {
      if (typeof body.timezone !== "string" || !body.timezone.trim()) {
        return NextResponse.json({ error: "Fuso orario non valido." }, { status: 400 });
      }
      patch.timezone = body.timezone.trim() || TIMEZONE_DEFAULT;
    }

    if (body.finestra_giorni !== undefined) {
      const n = Number(body.finestra_giorni);
      if (!Number.isInteger(n) || n < 0 || n > 3650) {
        return NextResponse.json(
          { error: "La finestra deve essere un intero tra 0 e 3650 giorni." },
          { status: 400 }
        );
      }
      patch.finestra_giorni = n;
    }

    return NextResponse.json(await salvaConfigGoogle(patch));
  } catch (err) {
    console.error("PATCH /api/google/config", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
