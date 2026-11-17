import "server-only";
import type { DefinizioneStrumento } from "./agenti-tools";

// ===========================================================================
// Provider AI parametrico per l'esecuzione degli agenti.
//
// Due backend con lo STESSO formato di risposta (OpenAI Chat Completions):
//   - "hermes"    → Hermes Agent (API server locale/cloud): le richieste
//                   passano dall'agent di Hermes, che aggiunge memoria
//                   persistente, skills e tool al nostro system prompt.
//                   Si attiva impostando HERMES_BASE_URL.
//   - "openrouter" → chiamata diretta a OpenRouter (comportamento storico).
//                   Unico backend che supporta qui il loop strumenti
//                   (tools/tool_calls): le chiamate le esegue la NOSTRA
//                   app (lib/agenti-tools.ts), non il provider.
//
// Se HERMES_BASE_URL non e' presente, si usa OpenRouter: nessun cambio di
// comportamento per le installazioni esistenti.
// ===========================================================================

export type ProviderAI = "hermes" | "openrouter";

// Messaggio del formato Chat Completions (storico del loop strumenti).
export interface MessaggioChat {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ChiamataStrumento {
  id: string;
  name: string;
  // Argomenti come stringa JSON grezza (formato OpenAI): serve per
  // ricostruire l' messaggio assistant nello storico del loop.
  arguments: string;
}

export interface EsitoInvocazione {
  // null quando la risposta è composta solo da tool_calls (turno di loop).
  output: string | null;
  toolCalls: ChiamataStrumento[];
  promptTokens: number | null;
  completionTokens: number | null;
  provider: ProviderAI;
}

export class ErroreProviderAI extends Error {
  status: number;
  constructor(status: number, messaggio: string) {
    super(messaggio);
    this.name = "ErroreProviderAI";
    this.status = status;
  }
}

// Lettura lazy dell'env (stesso motivo di lib/imap-worker.ts: nelle route
// Next le env sono disponibili, ma nei vari entry point il dotenv parte
// dopo i moduli).
export function providerAttivo(): ProviderAI {
  return process.env.HERMES_BASE_URL ? "hermes" : "openrouter";
}

function baseUrlHermes(): string {
  return (process.env.HERMES_BASE_URL ?? "").replace(/\/+$/, "");
}

// Invoca il modello.
//
// - `messaggi`: storico completo (se assente si costruisce [system, input]).
//   Usato dal loop strumenti per rimandare avanti tool_calls/tool results.
// - `tools`: definizioni function-calling — SOLO OpenRouter (il loop con
//   esecuzione in-app vive lì; Hermes non le riceve mai).
// - `sessionId`/`sessionKey`: SOLO Hermes (continuità thread + scope
//   memoria a lungo termine per agente).
export async function invocaModello(opts: {
  systemPrompt: string;
  input: string;
  modello?: string;
  // Override del provider globale (da colonna agenti.provider).
  provider?: ProviderAI;
  sessionId?: string;
  sessionKey?: string;
  messaggi?: MessaggioChat[];
  tools?: DefinizioneStrumento[];
}): Promise<EsitoInvocazione> {
  const provider = opts.provider ?? providerAttivo();
  const messages: MessaggioChat[] =
    opts.messaggi && opts.messaggi.length > 0
      ? opts.messaggi
      : [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.input },
        ];

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === "hermes") {
    url = `${baseUrlHermes()}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.HERMES_API_KEY ?? ""}`,
    };
    // L'header di sessione rende le richieste "non stateless": Hermes
    // carica lo storico della sessione prima di eseguire il turno.
    if (opts.sessionId) headers["X-Hermes-Session-Id"] = opts.sessionId;
    if (opts.sessionKey) headers["X-Hermes-Session-Key"] = opts.sessionKey;
    body = {
      model: process.env.HERMES_MODEL ?? "hermes-agent",
      messages,
      stream: false,
    };
    // NB: opts.tools NON viene mandato a Hermes — il loop strumenti con
    // esecuzione in-app gira solo su OpenRouter (vedi eseguiAgente).
  } else {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "HTTP-Referer": "https://support-desk.local",
      "X-Title": "Ticket Dashboard Agents",
    };
    body = {
      model: opts.modello || "deepseek/deepseek-v4.1-flash-1017",
      temperature: 0.3,
      messages,
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools;
      // Senza choice il modello potrebbe rispondere solo con tool_calls
      // ignorando la richiesta: "auto" lascia decidere a lui.
      body.tool_choice = "auto";
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // Nessuna cache: ogni invocazione e' un turno nuovo.
      cache: "no-store",
    });
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "Errore di rete.";
    throw new ErroreProviderAI(
      0,
      provider === "hermes"
        ? `Hermes non raggiungibile (${url}): ${messaggio}`
        : `OpenRouter non raggiungibile: ${messaggio}`
    );
  }

  if (!res.ok) {
    const testo = await res.text().catch(() => "");
    throw new ErroreProviderAI(
      res.status,
      `${provider === "hermes" ? "Hermes" : "OpenRouter"} HTTP ${res.status}: ${testo.slice(0, 500)}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type?: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = data.choices?.[0]?.message;
  const toolCalls: ChiamataStrumento[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : "{}",
  }));
  const output = message?.content ?? null;

  if (!output && toolCalls.length === 0) {
    throw new ErroreProviderAI(502, "Risposta del modello vuota.");
  }

  return {
    output,
    toolCalls,
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
    provider,
  };
}
