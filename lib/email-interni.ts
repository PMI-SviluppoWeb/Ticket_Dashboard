// Riconoscimento dei mittenti interni: le email inviate dalle nostre caselle
// non devono creare ticket.
//
// Modulo puro (niente DB) cosi' e' testabile: la configurazione arriva da
// lib/email-interni-config.ts.

export interface RegoleInterne {
  // Indirizzi email completi (normalizzati, senza +tag).
  indirizzi: string[];
  // Domini interni, senza "@" (es. "pmisoftware.it").
  domini: string[];
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_DOMINIO = /^@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function normalizzaEmail(email: string): string {
  const t = String(email ?? "").trim().toLowerCase();
  const at = t.lastIndexOf("@");
  if (at <= 0) return t;
  // Le caselle con +tag sono lo stesso mittente.
  const locale = t.slice(0, at).split("+")[0];
  return `${locale}${t.slice(at)}`;
}

// Divide le righe configurate in indirizzi e domini. Accetta:
//   assistenza@pmisoftware.it
//   @pmisoftware.it
// Ignora righe vuote o non valide.
export function parseRegoleInterne(righe: string[]): RegoleInterne {
  const indirizzi = new Set<string>();
  const domini = new Set<string>();
  for (const riga of righe) {
    const t = String(riga ?? "").trim();
    if (!t) continue;
    if (t.startsWith("@")) {
      if (RE_DOMINIO.test(t)) domini.add(t.slice(1).toLowerCase());
      continue;
    }
    if (RE_EMAIL.test(t)) indirizzi.add(normalizzaEmail(t));
  }
  return {
    indirizzi: Array.from(indirizzi),
    domini: Array.from(domini),
  };
}

export function eMittenteInterno(from: string, regole: RegoleInterne): boolean {
  const email = normalizzaEmail(from);
  if (!email) return false;
  if (regole.indirizzi.includes(email)) return true;

  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const dominio = email.slice(at + 1);
  return regole.domini.some((d) => d.toLowerCase() === dominio);
}
