import { NextResponse } from "next/server";
import { requireAdmin, createOperator } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { nome, email, password, ruolo } = body as {
      nome?: string;
      email?: string;
      password?: string;
      ruolo?: "admin" | "operatore";
    };

    if (!nome || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e password sono obbligatori." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La password deve essere di almeno 8 caratteri." },
        { status: 400 }
      );
    }

    const existing = await getOperatorByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email già registrata." },
        { status: 409 }
      );
    }

    const operator = await createOperator(nome, email, password, ruolo ?? "operatore");

    return NextResponse.json({
      operator: {
        id: operator.id,
        nome: operator.nome,
        email: operator.email,
        ruolo: operator.ruolo,
      },
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("autenticato")) {
      return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("amministratori")) {
      return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
    }
    console.error("POST /api/auth/register", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

async function getOperatorByEmail(email: string) {
  const { db } = await import("@/lib/db");
  const row = await db.prepare(`SELECT id FROM operatori WHERE email = ?`).get(email);
  return row ? true : false;
}