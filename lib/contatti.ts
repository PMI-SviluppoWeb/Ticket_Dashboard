// Contatti del cliente dentro un ticket.
//
// Due modi per riempire email/telefono: il campo dedicato oppure il testo
// libero (contatto, descrizione). L'agente vocale arriva spuro dal centralino
// e butta tutto in `contatto`, quindi prima dei campi si prova sempre a
// leggere il testo: senza questa estrazione la mail non arriva mai in colonna
// e dall'invio email della pagina ticket non si parte.

export const EMAIL_PLACEHOLDER = "sconosciuto@placeholder.it";

const RE_EMAIL = /[\w.+-]+@[\w.-]+\.\w{2,}/;
const RE_TELEFONO = /(?:\+39|0039)\s*[\d\s\-]{8,15}|(?<!\d)[\d\s\-]{8,15}(?!\d)/;

export function emailValida(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function estraiEmail(testo: string | null | undefined): string | null {
  if (!testo) return null;
  const match = testo.match(RE_EMAIL);
  return match ? match[0] : null;
}

export function estraiTelefono(testo: string | null | undefined): string | null {
  if (!testo) return null;
  const match = testo.match(RE_TELEFONO);
  if (!match) return null;
  const numero = normalizzaTelefono(match[0]);
  // Meno di 6 cifre e' un codice, un anno o un refuso: non un recapito.
  return numero.replace(/\D/g, "").length >= 6 ? numero : null;
}

// Cifre con '+' iniziale preservato: resta confrontabile con l'anagrafica ERP.
export function normalizzaTelefono(valore: string): string {
  const pulito = valore.replace(/[^\d+]/g, "");
  const corpo = pulito.replace(/\+/g, "");
  return pulito.startsWith("+") ? `+${corpo}` : corpo;
}

// Toglie email e numero dal testo libero: resta il nome del referente.
function pulisciContatto(testo: string, email: string | null, telefono: string | null): string {
  let nome = testo;
  if (email) nome = nome.split(email).join(" ");
  if (telefono) {
    // Nel testo il numero puo' avere spazi e punteggiatura, qui e' normalizzato:
    // si toglie anche la forma originale in cui e' stato scritto.
    const grezzo = testo.match(RE_TELEFONO)?.[0];
    if (grezzo) nome = nome.split(grezzo).join(" ");
    nome = nome.split(telefono).join(" ");
  }
  return (
    nome
      .replace(/[<>]/g, "")
      .replace(/[-–—,;|/\\]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

export interface ContattiInput {
  contatto?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface ContattiEstratti {
  email: string | null;
  telefono: string | null;
  contatto: string;
}

// Completa email/telefono a partire dai campi gia' compilati e dai testi
// liberi. Non sovrascrive mai un valore gia' presente e non tocca il contatto
// se dentro non era nascosto alcun recapito.
export function completaContatti(input: ContattiInput, ...testi: (string | null | undefined)[]): ContattiEstratti {
  let email = input.email?.trim() || null;
  if (email === EMAIL_PLACEHOLDER) email = null;

  let telefono = input.telefono?.trim() || null;
  if (telefono) {
    telefono = normalizzaTelefono(telefono);
    if (telefono.replace(/\D/g, "").length < 6) telefono = null;
  }

  const mancavano = { email: !email, telefono: !telefono };
  let testo = "";
  for (const t of testi) {
    if (!t) continue;
    testo += (testo ? " " : "") + t;
  }
  if (!email) email = estraiEmail(testo);
  if (!telefono) telefono = estraiTelefono(testo);

  const estratto = (mancavano.email && !!email) || (mancavano.telefono && !!telefono);
  const contattoOriginale = (input.contatto ?? "").trim();
  const ripulito = pulisciContatto(contattoOriginale, email, telefono);
  // Il contatto si riscrive solo se dentro c'era davvero un recapito:
  // altrimenti resta com'era, punteggiatura compresa.
  const senzaRiepilogo = contattoOriginale
    .replace(/[-–—,;|/\\]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const contatto = !estratto && ripulito === senzaRiepilogo
    ? contattoOriginale || "Non fornito"
    : ripulito || "Non fornito";

  return { email, telefono, contatto };
}
