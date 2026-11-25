import { db } from "./db";
import { getStats, getTicket, getTicketByNumero, listTickets } from "./tickets";
import { getCliente, listClienti } from "./clienti";
import { creaProposta } from "./proposte";
import { TUTTI_STRUMENTI } from "./agenti-tools-def";
import "server-only";

// ===========================================================================
// Strumenti "dati dell'app" per il loop agentico IN-APP.
//
// Il modello (OpenRouter) richiama questi tool con function calling; la
// ESECUZIONE avviene qui, dentro la nostra app, sul nostro DB Turso.
// Nessun MCP, nessun accesso esterno ai dati: i dati escono solo come
// contesto nel prompt (come per la classificazione email).
//
// Tutti gli strumenti sono A SOLA LETTURA tranne `proponi_progetto_con_task`,
// che NON scrive progetti: crea una proposta in agenti_proposte in attesa di
// approvazione umana. Ogni risultato viene troncato (cap qui sotto) per non
// gonfiare i token a ogni turno del loop.
// ===========================================================================

export interface DefinizioneStrumento {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Contesto di esecuzione passato da lib/agenti.ts. Serve ai tool che devono
// sapere chi sta proponendo, in quale esecuzione e in quale conversazione.
export interface ContestoStrumento {
  agenteId?: string | null;
  esecuzioneId?: string | null;
  operatoreId?: string | null;
  conversazioneId?: string | null;
}

// Cap di un singolo risultato serializzato (caratteri). Oltre: si taglia
// con un marcatore — il modello ne ha abbastanza per ragionare.
const MAX_RISULTATO = 3000;

// ---------------------------------------------------------------------------
// Schemi (formato OpenAI function calling)
// ---------------------------------------------------------------------------
export const STRUMENTI: DefinizioneStrumento[] = [
  {
    type: "function",
    function: {
      name: "cerca_ticket",
      description:
        "Cerca ticket di assistenza. Senza filtri restituisce i più recenti. " +
        "Per stato usa: NUOVO, IN_CORSO, RISOLTO, CHIUSO (oppure TUTTI per tutti). " +
        "Per priorita: ALTA, MEDIA, BASSA (oppure TUTTE).",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Testo libero: numero, cliente, contatto, sommario..." },
          stato: { type: "string", description: "Stato del ticket" },
          priorita: { type: "string", description: "Priorità del ticket" },
          limite: { type: "number", description: "Quanti ticket tornare (default 10, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ticket",
      description:
        "Dettaglio completo di UN ticket con la conversazione (messaggi) e le note. " +
        "Accetta il numero (es. TICK-123456) o l'id.",
      parameters: {
        type: "object",
        properties: {
          riferimento: { type: "string", description: "Numero (TICK-...) o id del ticket" },
        },
        required: ["riferimento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_clienti",
      description:
        "Cerca nell'anagrafica clienti per ragione sociale, partita IVA o città.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Testo di ricerca" },
          limite: { type: "number", description: "Quanti clienti tornare (default 10, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cliente",
      description: "Anagrafica completa di un cliente dato il suo id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id del cliente (es. CLI-001)" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "statistiche_dashboard",
      description:
        "Statistiche aggregate dei ticket: totali, per stato (nuovi/in corso/risolti/chiusi), " +
        "per priorità e numero di ticket aperti. Nessun argomento.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "proponi_progetto_con_task",
      description:
        "Crea una PROPOSTA di progetto con le sue attività. Non crea nulla nell'app: " +
        "la proposta deve essere approvata da un umano. Usalo solo quando l'operatore " +
        "chiede esplicitamente di creare un progetto, di organizzare il lavoro o di " +
        "trasformare in task le richieste di un ticket/email. Non inventare date o " +
        "assegnatari: lascia vuoto ciò che non è noto. Dopo la chiamata non dire di " +
        "aver creato il progetto: di' che la proposta è pronta per l'approvazione.",
      parameters: {
        type: "object",
        properties: {
          progetto: {
            type: "object",
            description: "Dati del progetto da proporre.",
            properties: {
              nome: { type: "string", description: "Nome breve e chiaro del progetto" },
              descrizione: { type: "string", description: "Contesto e obiettivo del progetto" },
              cliente_id: {
                type: "string",
                description: "Id del cliente, se noto dal contesto o da cerca_clienti",
              },
              cliente_nome: {
                type: "string",
                description: "Ragione sociale del cliente, se l'id non è noto",
              },
              priorita: { type: "string", enum: ["BASSA", "MEDIA", "ALTA"] },
              responsabile: { type: "string" },
              data_inizio: { type: "string", description: "Formato YYYY-MM-DDTHH:mm" },
              data_fine: { type: "string", description: "Formato YYYY-MM-DDTHH:mm" },
              note: { type: "string" },
            },
            required: ["nome"],
          },
          attivita: {
            type: "array",
            description: "Attività operative da creare dentro il progetto.",
            items: {
              type: "object",
              properties: {
                titolo: { type: "string" },
                descrizione: { type: "string" },
                priorita: { type: "string", enum: ["BASSA", "MEDIA", "ALTA"] },
                data_scadenza: {
                  type: "string",
                  description: "Formato YYYY-MM-DDTHH:mm, solo se presente nel ticket/email",
                },
                assegnatario: { type: "string" },
                persone: { type: "array", items: { type: "string" } },
              },
              required: ["titolo"],
            },
          },
        },
        required: ["progetto", "attivita"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Serializzazione con cap
// ---------------------------------------------------------------------------
function tronca(testo: string): string {
  if (testo.length <= MAX_RISULTATO) return testo;
  return `${testo.slice(0, MAX_RISULTATO)}\n[...troncato, risultato originale più lungo]`;
}

function serializza(valore: unknown): string {
  try {
    return tronca(JSON.stringify(valore, null, 1) ?? String(valore));
  } catch {
    return tronca(String(valore));
  }
}

// ---------------------------------------------------------------------------
// Esecutori (query reali sul nostro DB)
// ---------------------------------------------------------------------------
async function eseguiCercaTicket(args: {
  q?: string;
  stato?: string;
  priorita?: string;
  limite?: number;
}): Promise<unknown> {
  const statoValidi = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO", "TUTTI"];
  const prioritaValide = ["ALTA", "MEDIA", "BASSA", "TUTTE"];
  const risultato = await listTickets({
    q: typeof args.q === "string" ? args.q : undefined,
    stato: statoValidi.includes(args.stato ?? "")
      ? (args.stato as "NUOVO" | "IN_CORSO" | "RISOLTO" | "CHIUSO" | "TUTTI")
      : undefined,
    priorita: prioritaValide.includes(args.priorita ?? "")
      ? (args.priorita as "ALTA" | "MEDIA" | "BASSA" | "TUTTE")
      : undefined,
    pagina: 1,
    paginaSize: Math.min(50, Math.max(1, Number(args.limite) || 10)),
  });
  return {
    totale: risultato.totale,
    ticket: risultato.tickets.map((t) => ({
      numero: t.numero,
      cliente: t.cliente,
      contatto: t.contatto,
      stato: t.stato,
      priorita: t.priorita,
      sommario: t.sommario_problema,
      modulo: t.modulo_software,
      operatore: t.operatore,
      data_creazione: t.data_creazione,
    })),
  };
}

async function eseguiGetTicket(riferimento: string): Promise<unknown> {
  const rif = riferimento.trim();
  // Prima per numero (TICK-...), poi per id; poi si recupera il dettaglio
  // COMPLETO (con messaggi) dato l'id: getTicketByNumero ritorna la riga
  // senza conversazione.
  const perNumero = await getTicketByNumero(rif);
  const completo = perNumero ? await getTicket(perNumero.id) : await getTicket(rif);
  const ticket = completo ?? perNumero;
  if (!ticket) return { errore: `Ticket "${rif}" non trovato.` };
  // Solo i campi che servono a ragionare: niente note tecniche/allegati grezzi.
  const messaggi = (completo?.messaggi ?? []).map((m) => ({
    ruolo: m.ruolo,
    contenuto: m.contenuto,
    data: m.data_creazione,
  }));
  return {
    numero: ticket.numero,
    cliente: ticket.cliente,
    contatto: ticket.contatto,
    email: ticket.email,
    telefono: ticket.telefono,
    stato: ticket.stato,
    priorita: ticket.priorita,
    modulo_software: ticket.modulo_software,
    sommario: ticket.sommario_problema,
    descrizione: ticket.descrizione_dettagliata,
    operatore: ticket.operatore,
    data_creazione: ticket.data_creazione,
    messaggi,
  };
}

async function eseguiCercaClienti(args: { q?: string; limite?: number }): Promise<unknown> {
  const clienti = await listClienti(
    typeof args.q === "string" ? args.q : undefined,
    Math.min(50, Math.max(1, Number(args.limite) || 10))
  );
  return {
    totale: clienti.length,
    clienti: clienti.map((c) => ({
      id: c.id,
      ragione_sociale: c.ragione_sociale,
      nome_contatto: c.nome_contatto,
      email: c.email,
      citta: c.citta,
    })),
  };
}

async function eseguiGetCliente(id: string): Promise<unknown> {
  const cliente = await getCliente(id.trim());
  if (!cliente) return { errore: `Cliente "${id}" non trovato.` };
  return cliente;
}

// ---------------------------------------------------------------------------
// Dispatcher pubblico
// ---------------------------------------------------------------------------

// Esegue uno strumento richiesto dal modello. Ritorna il risultato come
// stringa (JSON) da rimettere nei messages del loop. Gli errori NON
// esplodono: vengono restituiti come risultato {"errore": ...} così il
// modello può correggersi al turno successivo invece di fallire tutto.
export async function eseguiStrumento(
  nome: string,
  argomenti: unknown,
  contesto?: ContestoStrumento
): Promise<string> {
  if (!TUTTI_STRUMENTI.includes(nome)) {
    return serializza({ errore: `Strumento "${nome}" non esistente.` });
  }
  const args = (argomenti && typeof argomenti === "object" ? argomenti : {}) as Record<
    string,
    unknown
  >;
  try {
    switch (nome) {
      case "cerca_ticket":
        return serializza(await eseguiCercaTicket(args));
      case "get_ticket":
        return serializza(
          await eseguiGetTicket(String(args.riferimento ?? args.numero ?? ""))
        );
      case "cerca_clienti":
        return serializza(await eseguiCercaClienti(args));
      case "get_cliente":
        return serializza(await eseguiGetCliente(String(args.id ?? "")));
      case "statistiche_dashboard":
        return serializza(await getStats());
      case "proponi_progetto_con_task": {
        if (!contesto?.operatoreId) {
          return serializza({
            errore: "Contesto operatore mancante: impossibile creare la proposta.",
          });
        }
        const esito = await creaProposta({
          agenteId: contesto.agenteId,
          esecuzioneId: contesto.esecuzioneId,
          conversazioneId: contesto.conversazioneId,
          operatoreId: contesto.operatoreId,
          payload: args,
        });
        if (!esito.ok) return serializza({ errore: esito.error });
        return serializza({
          ok: true,
          proposta_id: esito.proposta.id,
          messaggio:
            "Proposta creata e in attesa di approvazione. Non dire che il progetto è stato creato.",
          progetto: esito.proposta.payload.progetto.nome,
          attivita: esito.proposta.payload.attivita.length,
        });
      }
      default:
        return serializza({ errore: `Strumento "${nome}" non implementato.` });
    }
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "Errore sconosciuto.";
    return serializza({ errore: messaggio });
  }
}

// Solo gli strumenti richiesti dall'agente (intersezione con quelli validi):
// il modello non deve poter chiamare tool che l'agente non ha attivati.
export function strumentiPerAgente(nomi: string[]): DefinizioneStrumento[] {
  const validi = new Set(nomi.filter((n) => TUTTI_STRUMENTI.includes(n)));
  return STRUMENTI.filter((s) => validi.has(s.function.name));
}
