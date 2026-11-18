import { NextResponse } from "next/server";
import { richiediOperatore } from "@/lib/auth";
import {
  AMBITI_API,
  creaChiaveApi,
  listaChiaviApi,
  type AmbitoApi,
} from "@/lib/chiavi-api";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const chiavi = await listaChiaviApi();
    return NextResponse.json({ chiavi, ambiti: AMBITI_API });
  } catch (err) {
    console.error("GET /api/chiavi-api", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      ambiti?: string[];
    };
    const ambiti = Array.isArray(body.ambiti)
      ? body.ambiti.filter((a): a is AmbitoApi => AMBITI_API.includes(a as AmbitoApi))
      : [];

    const esito = await creaChiaveApi(String(body.nome ?? ""), ambiti);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }

    // Il registro non conserva MAI la chiave in chiaro.
    await registra({
      operatoreId: auth.operatore.id,
      azione: "chiave_api.creata",
      entita: "chiave_api",
      entitaId: esito.record.id,
      dettagli: { nome: esito.record.nome, ambiti: esito.record.ambiti },
    });

    // `chiave` in chiaro: mostrata una volta sola al client.
    return NextResponse.json({ chiave: esito.chiave, record: esito.record }, { status: 201 });
  } catch (err) {
    console.error("POST /api/chiavi-api", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
