import type {
  AttivitaRow,
  EventoCalendario,
  OrigineEvento,
} from "./types";

// Funzioni pure di supporto al calendario: nessun accesso al DB, nessuna
// libreria di date. Tutto con Date nativo.

export type VistaCalendario = "mese" | "settimana" | "agenda";

export const VISTE: { id: VistaCalendario; label: string }[] = [
  { id: "mese", label: "Mese" },
  { id: "settimana", label: "Settimana" },
  { id: "agenda", label: "Agenda" },
];

// Formato dei campi di pianificazione: "YYYY-MM-DDTHH:mm" (datetime-local).
export const RE_DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Chiave di raggruppamento LOCALE. Non usare toISOString().slice(0,10):
// convertirebbe in UTC e sposterebbe le scadenze serali al giorno successivo.
export function chiaveGiorno(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daChiaveGiorno(k: string): Date {
  const [y, m, g] = k.split("-").map((v) => parseInt(v, 10));
  return new Date(y, (m ?? 1) - 1, g ?? 1);
}

// Griglia del mese: sempre 42 celle (6 settimane), con la settimana che
// inizia di lunedi'. getDay() da' 0=domenica, da cui l'offset.
export function grigliaMese(anchor: Date): Date[] {
  const primo = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (primo.getDay() + 6) % 7; // 0 = lunedi', 6 = domenica
  const inizio = new Date(primo.getFullYear(), primo.getMonth(), 1 - offset);
  const celle: Date[] = [];
  for (let i = 0; i < 42; i++) {
    // Costruzione da componenti, MAI somma di millisecondi: l'ora legale
    // renderebbe i giorni di 23 o 25 ore.
    celle.push(new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() + i));
  }
  return celle;
}

export function inizioSettimana(d: Date): Date {
  const g = (d.getDay() + 6) % 7; // 0 = lunedi'
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - g);
}

export function giorniSettimana(d: Date): Date[] {
  const lun = inizioSettimana(d);
  const giorni: Date[] = [];
  for (let i = 0; i < 7; i++) {
    giorni.push(new Date(lun.getFullYear(), lun.getMonth(), lun.getDate() + i));
  }
  return giorni;
}

function inizioGiorno(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function fineGiorno(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Intervallo da chiedere all'API per la vista corrente. I confini sono
// calcolati in ora locale e formattati come datetime-local: poiche' il
// formato e' naive, il confronto SQL coincide con la finestra locale.
export function rangeVista(
  vista: VistaCalendario,
  anchor: Date
): { dal: string; al: string } {
  let primo: Date;
  let ultimo: Date;

  if (vista === "mese") {
    const celle = grigliaMese(anchor);
    primo = celle[0];
    ultimo = celle[41];
  } else if (vista === "settimana") {
    const giorni = giorniSettimana(anchor);
    primo = giorni[0];
    ultimo = giorni[6];
  } else {
    primo = anchor;
    ultimo = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 29);
  }

  return {
    dal: `${chiaveGiorno(primo)}T00:00`,
    al: `${chiaveGiorno(ultimo)}T23:59`,
  };
}

export function formatDataOra(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatData(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatOra(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// "YYYY-MM-DDTHH:mm" -> valore per <input type="datetime-local">
export function perInputDateTime(v: string | null | undefined): string {
  if (!v) return "";
  return v.slice(0, 16);
}

// Valore di <input type="datetime-local"> -> "YYYY-MM-DDTHH:mm"
export function daInputDateTime(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return RE_DATETIME_LOCAL.test(t) ? t : null;
}

// Origine di un elemento: determina il colore in calendario.
export function origineEvento(
  a: Pick<AttivitaRow, "progetto_id" | "cliente_id">
): OrigineEvento {
  if (a.progetto_id) return "progetto";
  if (a.cliente_id) return "cliente";
  return "generico";
}

// Tinta per ORIGINE dell'evento. E' l'unico posto del calendario in cui il
// colore distingue una CATEGORIA (non un peso o uno stato), quindi ogni
// origine deve restare su una famiglia diversa: collassarne due sullo stesso
// token perderebbe l'informazione della legenda.
//
// Assegnate per affinita' semantica con i ruoli delle famiglie:
//   progetto -> info (ticket NUOVO / progetto IN_CORSO: lavoro in corso)
//   cliente  -> ok   (evento concordato, nessuna criticita')
//   generico -> neutro (nessuna categoria: e' il valore di riposo)
// Le tre famiglie hanno fondo, testo e bordo distinti anche a colpo d'occhio.
export const ORIGINE_STYLES: Record<OrigineEvento, string> = {
  progetto: "bg-stato-info-bg text-stato-info-testo border-stato-info-bordo",
  cliente: "bg-stato-ok-bg text-stato-ok-testo border-stato-ok-bordo",
  generico: "bg-stato-neutro-bg text-stato-neutro-testo border-stato-neutro-bordo",
};

export const ORIGINE_LABELS: Record<OrigineEvento, string> = {
  progetto: "Attività di progetto",
  cliente: "Evento con cliente",
  generico: "Evento generico",
};

export function etichettaOrigine(e: EventoCalendario): string {
  if (e.progetto_nome) return e.progetto_nome;
  if (e.cliente_ragione_sociale) return e.cliente_ragione_sociale;
  return "Generico";
}

// Raggruppa per giorno locale. E' l'unico punto in cui gli eventi vengono
// indicizzati per data: la vista agenda e le griglie leggono tutte da qui.
export function raggruppaPerGiorno(
  eventi: EventoCalendario[]
): Map<string, EventoCalendario[]> {
  const mappa = new Map<string, EventoCalendario[]>();
  for (const e of eventi) {
    if (!e.data_scadenza) continue;
    const d = new Date(e.data_scadenza);
    if (isNaN(d.getTime())) continue;
    const k = chiaveGiorno(d);
    const lista = mappa.get(k);
    if (lista) lista.push(e);
    else mappa.set(k, [e]);
  }
  // Ordinamento cronologico dentro il giorno.
  Array.from(mappa.values()).forEach((lista) => {
    lista.sort((a: EventoCalendario, b: EventoCalendario) =>
      (a.data_scadenza ?? "").localeCompare(b.data_scadenza ?? "")
    );
  });
  return mappa;
}

// Chiavi ordinate: l'ordinamento di stringhe "YYYY-MM-DD" e' cronologico.
export function giorniOrdinati(mappa: Map<string, EventoCalendario[]>): string[] {
  return Array.from(mappa.keys()).sort();
}

export function etichettaGiorno(k: string): string {
  const d = daChiaveGiorno(k);
  const oggi = new Date();
  const chiaveOggi = chiaveGiorno(oggi);
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);
  if (k === chiaveOggi) return "Oggi";
  if (k === chiaveGiorno(domani)) return "Domani";
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function etichettaPeriodo(vista: VistaCalendario, anchor: Date): string {
  if (vista === "mese") {
    const s = anchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (vista === "settimana") {
    const g = giorniSettimana(anchor);
    return `${formatData(chiaveGiorno(g[0]))} – ${formatData(chiaveGiorno(g[6]))}`;
  }
  const fine = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 29);
  return `Dal ${formatData(chiaveGiorno(anchor))} al ${formatData(chiaveGiorno(fine))}`;
}

export function spostaAnchor(vista: VistaCalendario, anchor: Date, passo: number): Date {
  if (vista === "mese") {
    return new Date(anchor.getFullYear(), anchor.getMonth() + passo, 1);
  }
  if (vista === "settimana") {
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + passo * 7);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + passo * 30);
}
