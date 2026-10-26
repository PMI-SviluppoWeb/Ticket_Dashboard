import { NextResponse } from "next/server";
import { listClienti } from "@/lib/clienti";

export const dynamic = "force-dynamic";

function getOperatorId(request: Request): string | null {
  return request.headers.get("x-operator-id");
}

export async function GET(request: Request) {
  const operatorId = getOperatorId(request);
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const clienti = await listClienti(q, Number.isNaN(limit) ? 50 : limit);
    return NextResponse.json({ clienti });
  } catch (err) {
    console.error("GET /api/clienti", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
