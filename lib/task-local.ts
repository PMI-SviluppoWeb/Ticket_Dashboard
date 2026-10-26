// ===========================================================================
// Stato LOCALE della board delle task: sezioni, sottoattivita' e commenti.
//
// Questi dati non hanno ancora una tabella sul database: vivono nello stato
// del componente e si perdono al refresh. Tipi e helper stanno qui, in un
// modulo puro importabile da Client Component, perche' il giorno in cui il
// backend arrivera' le rotte e i componenti condivideranno gia' la stessa
// forma.
// ===========================================================================

export interface Sezione {
  id: string;
  titolo: string;
}

export interface SottoAttivita {
  id: string;
  titolo: string;
  fatta: boolean;
}

export interface CommentoTask {
  id: string;
  autore: string;
  testo: string;
  // ISO 8601: stesso criterio dei campi di audit del resto dell'app.
  data: string;
}

// Tutto opzionale: l'assenza di una chiave significa "nessuna modifica
// locale", e la UI ricade sui valori reali dell'attivita'.
export interface ExtraTask {
  persone?: string[];
  ticket_id?: string | null;
  sotto?: SottoAttivita[];
  commenti?: CommentoTask[];
  // Sezione della board in cui la task e' stata spostata. Assente = sezione
  // iniziale: le attivita' che esistono gia' non vanno rimescolate.
  sezione?: string;
}

// La board parte con una sezione sola: le attivita' esistenti hanno gia'
// un ordine proprio e non vanno distribuite a caso.
export const SEZIONE_INIZIALE: Sezione = {
  id: "sezione-attivita",
  titolo: "Attività",
};

export function nuovoId(): string {
  // randomUUID richiede un contesto sicuro (https o localhost): il fallback
  // evita un crash se l'app viene aperta da un IP in HTTP semplice.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Iniziali per gli avatar: "Marco Rossi" -> "MR", "Marco" -> "MA".
// Senza nome restituisce "?", mai un cerchio vuoto.
export function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return "?";
  if (parti.length === 1) return parti[0].slice(0, 2).toUpperCase();
  return (parti[0][0] + parti[parti.length - 1][0]).toUpperCase();
}
