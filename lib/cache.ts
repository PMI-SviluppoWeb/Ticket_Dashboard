// ===========================================================================
// Memo in-process per i dati di CONFIGURAZIONE.
//
// Non e' la cache delle risposte HTTP (quella sta in `lib/api-cache.ts`): qui si
// evita di ripetere la stessa query al database quando piu' schede, o piu'
// utenti, chiedono lo stesso dato entro pochi secondi.
//
// Solo per dati che cambiano di rado e per cui un ritardo e' innocuo. NON usarlo
// per ticket e progetti: li' il dato fresco E' il prodotto.
//
// Una promessa viene condivisa, non il valore: due richieste concorrenti a cache
// fredda aspettano la stessa query invece di lanciarne due.
// ===========================================================================

interface Voce<T> {
  promessa: Promise<T>;
  scadenza: number;
}

const voci = new Map<string, Voce<unknown>>();

export function memo<T>(chiave: string, ttlMs: number, calcola: () => Promise<T>): Promise<T> {
  const ora = Date.now();
  const voce = voci.get(chiave) as Voce<T> | undefined;
  if (voce && voce.scadenza > ora) return voce.promessa;

  const promessa = calcola().catch((err) => {
    // Un errore non si memorizza: la prossima richiesta deve poter riprovare.
    voci.delete(chiave);
    throw err;
  });

  voci.set(chiave, { promessa, scadenza: ora + ttlMs });
  return promessa;
}

// Da chiamare dopo una scrittura che cambia dati memorizzati: senza, il valore
// vecchio sopravvive fino alla scadenza.
export function invalidaMemo(prefisso?: string): void {
  if (!prefisso) {
    voci.clear();
    return;
  }
  voci.forEach((_, chiave) => {
    if (chiave.startsWith(prefisso)) voci.delete(chiave);
  });
}
