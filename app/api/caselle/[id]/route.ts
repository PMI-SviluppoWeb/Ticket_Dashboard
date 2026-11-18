import { NextResponse } from "next/server";
import { getCasella, aggiornaCasella, eliminaCasella } from "@/lib/caselle";
import { invalidaTransporter } from "@/lib/email";
import { encryptionKeyConfigurata } from "@/lib/cifratura";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";
import type { CasellaEmailInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const casella = await getCasella(params.id);
    if (!casella) {
      return NextResponse.json({ error: "Casella non trovata." }, { status: 404 });
    }
    return NextResponse.json({ casella });
  } catch (err) {
    console.error("GET /api/caselle/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const body = (await request.json().catch(() => ({}))) as Partial<CasellaEmailInput>;

  // Password presente (non vuota) -> serve la chiave per cifrarla.
  const passwordNuova = typeof body.password === "string" && body.password.length > 0;
  if (passwordNuova && !encryptionKeyConfigurata()) {
    return NextResponse.json(
      { error: "ENCRYPTION_KEY non configurata: impossibile salvare la password." },
      { status: 503 }
    );
  }

  try {
    const esito = await aggiornaCasella(params.id, body);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    // Il transporter SMTP cached della vecchia config non e' piu' valido.
    invalidaTransporter(params.id);

    await registra({
      operatoreId: auth.operatore.id,
      azione: "casella.aggiornata",
      entita: "casella_email",
      entitaId: params.id,
      dettagli: {
        indirizzo: esito.casella.indirizzo,
        campi: Object.keys(body).filter((k) => k !== "password"),
        password_cambiata: passwordNuova,
      },
    });

    return NextResponse.json({ casella: esito.casella });
  } catch (err) {
    console.error("PATCH /api/caselle/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const esito = await eliminaCasella(params.id);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error ?? "Errore." }, { status: 400 });
    }
    invalidaTransporter(params.id);

    await registra({
      operatoreId: auth.operatore.id,
      azione: "casella.eliminata",
      entita: "casella_email",
      entitaId: params.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/caselle/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
