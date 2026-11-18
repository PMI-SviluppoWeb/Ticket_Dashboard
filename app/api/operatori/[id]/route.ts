import { NextResponse } from "next/server";
import { richiediOperatore, updateOperator, deactivateOperator, activateOperator, deleteOperator } from "@/lib/auth";
import { registra } from "@/lib/registro";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await richiediOperatore(request, { ruolo: "admin" });
    if (!auth.ok) return auth.risposta;
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
    await registra({
      operatoreId: auth.operatore.id,
      azione: "operatore.aggiornato",
      entita: "operatore",
      entitaId: id,
      // Mai il valore della password nel registro: solo se e' stata cambiata.
      dettagli: {
        campi: Object.keys(body).filter((k) => k !== "password"),
        password_cambiata: Boolean(password),
      },
    });
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
    const auth = await richiediOperatore(request, { ruolo: "admin" });
    if (!auth.ok) return auth.risposta;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { attivo, permanente } = body as { attivo?: boolean; permanente?: boolean };

    if (permanente) {
      await deleteOperator(id);
    } else if (attivo === true) {
      await activateOperator(id);
    } else {
      await deactivateOperator(id);
    }

    await registra({
      operatoreId: auth.operatore.id,
      azione: permanente
        ? "operatore.eliminato"
        : attivo === true
          ? "operatore.riattivato"
          : "operatore.disattivato",
      entita: "operatore",
      entitaId: id,
    });

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
