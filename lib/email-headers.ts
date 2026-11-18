// Funzioni pure per gli header di threading (niente DB): testabili da sole.

export function normalizzaMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return /^<[^>]+>$/.test(t) ? t : `<${t.replace(/^<|>$/g, "")}>`;
}

export function estraiRiferimenti(...valori: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of valori) {
    if (!v) continue;
    const trovati = v.match(/<[^>]+>/g);
    if (trovati && trovati.length > 0) {
      for (const id of trovati) {
        const n = normalizzaMessageId(id);
        if (n) out.push(n);
      }
    } else {
      const n = normalizzaMessageId(v);
      if (n) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

// Aggiunge [TICK-xxxx] all'oggetto se non c'e' gia'.
export function oggettoConToken(oggetto: string, numero: string | null): string {
  if (!numero) return oggetto;
  const token = `[${numero}]`;
  if (oggetto.includes(token)) return oggetto;
  return `${token} ${oggetto}`;
}
