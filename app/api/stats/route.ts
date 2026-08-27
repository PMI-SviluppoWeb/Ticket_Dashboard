import { NextResponse } from "next/server";
import { getStats, getModuli } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function GET() {
  const [stats, moduli] = await Promise.all([getStats(), getModuli()]);
  return NextResponse.json({ stats, moduli });
}
