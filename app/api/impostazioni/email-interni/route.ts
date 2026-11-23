import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";
import { leggiImpostazione, scriviImpostazione } from "@/lib/impostazioni";
import {
  CHIAVE_MITTENTI_INTERNI,
  regoleInterne,
} from "@/lib/email-interni-config";
import { parseRegoleInterne, normalizzaEmail } from "@/lib/email-interni";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function leggiExtra(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const extra = leggiExtra(await leggiImpostazione(CHIAVE_MITTENTI_INTERNI));
  const regole = await regoleInterne();
  return NextResponse.json({
    extra,
    // Elenco effettivo (caselle + extra) per mostrarlo nella UI.
    indirizzi: regole.indirizzi,
    domini: regole.domini,
  });
}

export async function PATCH(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const body = (await request.json().catch(() => ({}))) as { indirizzi?: unknown };
  if (!Array.isArray(body.indirizzi) || body.indirizzi.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "Formato indirizzi non valido." }, { status: 400 });
  }
  if (body.indirizzi.length > 200) {
    return NextResponse.json({ error: "Troppi indirizzi (massimo 200)." }, { status: 400 });
  }

  const righe = (body.indirizzi as string[])
    .map((x) => x.trim())
    .filter(Boolean);
  const valide = parseRegoleInterne(righe);

  // Si conservano le righe cosi' come scritte (indirizzi e @domini), ma solo
  // quelle riconosciute: una riga sbagliata non deve restare in silenzio.
  const righeValide = righe.filter((r) => {
    if (r.startsWith("@")) return valide.domini.includes(r.slice(1).toLowerCase());
    return valide.indirizzi.includes(normalizzaEmail(r));
  });

  await scriviImpostazione(CHIAVE_MITTENTI_INTERNI, JSON.stringify(righeValide));
  await registra({
    operatoreId: auth.operatore.id,
    azione: "email.mittenti_interni_configurati",
    entita: "impostazioni",
    entitaId: CHIAVE_MITTENTI_INTERNI,
    dettagli: { righe: righeValide },
  });

  return NextResponse.json({ extra: righeValide });
}
