import { NextResponse } from "next/server";
import { listEtichette, createEtichetta, validaColore } from "@/lib/etichette";
import { richiediOperatore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const etichette = await listEtichette();
    return NextResponse.json({ etichette });
  } catch (err) {
    console.error("GET /api/etichette", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      colore?: string;
    };

    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return NextResponse.json({ error: "Il nome è obbligatorio." }, { status: 400 });
    }
    if (nome.length > 40) {
      return NextResponse.json({ error: "Il nome supera i 40 caratteri." }, { status: 400 });
    }

    const colore = typeof body.colore === "string" ? body.colore.trim() : "#6B7280";
    if (!validaColore(colore)) {
      return NextResponse.json(
        { error: "Colore non valido: serve un hex del tipo #RRGGBB." },
        { status: 400 }
      );
    }

    const etichetta = await createEtichetta(nome, colore);
    return NextResponse.json(etichetta, { status: 201 });
  } catch (err) {
    // Il vincolo UNIQUE sul nome e' l'unico errore atteso dal DB.
    const messaggio = err instanceof Error ? err.message : "";
    if (messaggio.toLowerCase().includes("unique")) {
      return NextResponse.json(
        { error: "Esiste già un'etichetta con questo nome." },
        { status: 409 }
      );
    }
    console.error("POST /api/etichette", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
