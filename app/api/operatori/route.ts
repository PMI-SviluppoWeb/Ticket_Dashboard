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

    return NextResponse.json({ operatori: rows });
  } catch (err) {
    console.error("GET /api/operatori", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}