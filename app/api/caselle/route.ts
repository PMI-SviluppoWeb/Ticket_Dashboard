import { NextResponse } from "next/server";
import { listaCaselle, creaCasella } from "@/lib/caselle";
import { encryptionKeyConfigurata } from "@/lib/cifratura";
import { richiediOperatore } from "@/lib/auth";
import { registra } from "@/lib/registro";
import type { CasellaEmailInput } from "@/lib/types";

export const dynamic = "force-dynamic";

// Le caselle email contengono le credenziali di accesso ai server di posta:
// lettura e scrittura sono riservate agli amministratori.
export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

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
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

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
      tls_non_verificato: Boolean(body.tls_non_verificato),
      triage_attivo: body.triage_attivo !== false,
      triage_soglia: Number(body.triage_soglia ?? 0.7),
      triage_priorita:
        body.triage_priorita === "BASSA" ||
        body.triage_priorita === "MEDIA" ||
        body.triage_priorita === "ALTA"
          ? body.triage_priorita
          : null,
      triage_operatore:
        typeof body.triage_operatore === "string" ? body.triage_operatore : null,
      triage_osservazione: body.triage_osservazione !== false,
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }

    await registra({
      operatoreId: auth.operatore.id,
      azione: "casella.creata",
      entita: "casella_email",
      entitaId: esito.casella.id,
      dettagli: {
        indirizzo: esito.casella.indirizzo,
        tls_non_verificato: esito.casella.tls_non_verificato,
      },
    });

    return NextResponse.json({ casella: esito.casella }, { status: 201 });
  } catch (err) {
    console.error("POST /api/caselle", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
