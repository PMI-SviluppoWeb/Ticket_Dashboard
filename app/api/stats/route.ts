import { NextResponse } from "next/server";
import { getStats, getModuli } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const operatorId = request.headers.get("x-operator-id");
  if (!operatorId) {
    return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
  }
  const [stats, moduli] = await Promise.all([getStats(), getModuli()]);
  return NextResponse.json({ stats, moduli });
}
