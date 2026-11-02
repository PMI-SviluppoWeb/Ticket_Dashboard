"use client";

// ===========================================================================
// Cache delle risposte GET, in memoria di scheda.
//
// Perche' esiste: ogni pagina fa la propria `fetch` in `useEffect`, e tornare
// su una pagina gia' visitata significa rifare il giro completo — HTTP fino al
// server, query sul Turso remoto, risposta. Con un DB remoto sono 30-80 ms per
// query piu' il viaggio: la pagina "si apre" solo quando tutto e' arrivato.
//
// Qui il dato gia' visto viene mostrato SUBITO (anche se vecchio di qualche
// secondo) e la richiesta parte comunque in background: quando arriva, la
// schermata si aggiorna. E' lo stesso contratto di SWR, scritto in casa perche'
// il caso e' uno solo e una dipendenza in piu' andrebbe poi adottata ovunque.
//
// Scelte deliberate:
// - NIENTE AbortController per queste GET. Annullare una richiesta che sta gia'
//   viaggiando non risparmia il viaggio (e' partita), e con la cache quella
//   risposta e' utile al prossimo montaggio. Il debounce e' cio' che evita le
//   richieste inutili, non l'abort.
// - Una richiesta in corso per lo stesso URL non si duplica: due componenti che
//   chiedono lo stesso dato aspettano la stessa promessa.
// - La cache vive quanto la scheda. Al logout va svuotata (`svuotaCache`),
//   altrimenti il prossimo utente vedrebbe i dati del precedente.
// ===========================================================================

const TTL_FRESCO = 30_000; // entro questa eta' non si rilegge
const TTL_MASSIMO = 5 * 60_000; // oltre, il dato vecchio non si mostra proprio

interface Voce {
  dato: unknown;
  quando: number;
}

const cache = new Map<string, Voce>();
const inCorso = new Map<string, Promise<unknown>>();

export function leggiCache<T>(url: string): T | undefined {
  const voce = cache.get(url);
  if (!voce) return undefined;
  if (Date.now() - voce.quando > TTL_MASSIMO) {
    cache.delete(url);
    return undefined;
  }
  return voce.dato as T;
}

export function etaCache(url: string): number {
  const voce = cache.get(url);
  return voce ? Date.now() - voce.quando : Infinity;
}

export function scriviCache(url: string, dato: unknown): void {
  cache.set(url, { dato, quando: Date.now() });
}

// Invalida per prefisso: `invalidaCache("/api/tickets")` copre ogni variante
// con filtri e pagine, che e' quello che serve dopo una scrittura.
export function invalidaCache(prefisso: string): void {
  cache.forEach((_, chiave) => {
    if (chiave.startsWith(prefisso)) cache.delete(chiave);
  });
}

export function svuotaCache(): void {
  cache.clear();
  inCorso.clear();
}

// Lettura con cache. `forza` ignora il dato fresco (ma non quello in corso:
// una seconda richiesta identica mentre la prima viaggia e' solo spreco).
export async function caricaApi<T>(url: string, opts?: { forza?: boolean }): Promise<T> {
  const inVolo = inCorso.get(url);
  if (inVolo) return inVolo as Promise<T>;

  if (!opts?.forza) {
    const voce = cache.get(url);
    if (voce && Date.now() - voce.quando <= TTL_FRESCO) return voce.dato as T;
  }

  const promessa = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const dato = (await res.json()) as T;
      scriviCache(url, dato);
      return dato;
    })
    .finally(() => {
      inCorso.delete(url);
    });

  inCorso.set(url, promessa);
  return promessa;
}

// Riscalda la cache senza mostrare nulla: si usa al passaggio del mouse su una
// voce di navigazione, cosi' la pagina che si apre ha gia' il dato.
export function prefetchApi(url: string): void {
  if (cache.has(url) && etaCache(url) <= TTL_FRESCO) return;
  void caricaApi(url).catch(() => {
    // Un prefetch fallito non e' un errore da mostrare: la pagina vera
    // riprovera' e mostrera' il suo messaggio.
  });
}

// Riuso immediato: restituisce il dato in cache (anche vecchio) per dipingere
// la schermata senza attendere il viaggio. Va usato PRIMA di `caricaApi`, che
// poi conferma o corregge.
export function datoImmediato<T>(url: string): T | undefined {
  return leggiCache<T>(url);
}

// ===========================================================================
// Una scrittura invalida la cache.
//
// Senza questo, il caso classico si rompe: salvo una nota e la pagina ricarica
// la lista — ma entro 30 secondi `caricaApi` risponde con la copia in cache e
// la modifica appena fatta NON compare. Sarebbe un bug che si manifesta solo
// sotto i 30 secondi, cioe' quasi sempre.
//
// L'aggancio e' un unico punto: si osserva `fetch`. Non si sostituiscono le ~30
// chiamate di scrittura sparse nei componenti, e ogni scrittura futura e' coperta
// senza ricordarsene. Solo il metodo conta: le GET restano intatte.
// ===========================================================================
let installato = false;

export function invalidaDopoScritture(): void {
  if (installato || typeof window === "undefined") return;
  installato = true;

  const fetchOriginale = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const risposta = await fetchOriginale(input, init);
    if (metodo !== "GET" && metodo !== "HEAD" && risposta.ok) {
      // Si svuota tutto invece di indovinare quale URL e' cambiato: il costo di
      // una rilettura e' un viaggio, il costo di una cache sbagliata e' un dato
      // che sembra salvato e non lo e'. Le scritture sono rare e volute.
      svuotaCache();
    }
    return risposta;
  };
}

invalidaDopoScritture();
