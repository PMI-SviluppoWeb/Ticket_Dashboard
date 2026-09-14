import { NextResponse } from "next/server";
import { authenticateOperator, createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e password sono obbligatorie." },
        { status: 400 }
      );
    }

    const operator = await authenticateOperator(email, password);
    if (!operator) {
      return NextResponse.json(
        { error: "Credenziali non valide o account disattivato." },
        { status: 401 }
      );
    }

    if (operator.ruolo !== "admin") {
      return NextResponse.json(
        { error: "Le credenziali non corrispondono a un account amministratore." },
        { status: 403 }
      );
    }

    await createSession(operator);

    return NextResponse.json({
      ok: true,
      operator: {
        id: operator.id,
        nome: operator.nome,
        email: operator.email,
        ruolo: operator.ruolo,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/switch-admin", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
