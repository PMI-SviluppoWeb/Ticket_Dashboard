import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";

export async function GET(request: Request) {
  const esito = await richiediOperatore(request);
  if (!esito.ok) return esito.risposta;

  const operator = esito.operatore;
  return NextResponse.json({
    operator: {
      id: operator.id,
      nome: operator.nome,
      email: operator.email,
      ruolo: operator.ruolo,
    },
  });
}
