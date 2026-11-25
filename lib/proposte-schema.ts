import type {
  Priorita,
  PropostaAttivita,
  PropostaProgettoPayload,
} from "./types";

const MAX_ATTIVITA = 30;
const RE_DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function priorita(v: unknown): Priorita {
  return PRIORITA.includes(v as Priorita) ? (v as Priorita) : "MEDIA";
}

function data(v: unknown): string | null {
  const s = str(v, 20);
  if (!s) return null;
  return RE_DATA.test(s) ? s : null;
}

function persone(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(
      v
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim().slice(0, 120))
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function payloadVuoto(): PropostaProgettoPayload {
  return {
    progetto: {
      nome: "",
      descrizione: "",
      cliente_id: null,
      cliente_nome: null,
      priorita: "MEDIA",
      responsabile: null,
      data_inizio: null,
      data_fine: null,
      note: "",
    },
    attivita: [],
  };
}

export type EsitoPayloadProposta =
  | { ok: true; payload: PropostaProgettoPayload }
  | { ok: false; error: string };

// Valida e normalizza il payload della proposta. Con `richiediCliente` (usato
// all'approvazione) il cliente e' obbligatorio; alla creazione puo' mancare.
export function validaPayloadProposta(
  input: unknown,
  opts: { richiediCliente?: boolean } = {}
): EsitoPayloadProposta {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Payload della proposta non valido." };
  }
  const raw = input as Record<string, unknown>;
  const p = (raw.progetto ?? {}) as Record<string, unknown>;

  const nome = str(p.nome, 200);
  if (!nome) {
    return { ok: false, error: "Il nome del progetto è obbligatorio." };
  }

  const clienteId = str(p.cliente_id, 200) || null;
  if (opts.richiediCliente && !clienteId) {
    return { ok: false, error: "Seleziona il cliente prima di approvare." };
  }

  const attivitaRaw = Array.isArray(raw.attivita) ? raw.attivita : [];
  if (attivitaRaw.length > MAX_ATTIVITA) {
    return {
      ok: false,
      error: `Troppe attività: massimo ${MAX_ATTIVITA}.`,
    };
  }

  const attivita: PropostaAttivita[] = [];
  for (const item of attivitaRaw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const titolo = str(a.titolo, 300);
    if (!titolo) {
      return { ok: false, error: "Ogni attività deve avere un titolo." };
    }
    attivita.push({
      titolo,
      descrizione: str(a.descrizione, 3000),
      priorita: priorita(a.priorita),
      data_scadenza: data(a.data_scadenza),
      assegnatario: str(a.assegnatario, 120) || null,
      persone: persone(a.persone),
    });
  }

  return {
    ok: true,
    payload: {
      progetto: {
        nome,
        descrizione: str(p.descrizione, 3000),
        cliente_id: clienteId,
        cliente_nome: str(p.cliente_nome, 200) || null,
        priorita: priorita(p.priorita),
        responsabile: str(p.responsabile, 120) || null,
        data_inizio: data(p.data_inizio),
        data_fine: data(p.data_fine),
        note: str(p.note, 5000),
      },
      attivita,
    },
  };
}
