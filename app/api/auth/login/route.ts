import { NextResponse } from "next/server";
import {
  authenticateOperator,
  createSession,
  verificaTentativiLogin,
  registraTentativoFallito,
  azzeraTentativi,
  ipRichiesta,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e password sono obbligatori." },
        { status: 400 }
      );
    }

    const emailPulita = email.trim();
    const ip = ipRichiesta(request);

    // Rate limit per email+IP: dopo N fallimenti l'account viene bloccato per
    // un periodo breve. Il controllo precede l'autenticazione, quindi non
    // rivela se le credenziali sarebbero state valide.
    const limite = await verificaTentativiLogin(emailPulita, ip);
    if (!limite.consentito) {
      const risposta = NextResponse.json(
        { error: "Troppi tentativi di accesso. Riprova tra qualche minuto." },
        { status: 429 }
      );
      risposta.headers.set("Retry-After", String(limite.secondiRimanenti));
      return risposta;
    }

    const operator = await authenticateOperator(emailPulita, password);
    if (!operator) {
      await registraTentativoFallito(emailPulita, ip);
      return NextResponse.json(
        { error: "Credenziali non valide." },
        { status: 401 }
      );
    }

    await azzeraTentativi(emailPulita, ip);
    await createSession(operator);

    return NextResponse.json({
      operator: {
        id: operator.id,
        nome: operator.nome,
        email: operator.email,
        ruolo: operator.ruolo,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/login", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
