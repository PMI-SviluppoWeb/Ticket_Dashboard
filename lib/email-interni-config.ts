import "server-only";
import { db } from "./db";
import { leggiImpostazione } from "./impostazioni";
import {
  eMittenteInterno,
  normalizzaEmail,
  parseRegoleInterne,
  type RegoleInterne,
} from "./email-interni";

export const CHIAVE_MITTENTI_INTERNI = "email_mittenti_interni";

// Regole effettive:
//  - tutte le caselle ABILITATE (assistenza@..., svilupoweb@...) sono sempre
//    interne;
//  - piu' gli indirizzi/domini extra configurati dall'admin.
export async function regoleInterne(): Promise<RegoleInterne> {
  const caselle = await db
    .prepare("SELECT indirizzo FROM caselle_email WHERE abilitata = 1")
    .all();
  const daCaselle = caselle
    .map((r) => normalizzaEmail(String(r.indirizzo ?? "")))
    .filter((e) => e.includes("@"));

  const env = [process.env.EMAIL_FROM, process.env.SMTP_USER]
    .filter((v): v is string => typeof v === "string" && v.includes("@"))
    .map(normalizzaEmail);

  let extra: string[] = [];
  try {
    const raw = await leggiImpostazione(CHIAVE_MITTENTI_INTERNI);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        extra = parsed.filter((x): x is string => typeof x === "string");
      }
    }
  } catch (err) {
    console.error("Configurazione mittenti interni non leggibile:", err);
  }

  const daExtra = parseRegoleInterne(extra);
  return {
    indirizzi: Array.from(new Set([...daCaselle, ...env, ...daExtra.indirizzi])),
    domini: daExtra.domini,
  };
}

// Fail-open: se la configurazione non e' leggibile NON si ignorano email a
// caso. Si logga e si prosegue con il triage normale.
export async function mittenteInterno(from: string): Promise<boolean> {
  try {
    return eMittenteInterno(from, await regoleInterne());
  } catch (err) {
    console.error("Verifica mittente interno fallita:", err);
    return false;
  }
}
