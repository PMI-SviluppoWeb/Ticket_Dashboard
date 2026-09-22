import type { EmailClassification, EmailIntent, Priorita } from "./types";

const SYSTEM_PROMPT = `Sei un classificatore di email di supporto tecnico software.
Analizza l'email in input e restituisci un JSON con i seguenti campi:

- intent: uno tra "technical_issue", "billing_issue", "account_access", "feature_request", "complaint", "question", "other"
- priorita: una tra "BASSA", "MEDIA", "ALTA" (usa italiano maiuscolo)
- sommario: massimo 120 caratteri che riassume il problema
- modulo_suggerito: il modulo software più probabile tra questi opzioni generiche: "Contabilità", "Fatturazione", "Magazzino", "Amministrazione", "Posizione", "Altro"
- requiresHumanReview: true se l'email contiene richieste di rimborso, toni aggressivi, problemi legali, o se non sei sicuro della classificazione

Regole per la priorità:
- ALTA: errori che bloccano il lavoro, loss di dati, problemi di sicurezza, urgenza esplicita
- MEDIA: funzionalità non disponibili ma con workaround, errori ricorrenti
- BASSA: domande generali, richieste di informazioni, feature request non urgenti`;

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEmailBody(text: string): string {
  const lines = text.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.match(/^>*\s*(Il giorno|On |Da:|Sent:|From:|To:|Cc:|Subject:|Inviato|Scritto|---------- Forwarded|---\s*Message)/i)
    ) {
      break;
    }
    if (trimmed.match(/^>*\s*(Gentile|Ciao|Buongiorno|Buonasera|Salve)[, ]/i) && cleaned.length > 3) {
      break;
    }
    cleaned.push(line);
  }
  return cleaned.join("\n").trim();
}

export async function classifyEmail(opts: {
  from: string;
  subject: string;
  body: string;
  bodyHtml?: string;
}): Promise<EmailClassification> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return fallbackClassification(opts.subject, opts.body);
  }

  try {
    const bodyText = opts.body || (opts.bodyHtml ? stripHtml(opts.bodyHtml) : "");
    const cleaned = cleanEmailBody(bodyText);
    const truncated = cleaned.length > 2000 ? cleaned.slice(0, 2000) + "\n[...troncato]" : cleaned;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://support-desk.local",
        "X-Title": "Support Desk Email Classifier",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Mittente: ${opts.from}\nOggetto: ${opts.subject}\n\nCorpo dell'email:\n${truncated}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Errore OpenRouter:", response.status, await response.text());
      return fallbackClassification(opts.subject, opts.body);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallbackClassification(opts.subject, opts.body);

    const parsed = JSON.parse(content);

    const validIntents: EmailIntent[] = [
      "technical_issue", "billing_issue", "account_access",
      "feature_request", "complaint", "question", "other",
    ];
    const validPriorita: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

    return {
      intent: validIntents.includes(parsed.intent) ? parsed.intent : "other",
      priorita: validPriorita.includes(parsed.priorita) ? parsed.priorita : "MEDIA",
      sommario: typeof parsed.sommario === "string" ? parsed.sommario.slice(0, 120) : opts.subject.slice(0, 120),
      modulo_suggerito: typeof parsed.modulo_suggerito === "string" ? parsed.modulo_suggerito : "Altro",
      requiresHumanReview: typeof parsed.requiresHumanReview === "boolean" ? parsed.requiresHumanReview : false,
    };
  } catch (err) {
    console.error("Errore classificazione email (OpenRouter):", err);
    return fallbackClassification(opts.subject, opts.body);
  }
}

function fallbackClassification(subject: string, body: string): EmailClassification {
  const text = `${subject} ${body}`.toLowerCase();

  let intent: EmailIntent = "other";
  if (text.match(/errore|bug|crash|non funziona|bloccato|comeoNon|non riesco/)) intent = "technical_issue";
  else if (text.match(/fattur|pagamento|bollettino|addebito|rimborso/)) intent = "billing_issue";
  else if (text.match(/password|login|accesso|credenziali|account/)) intent = "account_access";
  else if (text.match(/funzionalit|aggiungere|feature|suggerimento|possibilita/)) intent = "feature_request";
  else if (text.match(/lament|scortese|inaccettabile|rimborso immediato|avvocat/)) intent = "complaint";
  else if (text.match(/come|quando|dove|che cos|info|informazion/)) intent = "question";

  let priorita: Priorita = "MEDIA";
  if (text.match(/urgent|bloccato|critic|dati persi|sicurezza|non funziona da/)) priorita = "ALTA";
  else if (text.match(/info|domanda|quando possibile|quando potete/)) priorita = "BASSA";

  const requiresHumanReview = intent === "complaint" || priorita === "ALTA";

  return {
    intent,
    priorita,
    sommario: subject.slice(0, 120) || "Email ricevuta senza oggetto",
    modulo_suggerito: "Altro",
    requiresHumanReview,
  };
}
