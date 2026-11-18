import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";
import { getTicket } from "@/lib/tickets";
import { invocaModello } from "@/lib/ai-provider";
import { registra } from "@/lib/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Azione = "riassunto" | "bozza_risposta" | "simili" | "nota";

const SYSTEM: Record<Exclude<Azione, "simili">, string> = {
  riassunto: `Sei un assistente di supporto tecnico. Riassumi la conversazione del ticket in 3-5 punti brevi in italiano: cosa chiede il cliente, cosa e' stato fatto, cosa manca. Non inventare informazioni non presenti.`,
  bozza_risposta: `Sei un assistente di supporto tecnico. Scrivi una BOZZA di risposta al cliente in italiano, professionale e chiara, basata solo sulla conversazione e sulle note tecniche. Non inventare soluzioni non documentate. Chiudi chiedendo conferma se il problema e' risolto.`,
  nota: `Sei un assistente di supporto tecnico. Proponi una nota tecnica in italiano con tre parti: TITOLO, PROBLEMA, SOLUZIONE. Basati sulla conversazione; se una soluzione non e' documentata, scrivilo esplicitamente.`,
};

// Il contenuto scritto dai clienti e' DATI NON FIDATI: non deve poter
// dirottare il modello con istruzioni interne.
function delimita(testo: string): string {
  return `<<<CONTENUTO_NON_FIDUCIOSO>>>\n${testo}\n<<<FINE_CONTENUTO>>>`;
}

function contestoTicket(t: Awaited<ReturnType<typeof getTicket>>): string {
  if (!t) return "";
  const messaggi = (t.messaggi ?? [])
    .slice(-20)
    .map((m) => `${m.ruolo === "assistant" ? "Operatore" : "Cliente"}: ${m.contenuto}`)
    .join("\n\n");
  const note = (t.note_tecniche ?? [])
    .map((n) => `Nota "${n.titolo}"\nProblema: ${n.problema}\nSoluzione: ${n.soluzione}`)
    .join("\n\n");
  return delimita(
    `Ticket ${t.numero}
Cliente: ${t.cliente}
Modulo: ${t.modulo_software}
Priorita: ${t.priorita}
Stato: ${t.stato}
Sommario: ${t.sommario_problema}
Descrizione: ${t.descrizione_dettagliata}

CONVERSAZIONE:
${messaggi || "(nessun messaggio)"}

NOTE TECNICHE:
${note || "(nessuna)"}`
  );
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  const body = (await request.json().catch(() => ({}))) as { azione?: Azione };
  const azione = body.azione;
  if (!azione || !["riassunto", "bozza_risposta", "simili", "nota"].includes(azione)) {
    return NextResponse.json({ error: "Azione non valida." }, { status: 400 });
  }

  const ticket = await getTicket(params.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket non trovato." }, { status: 404 });
  }

  // "simili" non usa l'AI: cerca nelle note tecniche gia' risolte. Gratis e
  // deterministico.
  if (azione === "simili") {
    const parole = ticket.sommario_problema
      .toLowerCase()
      .split(/[^a-z0-9àèéìòù]+/i)
      .filter((p) => p.length >= 4)
      .slice(0, 4);
    if (parole.length === 0) {
      return NextResponse.json({ simili: [] });
    }
    const condizioni = parole.map((_, i) => `(lower(n.problema) LIKE @p${i} OR lower(n.soluzione) LIKE @p${i} OR lower(n.titolo) LIKE @p${i})`);
    const paramsQ: Record<string, string> = {};
    parole.forEach((p, i) => (paramsQ[`p${i}`] = `%${p.toLowerCase()}%`));

    const rows = await db
      .prepare(
        `SELECT n.id, n.ticket_id, n.titolo, n.problema, n.soluzione, t.numero
         FROM technical_notes n
         LEFT JOIN tickets t ON t.id = n.ticket_id
         WHERE n.ticket_id != @ticket_id AND (${condizioni.join(" OR ")})
         ORDER BY n.data_creazione DESC LIMIT 8`
      )
      .all({ ...paramsQ, ticket_id: ticket.id });

    return NextResponse.json({
      simili: rows.map((r) => ({
        id: String(r.id),
        ticket_id: String(r.ticket_id),
        numero: r.numero ? String(r.numero) : null,
        titolo: String(r.titolo),
        soluzione: String(r.soluzione).slice(0, 400),
      })),
    });
  }

  try {
    const esito = await invocaModello({
      systemPrompt: SYSTEM[azione],
      input: contestoTicket(ticket),
      modello: process.env.OPENROUTER_MODEL,
      // Hermes non e' ammesso per contenuti dei clienti: l'assistente usa
      // sempre OpenRouter (con instradamento senza conservazione).
      provider: "openrouter",
    });

    await registra({
      operatoreId: auth.operatore.id,
      origine: "agente",
      azione: `ticket.assistente.${azione}`,
      entita: "ticket",
      entitaId: ticket.id,
      dettagli: {
        prompt_tokens: esito.promptTokens,
        completion_tokens: esito.completionTokens,
      },
    });

    return NextResponse.json({
      risultato: esito.output ?? "",
      azione,
      tokens: {
        prompt: esito.promptTokens ?? 0,
        completion: esito.completionTokens ?? 0,
      },
    });
  } catch (err) {
    console.error("POST /api/tickets/[id]/assistente", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore dell'assistente." },
      { status: 502 }
    );
  }
}
