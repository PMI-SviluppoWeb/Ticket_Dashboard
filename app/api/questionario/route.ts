import { NextResponse } from "next/server";
import {
  getQuestionarioDaToken,
  registraRispostaQuestionario,
} from "@/lib/questionari";
import { ipRichiesta } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit elementare in memoria: il questionario pubblico non ha sessione,
// quindi limitiamo i tentativi per IP + token. In un deploy multi-processo e'
// per-processo, ma alza comunque il costo di un abuso banale.
const tentativi = new Map<string, { n: number; reset: number }>();
const LIMITE = 20;
const FINESTRA_MS = 60_000;

function rateOk(chiave: string): boolean {
  const ora = Date.now();
  const voce = tentativi.get(chiave);
  if (!voce || voce.reset < ora) {
    tentativi.set(chiave, { n: 1, reset: ora + FINESTRA_MS });
    return true;
  }
  if (voce.n >= LIMITE) return false;
  voce.n += 1;
  return true;
}

const NO_STORE = { "Cache-Control": "private, no-store" };

// GET /api/questionario?token=... — valida il link e restituisce solo i dati
// minimi per mostrare il form (nessun dato interno del cliente).
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "Link non valido." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const esito = await getQuestionarioDaToken(token);
    if (!esito.ok) {
      const status =
        esito.motivo === "non_trovato"
          ? 404
          : esito.motivo === "compilato"
            ? 409
            : 410;
      return NextResponse.json(
        { error: "Questionario non disponibile.", motivo: esito.motivo },
        { status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ info: esito.info }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/questionario", err);
    return NextResponse.json(
      { error: "Errore interno del server." },
      { status: 500, headers: NO_STORE }
    );
  }
}

// POST /api/questionario — salva le risposte. Body: { token, risposte }.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      risposte?: unknown;
    };
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json(
        { error: "Link non valido." },
        { status: 400, headers: NO_STORE }
      );
    }

    const chiave = `${ipRichiesta(request)}:${token.slice(0, 12)}`;
    if (!rateOk(chiave)) {
      return NextResponse.json(
        { error: "Troppi tentativi. Riprova tra un minuto." },
        { status: 429, headers: NO_STORE }
      );
    }

    const esito = await registraRispostaQuestionario(token, body.risposte);
    if (!esito.ok) {
      return NextResponse.json(
        { error: esito.error },
        { status: 400, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/questionario", err);
    return NextResponse.json(
      { error: "Errore interno del server." },
      { status: 500, headers: NO_STORE }
    );
  }
}
