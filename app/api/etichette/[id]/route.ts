import { NextResponse } from "next/server";
import { getEtichetta, updateEtichetta, deleteEtichetta, validaColore } from "@/lib/etichette";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const esistente = await getEtichetta(params.id);
  if (!esistente) {
    return NextResponse.json({ error: "Etichetta non trovata." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      colore?: string;
    };
    const patch: { nome?: string; colore?: string } = {};

    if (body.nome !== undefined) {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nome) {
        return NextResponse.json({ error: "Il nome è obbligatorio." }, { status: 400 });
      }
      if (nome.length > 40) {
        return NextResponse.json({ error: "Il nome supera i 40 caratteri." }, { status: 400 });
      }
      patch.nome = nome;
    }
    if (body.colore !== undefined) {
      const colore = typeof body.colore === "string" ? body.colore.trim() : "";
      if (!validaColore(colore)) {
        return NextResponse.json(
          { error: "Colore non valido: serve un hex del tipo #RRGGBB." },
          { status: 400 }
        );
      }
      patch.colore = colore;
    }

    const etichetta = await updateEtichetta(params.id, patch);
    if (!etichetta) {
      return NextResponse.json({ error: "Etichetta non trovata." }, { status: 404 });
    }
    return NextResponse.json(etichetta);
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "";
    if (messaggio.toLowerCase().includes("unique")) {
      return NextResponse.json(
        { error: "Esiste già un'etichetta con questo nome." },
        { status: 409 }
      );
    }
    console.error("PATCH /api/etichette/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  try {
    const ok = await deleteEtichetta(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Etichetta non trovata." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/etichette/[id]", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
