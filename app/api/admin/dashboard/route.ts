import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";
import { getConfigSla } from "@/lib/sla-config";
import { valutaSla, type TicketSlaInput } from "@/lib/sla";
import type { Priorita } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function inizioGiorno(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}

function giornoDopo(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0).toISOString();
}

function meseCorrente(): { da: string; a: string } {
  const oggi = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const da = `${oggi.getFullYear()}-${p(oggi.getMonth() + 1)}-01`;
  const ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();
  const a = `${oggi.getFullYear()}-${p(oggi.getMonth() + 1)}-${p(ultimo)}`;
  return { da, a };
}

interface RigaTicket {
  id: string;
  numero: string;
  priorita: Priorita;
  stato: string;
  creato_il: string | null;
  preso_in_carico_il: string | null;
  chiuso_il: string | null;
  operatore: string | null;
  modulo_software: string;
  canale: string;
  cliente: string;
}

export async function GET(request: Request) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const { searchParams } = new URL(request.url);
  const predefinito = meseCorrente();
  const da = searchParams.get("da") ?? predefinito.da;
  const a = searchParams.get("a") ?? predefinito.a;

  if (!RE_DATA.test(da) || !RE_DATA.test(a) || da > a) {
    return NextResponse.json(
      { error: "Periodo non valido: servono due date YYYY-MM-DD con da <= a." },
      { status: 400 }
    );
  }

  const daIso = inizioGiorno(da);
  const aIso = giornoDopo(a);
  const adesso = Date.now();
  const config = await getConfigSla();

  try {
    const [
      ticketPeriodo,
      chiusiCount,
      trendAperti,
      trendChiusi,
      perModulo,
      perCanale,
      oreOperatore,
      riaperture,
      triage,
      correzioni,
      backlog,
      ai,
    ] = await db.batchRead([
      {
        sql: `SELECT id, numero, priorita, stato, creato_il, preso_in_carico_il, chiuso_il,
                     operatore, modulo_software, canale, cliente
              FROM tickets
              WHERE eliminato_il IS NULL
                AND ((creato_il >= @da AND creato_il < @aIso)
                  OR (chiuso_il >= @da AND chiuso_il < @aIso))
              ORDER BY creato_il DESC
              LIMIT 5000`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT COUNT(*) AS n FROM tickets
              WHERE eliminato_il IS NULL AND chiuso_il >= @da AND chiuso_il < @aIso
                AND stato IN ('CHIUSO','RISOLTO')`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT substr(creato_il, 1, 10) AS giorno, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND creato_il >= @da AND creato_il < @aIso
              GROUP BY giorno ORDER BY giorno`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT substr(chiuso_il, 1, 10) AS giorno, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND chiuso_il >= @da AND chiuso_il < @aIso
                AND stato IN ('CHIUSO','RISOLTO')
              GROUP BY giorno ORDER BY giorno`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT modulo_software AS nome, COUNT(*) AS n FROM tickets
              WHERE eliminato_il IS NULL AND creato_il >= @da AND creato_il < @aIso
              GROUP BY modulo_software ORDER BY n DESC LIMIT 12`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT COALESCE(canale, 'manuale') AS nome, COUNT(*) AS n FROM tickets
              WHERE eliminato_il IS NULL AND creato_il >= @da AND creato_il < @aIso
              GROUP BY COALESCE(canale, 'manuale') ORDER BY n DESC`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT operatore, SUM(
                 (julianday(COALESCE(fine, @adesso)) - julianday(inizio)) * 1440
               ) AS minuti
              FROM voci_tempo
              WHERE inizio >= @da AND inizio < @aIso
              GROUP BY operatore ORDER BY minuti DESC`,
        params: { da: daIso, aIso, adesso: new Date(adesso).toISOString() },
      },
      {
        sql: `SELECT COUNT(DISTINCT ticket_id) AS n FROM tickets_storico_stati
              WHERE da_stato IN ('CHIUSO','RISOLTO') AND a_stato IN ('NUOVO','IN_CORSO')
                AND data >= @da AND data < @aIso`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT COALESCE(
                 stato_triage,
                 CASE stato WHEN 'processata' THEN 'ticket' WHEN 'ignorata' THEN 'ignora' ELSE stato END
               ) AS esito, COUNT(*) AS n
              FROM email_inbox
              WHERE data_creazione >= @da AND data_creazione < @aIso
              GROUP BY esito`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT correzione_umana, COUNT(*) AS n FROM email_inbox
              WHERE correzione_umana IS NOT NULL AND data_creazione >= @da AND data_creazione < @aIso
              GROUP BY correzione_umana`,
        params: { da: daIso, aIso },
      },
      {
        sql: `SELECT COUNT(*) AS n,
                     AVG((julianday(@adesso) - julianday(creato_il)) * 1440) AS minuti_medi
              FROM tickets
              WHERE eliminato_il IS NULL AND stato IN ('NUOVO','IN_CORSO')`,
        params: { adesso: new Date(adesso).toISOString() },
      },
      {
        sql: `SELECT COUNT(*) AS n,
                     SUM(COALESCE(prompt_tokens, 0)) AS prompt,
                     SUM(COALESCE(completion_tokens, 0)) AS completion
              FROM agenti_esecuzioni
              WHERE data_creazione >= @da AND data_creazione < @aIso`,
        params: { da: daIso, aIso },
      },
    ]);

    const righe = ticketPeriodo as unknown as RigaTicket[];
    const creatiPeriodo = righe.filter(
      (t) => t.creato_il && t.creato_il >= daIso && t.creato_il < aIso
    );
    const chiusiPeriodo = righe.filter(
      (t) =>
        t.chiuso_il &&
        t.chiuso_il >= daIso &&
        t.chiuso_il < aIso &&
        (t.stato === "CHIUSO" || t.stato === "RISOLTO")
    );

    let presaEntro = 0;
    let presaValutabili = 0;
    let risoluzioneEntro = 0;
    let risoluzioneValutabili = 0;
    let sommaPresa = 0;
    let contaPresa = 0;
    let sommaRisoluzione = 0;
    let contaRisoluzione = 0;

    for (const t of righe) {
      const input: TicketSlaInput = {
        id: t.id,
        numero: t.numero,
        priorita: t.priorita,
        stato: t.stato,
        creatoIl: t.creato_il,
        presoIl: t.preso_in_carico_il,
        chiusoIl: t.chiuso_il,
      };
      const esito = valutaSla(input, config, adesso);
      if (!esito) continue;
      if (esito.presaEntro !== null) {
        presaValutabili += 1;
        if (esito.presaEntro) presaEntro += 1;
      }
      if (esito.risoluzioneEntro !== null) {
        risoluzioneValutabili += 1;
        if (esito.risoluzioneEntro) risoluzioneEntro += 1;
      }
      if (esito.presaMinuti !== null) {
        sommaPresa += esito.presaMinuti;
        contaPresa += 1;
      }
      if (esito.risoluzioneMinuti !== null) {
        sommaRisoluzione += esito.risoluzioneMinuti;
        contaRisoluzione += 1;
      }
    }

    const chiusi = (chiusiCount[0]?.n as number) ?? 0;
    const riaperte = (riaperture[0]?.n as number) ?? 0;

    const esiti: Record<string, number> = {};
    for (const r of triage) esiti[String(r.esito)] = (r.n as number) ?? 0;
    const correzioniMap: Record<string, number> = {};
    for (const r of correzioni) {
      correzioniMap[String(r.correzione_umana)] = (r.n as number) ?? 0;
    }

    return NextResponse.json({
      periodo: { da, a },
      kpi: {
        creati: creatiPeriodo.length,
        chiusi,
        backlog: (backlog[0]?.n as number) ?? 0,
        anzianita_media_ore: Math.round(((backlog[0]?.minuti_medi as number) ?? 0) / 60),
        presa_media_minuti:
          contaPresa > 0 ? Math.round(sommaPresa / contaPresa) : null,
        risoluzione_media_minuti:
          contaRisoluzione > 0 ? Math.round(sommaRisoluzione / contaRisoluzione) : null,
        sla_presa_percento:
          presaValutabili > 0 ? Math.round((presaEntro / presaValutabili) * 100) : null,
        sla_risoluzione_percento:
          risoluzioneValutabili > 0
            ? Math.round((risoluzioneEntro / risoluzioneValutabili) * 100)
            : null,
        tasso_riapertura_percento:
          chiusi > 0 ? Math.round((riaperte / chiusi) * 100) : 0,
      },
      trend: {
        aperti: trendAperti.map((r) => ({ giorno: String(r.giorno), n: Number(r.n) })),
        chiusi: trendChiusi.map((r) => ({ giorno: String(r.giorno), n: Number(r.n) })),
      },
      perModulo: perModulo.map((r) => ({ nome: String(r.nome), n: Number(r.n) })),
      perCanale: perCanale.map((r) => ({ nome: String(r.nome), n: Number(r.n) })),
      perOperatore: oreOperatore.map((r) => ({
        operatore: String(r.operatore ?? "—"),
        ore: Math.round((((r.minuti as number) ?? 0) / 60) * 10) / 10,
      })),
      triage: {
        esiti,
        correzioni: correzioniMap,
      },
      ai: {
        esecuzioni: (ai[0]?.n as number) ?? 0,
        prompt_tokens: (ai[0]?.prompt as number) ?? 0,
        completion_tokens: (ai[0]?.completion as number) ?? 0,
      },
      config_sla: config,
    });
  } catch (err) {
    console.error("GET /api/admin/dashboard", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
