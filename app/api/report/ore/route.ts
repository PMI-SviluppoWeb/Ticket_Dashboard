import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reportOre, reportCsv, type FiltroReport } from "@/lib/report-ore";

export const dynamic = "force-dynamic";

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function meseCorrente(): { da: string; a: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const da = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const a = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(ultimo)}`;
  return { da, a };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const predefinito = meseCorrente();
    const da = searchParams.get("da") ?? predefinito.da;
    const a = searchParams.get("a") ?? predefinito.a;

    if (!RE_DATA.test(da) || !RE_DATA.test(a)) {
      return NextResponse.json(
        { error: "Parametri da/a nel formato YYYY-MM-DD." },
        { status: 400 }
      );
    }
    if (da > a) {
      return NextResponse.json(
        { error: "La data di inizio e' successiva a quella di fine." },
        { status: 400 }
      );
    }

    const filtro: FiltroReport = {
      da,
      a,
      cliente: searchParams.get("cliente") || undefined,
      operatoreId: searchParams.get("operatore") || undefined,
    };

    const report = await reportOre(filtro);

    if (searchParams.get("format") === "csv") {
      return new NextResponse(reportCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="report-ore_${da}_${a}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/report/ore", err);
    if (err instanceof Error && err.message.includes("amministratori")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof Error && err.message.includes("Non autenticato")) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
