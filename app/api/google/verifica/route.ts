import { NextResponse } from "next/server";
import { credenzialiPresenti, ErroreGoogle, verificaAccesso } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// Verifica che un calendario sia davvero condiviso con il service account.
// Serve perche' l'id si inserisce a mano: senza questa prova, un errore di
// battitura si scoprirebbe solo al primo evento non sincronizzato.
function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

export async function POST(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (getOperatorRole(request) !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }

  if (!credenzialiPresenti()) {
    return NextResponse.json(
      { error: "Sincronizzazione Google non configurata." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { calendar_id?: string };
    const calendarId = typeof body.calendar_id === "string" ? body.calendar_id.trim() : "";
    if (!calendarId) {
      return NextResponse.json({ error: "ID calendario obbligatorio." }, { status: 400 });
    }
    if (calendarId.length > 1024) {
      return NextResponse.json({ error: "ID calendario troppo lungo." }, { status: 400 });
    }

    const accesso = await verificaAccesso(calendarId);
    if (!accesso) {
      return NextResponse.json({
        ok: true,
        accesso: false,
        messaggio:
          "Il calendario non è condiviso con l'account di servizio, oppure l'ID non è corretto.",
      });
    }
    return NextResponse.json({ ok: true, accesso: true });
  } catch (err) {
    if (err instanceof ErroreGoogle) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("POST /api/google/verifica", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
