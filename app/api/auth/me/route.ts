import { NextResponse } from "next/server";
import { getSession, getOperatorById } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ operator: null }, { status: 401 });
  }

  const operator = await getOperatorById(session.operatorId);
  if (!operator) {
    return NextResponse.json({ operator: null }, { status: 401 });
  }

  return NextResponse.json({
    operator: {
      id: operator.id,
      nome: operator.nome,
      email: operator.email,
      ruolo: operator.ruolo,
    },
  });
}