import { NextResponse } from "next/server";
import { requireAdmin, updateOperator, deactivateOperator, activateOperator } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const { nome, email, ruolo, password } = body as {
      nome?: string;
      email?: string;
      ruolo?: "admin" | "operatore";
      password?: string;
    };

    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "La password deve essere di almeno 8 caratteri." },
        { status: 400 }
      );
    }

    await updateOperator(id, { nome, email, ruolo, password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("autenticato")) {
      return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("amministratori")) {
      return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
    }
    console.error("PATCH /api/operatori/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { attivo } = body as { attivo?: boolean };

    if (attivo === true) {
      await activateOperator(id);
    } else {
      await deactivateOperator(id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("autenticato")) {
      return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("amministratori")) {
      return NextResponse.json({ error: "Accesso riservato agli amministratori." }, { status: 403 });
    }
    console.error("DELETE /api/operatori/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
