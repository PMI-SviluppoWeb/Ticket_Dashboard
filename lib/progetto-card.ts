import type { ProgettoListRow } from "./types";

// ===========================================================================
// Dati di presentazione delle card della lista Progetti.
//
// Modulo PURO: nessun accesso al database, nessun import di server-only.
// Il motivo e' concreto: app/progetti/page.tsx e' un Client Component
// ("use client"), e importare lib/progetti.ts (che a sua volta importa
// lib/db.ts -> "server-only") farebbe lanciare "This module cannot be imported
// from a Client Component module" a runtime. La logica di visualizzazione sta
// quindi in un file che il browser puo' importare.
// ===========================================================================

export type TintaCard = "bianco" | "peach" | "peachTenue" | "salvia";

export interface ProgettoCardMeta {
  id: string;
  // null (non 0) quando il progetto non ha attivita': "niente da fare" non e'
  // "0% fatto", e una barra vuota direbbe la cosa sbagliata.
  percentuale: number | null;
  completate: number;
  totali: number;
  tinta: TintaCard;
  inEvidenza: boolean;
}

// Rotazione a 4 tinte: il bianco fa parte della rotazione, come nel mockup.
// Le due tinte piu' sature (peach, salvia) reggono da sole, senza contorno;
// le due quasi indistinguibili dal fondo (bianco a 1.081:1, peachTenue a
// 1.018:1) ne hanno bisogno. Vedi CONTORNO_TINTA.
export const TINTE_CARD: TintaCard[] = ["bianco", "peach", "peachTenue", "salvia"];

// Tinta assegnata dall'ID, non dall'indice di rendering.
//
// La lista e' paginata lato server (PAGE_SIZE = 20, ORDER BY
// data_aggiornamento DESC): con l'indice, cambiando pagina o filtro il colore
// di un progetto cambierebbe. Con l'hash l'identita' visiva e' stabile.
//
// Somma dei codici carattere: distribuzione piu' che sufficiente per 4
// secchielli, e nessuna dipendenza da librerie di hashing.
export function hashTinta(id: string, n: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % n;
  return h;
}

// "YYYY-MM-DDTHH:mm" dell'ora LOCALE, nello stesso formato naive di data_fine.
//
// Perche' non toISOString(): quella e' UTC, quindi a Roma (UTC+1/+2) un
// progetto che scade fra un'ora risulterebbe gia' scaduto e la card in
// evidenza finirebbe sul progetto sbagliato. I getter locali danno l'ora da
// parete, l'unica comparabile con data_fine.
export function adessoNaive(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Percentuale di completamento, o null se non c'e' nulla da completare.
// La divisione per zero e' esclusa dal ramo: non serve un guard separato.
export function percentualeCompletamento(
  totali: number,
  completate: number
): number | null {
  if (totali <= 0) return null;
  return Math.round((completate / totali) * 100);
}

export function metaCardProgetti(progetti: ProgettoListRow[]): ProgettoCardMeta[] {
  const adesso = adessoNaive();

  // La card in evidenza e' il progetto che scade prima NEL FUTURO.
  // Confronto lessicografico: data_fine e' a larghezza fissa "YYYY-MM-DDTHH:mm",
  // quindi l'ordine alfabetico coincide con quello cronologico (stessa
  // proprieta' su cui si appoggia listEventiCalendario in lib/attivita.ts).
  //
  // Casi limite: data_fine nulla -> esclusa dal filtro; data passata ->
  // esclusa (la card scura segnala "il prossimo che scade", non uno gia'
  // scaduto); nessun progetto futuro -> nessuna card scura, la griglia
  // resta integra; pareggio -> sort stabile, vince il primo nell'ordine
  // della query.
  const inEvidenza = progetti
    .filter((p) => p.data_fine && p.data_fine >= adesso)
    .sort((a, b) => (a.data_fine ?? "").localeCompare(b.data_fine ?? ""))[0]?.id;

  return progetti.map((p) => {
    const totali = p.num_attivita ?? 0;
    const completate = p.num_attivita_completate ?? 0;
    return {
      id: p.id,
      percentuale: percentualeCompletamento(totali, completate),
      completate,
      totali,
      tinta: TINTE_CARD[hashTinta(p.id, TINTE_CARD.length)],
      inEvidenza: p.id === inEvidenza,
    };
  });
}

// ---------------------------------------------------------------------------
// Mappe di stile delle card
// ---------------------------------------------------------------------------

// Superficie della card. Le due tinte tenui portano un contorno, perche' da
// sole sarebbero invisibili sul fondo crema:
//   #FFFFFF su #F8F6F0 = 1.081:1   (sotto la soglia di percezione)
//   #FDF3E1 su #F8F6F0 = 1.018:1
// Le due piu' sature no:
//   #FDE8C4 su #F8F6F0 = 1.109:1   #DCEEE2 = 1.119:1
// Il contorno #E3DFD3 separa 1.233:1 dal fondo, quello interno #EDEAE0 solo
// 1.114:1 e non basterebbe.
export const SUPERFICIE_CARD: Record<TintaCard, string> = {
  bianco: "bg-white ring-1 ring-crema-contorno",
  peach: "bg-peach",
  peachTenue: "bg-peach-tenue ring-1 ring-crema-contorno",
  salvia: "bg-salvia",
};

// Card in evidenza: inchiostro pieno, senza contorno. Si distingue per
// luminanza (14.5:1 dal fondo), non per tinta, quindi non serve un contorno.
export const SUPERFICIE_CARD_SCURA = "bg-inchiostro text-white";

export const TESTO_CARD: Record<TintaCard, string> = {
  bianco: "text-inchiostro",
  peach: "text-inchiostro",
  peachTenue: "text-inchiostro",
  salvia: "text-inchiostro",
};

// Colore del testo attenuato, tarato per superficie.
// Il grigio caldo deve restare leggibile su ognuna: #5C5A55 misura 5.70:1
// sulla salvia (la superficie peggiore) e 6.89:1 sul bianco.
export const TESTO_TENUE_CARD: Record<TintaCard, string> = {
  bianco: "text-caldo-testo",
  peach: "text-caldo-testo",
  peachTenue: "text-caldo-testo",
  salvia: "text-caldo-testo",
};

// Traccia della barra di avanzamento: scura al 10% sulle card chiare,
// bianca al 15% sulla card scura. NON usare un grigio scuro sulla card scura:
// #3A3A3A su #232323 misura 1.38:1 e la barra sparirebbe.
export const TRACCIA_CARD = "bg-inchiostro/10";
export const TRACCIA_CARD_SCURA = "bg-white/15";

// Riempimento della barra di avanzamento.
//
// La tinta vive in tailwind.config.ts come `avanzamento` (#047857): il colore
// e' lo stesso di prima (era emerald-700 scritto a mano), ma ora ha un nome di
// ruolo come tutto il resto del sistema. Il confine fra riempimento e traccia
// e' un elemento grafico e deve battere 3:1.
//
// Perche' non un emerald piu' chiaro: misurato contro la traccia (inchiostro al
// 10% composto sulla tinta della card), emerald-600 sta a 3.10 sul bianco ma
// crolla a 2.60 sul peach e 2.59 sulla salvia, cioe' la barra si distingue a
// malapena. #047857 misura 4.52 / 3.78 / 4.11 / 3.77 sulle quattro tinte:
// passa ovunque.
export const RIEMPIMENTO_CARD = "bg-avanzamento";
export const RIEMPIMENTO_CARD_SCURA = "bg-avanzamento-scuro";