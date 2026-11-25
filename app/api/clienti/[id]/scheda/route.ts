import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { richiediOperatore } from "@/lib/auth";
import { getCliente } from "@/lib/clienti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheda cliente in sola lettura: ticket, ore, moduli ricorrenti, contatti.
// L'anagrafica resta quella dell'ERP: qui non si scrive nulla.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request);
  if (!auth.ok) return auth.risposta;

  try {
    const cliente = await getCliente(params.id);
    if (!cliente) {
      return NextResponse.json({ error: "Cliente non trovato." }, { status: 404 });
    }

    const idCliente = params.id;
    const nomeCliente = cliente.ragione_sociale;

    const [ticketRes, oreRes, moduliRes, contattiRes, progettiRes, rapportiniRes] =
      await db.batchRead([
      {
        sql: `SELECT id, numero, stato, priorita, sommario_problema, modulo_software,
                     contatto, telefono, email, creato_il, chiuso_il, canale
              FROM tickets
              WHERE eliminato_il IS NULL
                AND (cliente_id = @id OR cliente = @nome)
              ORDER BY COALESCE(creato_il, data_creazione) DESC
              LIMIT 100`,
        params: { id: idCliente, nome: nomeCliente },
      },
      {
        sql: `SELECT COUNT(*) AS voci,
                     SUM((julianday(COALESCE(fine, @adesso)) - julianday(inizio)) * 1440) AS minuti
              FROM voci_tempo
              WHERE ticket_id IN (
                SELECT id FROM tickets
                WHERE eliminato_il IS NULL AND (cliente_id = @id OR cliente = @nome)
              )`,
        params: { id: idCliente, nome: nomeCliente, adesso: new Date().toISOString() },
      },
      {
        sql: `SELECT modulo_software AS nome, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND (cliente_id = @id OR cliente = @nome)
              GROUP BY modulo_software ORDER BY n DESC`,
        params: { id: idCliente, nome: nomeCliente },
      },
      {
        sql: `SELECT contatto, telefono, email, COUNT(*) AS n
              FROM tickets
              WHERE eliminato_il IS NULL AND (cliente_id = @id OR cliente = @nome)
                AND (contatto IS NOT NULL OR email IS NOT NULL OR telefono IS NOT NULL)
              GROUP BY contatto, telefono, email
              ORDER BY n DESC LIMIT 20`,
        params: { id: idCliente, nome: nomeCliente },
      },
      {
        sql: `SELECT id, codice, nome, stato
              FROM progetti
              WHERE cliente_id = @id
              ORDER BY data_creazione DESC LIMIT 50`,
        params: { id: idCliente },
      },
      {
        sql: `SELECT id, numero, stato, data_creazione, minuti_totali
              FROM rapportini
              WHERE cliente_id = @id
              ORDER BY data_creazione DESC LIMIT 50`,
        params: { id: idCliente },
      },
    ]);

    return NextResponse.json({
      cliente,
      tickets: ticketRes,
      ore: {
        voci: Number(oreRes[0]?.voci ?? 0),
        minuti: Math.round(Number(oreRes[0]?.minuti ?? 0)),
      },
      moduli: moduliRes.map((r) => ({ nome: String(r.nome ?? "—"), n: Number(r.n) })),
      contatti: contattiRes,
      progetti: progettiRes.map((r) => ({
        id: String(r.id),
        codice: String(r.codice ?? ""),
        nome: String(r.nome ?? ""),
        stato: String(r.stato ?? ""),
      })),
      rapportini: rapportiniRes.map((r) => ({
        id: String(r.id),
        numero: String(r.numero ?? ""),
        stato: String(r.stato ?? ""),
        data_creazione: String(r.data_creazione ?? ""),
        minuti_totali: Number(r.minuti_totali ?? 0),
      })),
    });
  } catch (err) {
    console.error("GET /api/clienti/[id]/scheda", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
