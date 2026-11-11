import { NextResponse } from "next/server";
import { listaCaselle, creaCasella } from "@/lib/caselle";
import { encryptionKeyConfigurata } from "@/lib/cifratura";
import type { CasellaEmailInput } from "@/lib/types";

export const dynamic = "force-dynamic";

// Le caselle email contengono le credenziali di accesso ai server di posta:
// lettura e scrittura sono riservate agli amministratori (stesso criterio di
// /api/google/config in scrittura, ma stretto anche in lettura perche' qui
// l'elenco indirizzi/host e' sensibile).
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

export async function GET(request: Request) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  try {
    const caselle = await listaCaselle();
    return NextResponse.json({
      caselle,
      // Senza chiave le password non si possono cifrare/decifrare: la UI
      // mostra l'avviso e disabilita il form invece di fallire al salvataggio.
      encryption_key_configurata: encryptionKeyConfigurata(),
    });
  } catch (err) {
    console.error("GET /api/caselle", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const negato = richiediAdmin(request);
  if (negato) return negato;

  if (!encryptionKeyConfigurata()) {
    return NextResponse.json(
      { error: "ENCRYPTION_KEY non configurata: impossibile salvare le password delle caselle." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CasellaEmailInput>;
    const esito = await creaCasella({
      etichetta: String(body.etichetta ?? ""),
      indirizzo: String(body.indirizzo ?? ""),
      imap_host: String(body.imap_host ?? ""),
      imap_port: Number(body.imap_port),
      imap_secure: Boolean(body.imap_secure),
      smtp_host: String(body.smtp_host ?? ""),
      smtp_port: Number(body.smtp_port),
      smtp_secure: Boolean(body.smtp_secure),
      utente: String(body.utente ?? ""),
      password: typeof body.password === "string" ? body.password : undefined,
      abilitata: body.abilitata !== false,
      predefinita: Boolean(body.predefinita),
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }
    return NextResponse.json({ casella: esito.casella }, { status: 201 });
  } catch (err) {
    console.error("POST /api/caselle", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
