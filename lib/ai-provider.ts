import "server-only";

// ===========================================================================
// Provider AI parametrico per l'esecuzione degli agenti.
//
// Due backend con lo STESSO formato di risposta (OpenAI Chat Completions):
//   - "hermes"    → Hermes Agent (API server locale/cloud): le richieste
//                   passano dall'agent di Hermes, che aggiunge memoria
//                   persistente, skills e tool al nostro system prompt.
//                   Si attiva impostando HERMES_BASE_URL.
//   - "openrouter" → chiamata diretta a OpenRouter (comportamento storico).
//
// Se HERMES_BASE_URL non e' presente, si usa OpenRouter: nessun cambio di
// comportamento per le installazioni esistenti.
// ===========================================================================

export type ProviderAI = "hermes" | "openrouter";

export interface EsitoInvocazione {
  output: string;
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

// Invoca il modello con il system prompt dato.
//
// `sessionId`/`sessionKey` sono usati SOLO da Hermes:
//  - X-Hermes-Session-Id  → continuita' della conversazione (le esecuzioni
//    successive dello stesso agente continuano lo stesso thread);
//  - X-Hermes-Session-Key → scope stabile della memoria a lungo termine
//    (memoria dedicata per agente, indipendente dal singolo thread).
export async function invocaModello(opts: {
  systemPrompt: string;
  input: string;
  modello?: string;
  sessionId?: string;
  sessionKey?: string;
}): Promise<EsitoInvocazione> {
  const provider = providerAttivo();
  const messages = [
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
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const output = data.choices?.[0]?.message?.content;
  if (!output) {
    throw new ErroreProviderAI(502, "Risposta del modello vuota.");
  }

  return {
    output,
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
    provider,
  };
}
