import { NextResponse } from "next/server";
import { getCasella, aggiornaCasella, eliminaCasella } from "@/lib/caselle";
import { invalidaTransporter } from "@/lib/email";
import { encryptionKeyConfigurata } from "@/lib/cifratura";
import type { CasellaEmailInput } from "@/lib/types";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

function getOperatorRole(request: Request): string | null {
  return request.headers.get("x-operator-ruolo");
}

function richiediAdmin(request: Request): NextResponse | null {
  if (!getOperatorId(request)) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (getOperatorRole(request) !== "admin") {
    return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

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
  const negato = richiediAdmin(request);
  if (negato) return negato;

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
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const esito = await eliminaCasella(params.id);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error ?? "Errore." }, { status: 400 });
    }
    invalidaTransporter(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/caselle/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
