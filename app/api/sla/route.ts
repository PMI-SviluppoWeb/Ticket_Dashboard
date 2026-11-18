import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";
import { getConfigSla, salvaConfigSla } from "@/lib/sla-config";
import { registra } from "@/lib/registro";
import type { ConfigSla } from "@/lib/sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;
  return NextResponse.json({ config: await getConfigSla() });
}

const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const body = (await request.json().catch(() => ({}))) as Partial<ConfigSla>;

  const numeri = ["ALTA", "MEDIA", "BASSA"] as const;
  for (const p of numeri) {
    const o = body.priorita?.[p];
    if (!o) continue;
    for (const campo of ["presaMinuti", "risoluzioneMinuti"] as const) {
      const n = Number(o[campo]);
      if (!Number.isInteger(n) || n < 0 || n > 100_000) {
        return NextResponse.json(
          { error: `Obiettivo SLA non valido per ${p} (${campo}).` },
          { status: 400 }
        );
      }
    }
  }
  if (body.orario) {
    if (!RE_ORA.test(body.orario.inizio) || !RE_ORA.test(body.orario.fine)) {
      return NextResponse.json({ error: "Orario non valido (HH:MM)." }, { status: 400 });
    }
    if (body.orario.inizio >= body.orario.fine) {
      return NextResponse.json({ error: "L'inizio deve precedere la fine." }, { status: 400 });
    }
    if (body.orario.pausa) {
      if (!RE_ORA.test(body.orario.pausa.inizio) || !RE_ORA.test(body.orario.pausa.fine)) {
        return NextResponse.json({ error: "Pausa non valida (HH:MM)." }, { status: 400 });
      }
    }
    if (
      body.orario.giorni !== undefined &&
      (!Array.isArray(body.orario.giorni) ||
        body.orario.giorni.some((g) => !Number.isInteger(g) || g < 0 || g > 6))
    ) {
      return NextResponse.json({ error: "Giorni lavorativi non validi." }, { status: 400 });
    }
  }
  if (
    body.festivi !== undefined &&
    (!Array.isArray(body.festivi) || body.festivi.some((d) => !RE_DATA.test(d)))
  ) {
    return NextResponse.json(
      { error: "I festivi devono essere date YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const config = await salvaConfigSla(body as ConfigSla);
  await registra({
    operatoreId: auth.operatore.id,
    azione: "sla.configurato",
    entita: "impostazioni",
    entitaId: "sla_config",
    dettagli: { priorita: config.priorita, orario: config.orario },
  });
  return NextResponse.json({ config });
}
