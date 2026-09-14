import { NextResponse } from "next/server";
import { authenticateOperator, createSession } from "@/lib/auth";

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

    const operator = await authenticateOperator(email, password);
    if (!operator) {
      return NextResponse.json(
        { error: "Credenziali non valide." },
        { status: 401 }
      );
    }

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