// ===========================================================================
// Le persone che condividono un progetto o una task.
//
// Modulo PURO: lo importa il server (lib/attivita.ts, lib/progetti.ts) e lo
// importano i Client Component (card del progetto, kanban, drawer della task).
// Per questo qui non c'e' nessun import da `@/lib/db` o simili.
//
// Perche' una lista di NOMI e non una tabella di collegamento: in tutto il
// dominio la persona e' un nome, non un id — `attivita.assegnatario`,
// `progetti.responsabile`, `tickets.operatore`, `voci_tempo.operatore`. Una
// tabella `progetto_operatori(progetto_id, operatore_id)` avrebbe creato un
// secondo modo di dire la stessa cosa, e i due si sarebbero disallineati alla
// prima rinomina di un operatore (che qui e' un UPDATE su una riga, mentre i
// riferimenti sarebbero rimasti indietro).
//
// Regola di composizione, identica per progetti e task:
//
//   - il PRIMO nome resta nella colonna storica (`responsabile` per il
//     progetto, `assegnatario` per la task): la leggono Google Calendar, il
//     calendario, la dashboard e le liste, e non si tocca;
//   - i COLLABORATORI stanno in `persone` (array JSON di nomi) e non
//     contengono mai il primo.
//
// Il primo nome e' quindi un duplicato intenzionale, non un secondo elenco:
// `tutteLePersone` ricompone l'ordine completo per la UI.
// ===========================================================================

// Oltre una decina di persone su una singola task non e' condivisione, e'
// un elenco che non sta in nessun avatar stack. Il limite e' applicato anche
// lato server, cosi' un payload costruito a mano non lo aggira.
export const MAX_PERSONE = 10;

function pulisciNome(valore: unknown): string {
  if (typeof valore !== "string") return "";
  // Gli spazi multipli arrivano dai copia-incolla; due nomi che differiscono
  // solo per uno spazio sarebbero due chip indistinguibili.
  return valore.replace(/\s+/g, " ").trim();
}

// Trim, scarta i vuoti, toglie i doppioni senza distinguere maiuscole/minuscole
// (tenendo la prima grafia incontrata) e taglia a MAX_PERSONE.
export function normalizzaNomi(elenco: unknown): string[] {
  if (!Array.isArray(elenco)) return [];
  const visti = new Set<string>();
  const nomi: string[] = [];
  for (const valore of elenco) {
    const nome = pulisciNome(valore);
    if (!nome) continue;
    const chiave = nome.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    nomi.push(nome);
    if (nomi.length >= MAX_PERSONE) break;
  }
  return nomi;
}

// Accetta sia il valore grezzo della colonna (stringa JSON) sia un array gia'
// decodificato (il corpo di una PATCH). Un JSON invalido vale []: una riga
// scritta male non deve far esplodere la lettura di una lista.
export function parsePersone(raw: unknown): string[] {
  if (Array.isArray(raw)) return normalizzaNomi(raw);
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    return normalizzaNomi(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Forma da scrivere in colonna. Sempre, anche per []: il DEFAULT '[]' copre le
// righe vecchie, ma un UPDATE esplicito non deve mai passare `undefined`.
export function serializzaPersone(elenco: unknown): string {
  return JSON.stringify(normalizzaNomi(elenco));
}

export interface PersoneComposte {
  // Il primo nome: va nella colonna storica.
  primario: string | null;
  // Gli altri: vanno in `persone`.
  persone: string[];
}

// Separa il primo nome dai collaboratori, togliendo il primo dai secondi.
// E' l'unico punto in cui si applica la regola "il primo non si ripete".
export function componiPersone(
  primario: string | null | undefined,
  collaboratori: unknown
): PersoneComposte {
  const capo = pulisciNome(primario) || null;
  const altri = normalizzaNomi(collaboratori).filter(
    (n) => !capo || n.toLowerCase() !== capo.toLowerCase()
  );
  return { primario: capo, persone: altri };
}

// Elenco completo nell'ordine da mostrare: primo, poi i collaboratori.
export function tutteLePersone(
  primario: string | null | undefined,
  collaboratori: unknown
): string[] {
  const { primario: capo, persone } = componiPersone(primario, collaboratori);
  return capo ? [capo, ...persone] : persone;
}

// Aggiunge una persona. Senza primo nome, la nuova diventa il primo: e' cosi'
// che la UI riempie una task vuota (la prima persona e' il responsabile).
export function conPersona(
  primario: string | null | undefined,
  collaboratori: unknown,
  nome: string
): PersoneComposte {
  const aggiunta = pulisciNome(nome);
  const corrente = componiPersone(primario, collaboratori);
  if (!aggiunta) return corrente;
  if (!corrente.primario) {
    return { primario: aggiunta, persone: corrente.persone };
  }
  return {
    primario: corrente.primario,
    persone: normalizzaNomi([...corrente.persone, aggiunta])
      .filter((n) => n.toLowerCase() !== (corrente.primario ?? "").toLowerCase())
      // Il limite vale sull'elenco completo, non solo sui collaboratori:
      // sotto c'e' gia' il primo nome.
      .slice(0, MAX_PERSONE - 1),
  };
}

// Toglie una persona. Se se ne va il primo nome, il primo collaboratore
// promuove: lasciare `responsabile` vuoto con delle persone in `persone`
// significherebbe una card che mostra una lista ma un progetto "senza
// responsabile", e il calendario/Google perderebbero l'unico nome che leggono.
export function senzaPersona(
  primario: string | null | undefined,
  collaboratori: unknown,
  nome: string
): PersoneComposte {
  const bersaglio = pulisciNome(nome).toLowerCase();
  const corrente = componiPersone(primario, collaboratori);
  if (!bersaglio) return corrente;

  const restano = corrente.persone.filter((n) => n.toLowerCase() !== bersaglio);
  const eraIlPrimo =
    !!corrente.primario && corrente.primario.toLowerCase() === bersaglio;

  if (!eraIlPrimo) {
    return { primario: corrente.primario, persone: restano };
  }
  const [promosso, ...altri] = restano;
  return { primario: promosso ?? null, persone: altri };
}
