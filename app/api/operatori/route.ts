import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";

    const operatorRole = request.headers.get("x-operator-ruolo");

    let query: string;
    if (all && operatorRole === "admin") {
      query = `SELECT id, nome, email, ruolo, attivo, data_creazione, ultimo_accesso FROM operatori ORDER BY data_creazione DESC`;
    } else {
      query = `SELECT id, nome, email, ruolo, attivo FROM operatori WHERE attivo = 1 ORDER BY nome`;
    }

    const rows = await db.prepare(query).all();

    // Dati di riferimento per le select: cambiano quando un admin crea o
    // disattiva un operatore, non a ogni schermata. Due minuti di cache del
    // browser evitano il viaggio quando piu' componenti chiedono la stessa
    // lista, e la lista resta privata (nessuna cache condivisa, nessun CDN).
    //
    // L'elenco `?all=true` e' invece il pannello admin, che ricarica subito
    // dopo ogni scrittura: li' un dato vecchio di due minuti mostrerebbe un
    // operatore appena creato come assente.
    return NextResponse.json(
      { operatori: rows },
      all ? {} : { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("GET /api/operatori", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}