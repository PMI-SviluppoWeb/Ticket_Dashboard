import { NextResponse } from "next/server";
import { getCliente } from "@/lib/clienti";
import { creaQuestionario, listaQuestionari } from "@/lib/questionari";
import { richiediOperatore } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  try {
    const questionari = await listaQuestionari(params.id);
    return NextResponse.json({ questionari });
  } catch (err) {
    console.error("GET /api/clienti/[id]/questionari", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await richiediOperatore(request, { ruolo: "admin" });
  if (!auth.ok) return auth.risposta;

  const cliente = await getCliente(params.id);
  if (!cliente) {
    return NextResponse.json({ error: "Cliente non trovato." }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      oggetto?: string;
      messaggio?: string;
      giorni?: number;
      inviaEmail?: boolean;
    };

    const inviaEmail = body.inviaEmail !== false;
    // Se si crea solo il link, il destinatario non serve: non si eredita
    // l'email del cliente (che potrebbe essere assente o non valida).
    const destinatario =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : inviaEmail
          ? cliente.email ?? ""
          : "";

    const esito = await creaQuestionario({
      clienteId: params.id,
      titolo: typeof body.oggetto === "string" ? body.oggetto : undefined,
      messaggio: typeof body.messaggio === "string" ? body.messaggio : undefined,
      destinatario: destinatario || undefined,
      giorniScadenza: typeof body.giorni === "number" ? body.giorni : undefined,
      inviaEmail,
      creatoDa: auth.operatore.id,
    });

    if (!esito.ok) {
      return NextResponse.json({ error: esito.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        questionario: esito.questionario,
        link: esito.link,
        esito_invio: esito.esito_invio,
        errore_invio: esito.errore_invio,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/clienti/[id]/questionari", err);
    return NextResponse.json({ error: "Errore interno del server." }, { status: 500 });
  }
}
