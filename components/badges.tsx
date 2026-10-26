import type { GoogleStato, Priorita, StatoAttivita, StatoProgetto, StatoTicket } from "@/lib/types";

// ===========================================================================
// Chip di stato — la spina dorsale cromatica dell'app.
//
// Importato da 6+ file (TicketTable, TicketPage, calendario, admin/dashboard,
// progetti, ProgettoPage), quindi ogni modifica qui si propaga ovunque.
//
// Le tinte vivono in tailwind.config.ts come famiglie semantiche
// (stato.urgenza / attesa / ok / info / malva / neutro), ognuna con fondo,
// testo e bordo. Qui si mappa soltanto il dominio sui ruoli: il colore
// significa una cosa sola in tutta l'app.
//
// La regola che tiene insieme la palette: il colore dice quanto pesa una cosa,
// non quanto e' bella. Rosso = richiede attenzione, peach = in attesa,
// salvia = risolto, malva = qualcuno ci sta lavorando, grigio = nessuna
// urgenza. Nessuna tinta viene usata come decorazione.
// ===========================================================================

// Struttura di un chip: fondo + testo + contorno.
// Il contorno non e' cosmetico: questi fondi stanno a 1,32-1,43:1 dalla crema,
// quindi senza bordo il chip non si stacca dalla pagina.
//
// Le taglie sono un'enumerazione chiusa, non un parametro libero di classi
// extra. Il motivo e' che in Tailwind l'ordine di vittoria lo decide il foglio
// di stile, non l'ordine nell'attributo `class`: passare `text-xs` a un chip che
// ha gia' `text-[10px]` darebbe un risultato deciso a monte e imprevedibile qui.
// Se serve una taglia nuova, si aggiunge qui e vale per tutta l'app.
//
// I quattro gradini esistevano gia' sparsi nel codice: xs per i chip dentro una
// tabella fitta (notifiche), sm per i chip di stato del kit, md per le etichette
// lunghe dei progetti ("Pianificato", "Completato" — a 10px si stringono), lg
// per i chip composti a mano che portano puntino o prefisso.
const CHIP_TAGLIE = {
  xs: "gap-1 px-1.5 py-0.5 text-[10px]",
  sm: "gap-1 px-2 py-0.5 text-[10px]",
  md: "gap-1 px-2 py-0.5 text-[11px]",
  lg: "gap-1.5 px-2.5 py-0.5 text-xs",
} as const;

// `gap` e' innocuo sui chip di solo testo (un figlio solo non ha nulla con cui
// spaziare) e serve dove il chip porta anche un puntino o un'icona.
export type ChipTaglia = keyof typeof CHIP_TAGLIE;

// Il peso si sceglie fra due valori, non liberamente: "medio" e' per i chip
// dentro una tabella fitta, dove il grassetto li farebbe gridare tutti insieme;
// "forte" e' il default per i chip di stato, che devono reggere da soli.
const CHIP_PESI = { medio: "font-medium", forte: "font-semibold" } as const;

export type ChipPeso = keyof typeof CHIP_PESI;

// Ricetta completa di un chip: struttura + taglia + peso + colore.
//
// Esiste perche' i colori (URGENZA, STATUS_STYLES, ...) contengono SOLO fondo,
// testo e bordo: `border-<colore>` da solo non disegna nulla, perche' la
// larghezza del bordo resta 0 finche' non arriva `border`. Comporre un chip a
// mano unendo un colore del kit a classi scritte a memoria produce quindi un
// chip senza padding e senza contorno — ed e' esattamente quello che succedeva
// in 9 punti dell'app prima che questo compositore esistesse.
export function chip(
  colore: string,
  opzioni: { taglia?: ChipTaglia; peso?: ChipPeso } = {},
): string {
  const { taglia = "sm", peso = "forte" } = opzioni;
  return `inline-flex items-center rounded-full border ${CHIP_TAGLIE[taglia]} ${CHIP_PESI[peso]} ${colore}`;
}

// Chip di stato del kit: taglia e peso di default.
const CHIP = chip("");

export const URGENZA = "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo";
export const ATTESA = "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo";
export const OK = "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo";
export const INFO = "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo";
export const MALVA = "border-stato-malva-bordo bg-stato-malva-bg text-stato-malva-testo";
export const NEUTRO = "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo";

export const PRIORITY_STYLES: Record<Priorita, string> = {
  ALTA: URGENZA,
  MEDIA: ATTESA,
  BASSA: OK,
};

export const STATUS_STYLES: Record<StatoTicket, string> = {
  NUOVO: INFO,
  IN_CORSO: MALVA,
  RISOLTO: OK,
  CHIUSO: NEUTRO,
};

export const PRIORITY_LABELS: Record<Priorita, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BASSA: "Bassa",
};

// Le etichette di stato sono quelle che l'utente legge nella dashboard, in
// italiano e senza underscore. "IN_CORSO" e' il valore di dominio, non una
// parola da mostrare.
export const STATUS_LABELS: Record<StatoTicket, string> = {
  NUOVO: "Nuovo",
  IN_CORSO: "In corso",
  RISOLTO: "Risolto",
  CHIUSO: "Chiuso",
};

export function PriorityBadge({ priorita }: { priorita: Priorita }) {
  return (
    <span className={`${CHIP} ${PRIORITY_STYLES[priorita]}`}>
      {PRIORITY_LABELS[priorita]}
    </span>
  );
}

export function StatusBadge({ stato }: { stato: StatoTicket }) {
  return (
    <span className={`${CHIP} ${STATUS_STYLES[stato]}`}>
      {STATUS_LABELS[stato]}
    </span>
  );
}

export const PROJECT_STATUS_STYLES: Record<StatoProgetto, string> = {
  PIANIFICATO: NEUTRO,
  IN_CORSO: INFO,
  IN_PAUSA: ATTESA,
  COMPLETATO: OK,
  ANNULLATO: URGENZA,
};

// Variante per fondo scuro (#232323), usata solo dalla card in evidenza della
// lista progetti. Tinte traslucide + testo chiaro: il colore continua a
// significare lo stato, ma senza il blocco chiaro pieno che su inchiostro
// risulterebbe accecante.
//
// Queste quattro voci restano volutamente su tinte Tailwind crude: le famiglie
// `stato.*` hanno il TESTO SCURO, tarato per fondi chiari, e su inchiostro
// darebbero nero su nero. Verificato col fondo traslucido composto sul nero:
// 9.07 / 8.86 / 9.16 / 9.32 : 1 contro la soglia 4.5:1. Non "normalizzarle"
// sui token semantici senza rimisurare.
export const PROJECT_STATUS_STYLES_SCURO: Record<StatoProgetto, string> = {
  PIANIFICATO: "bg-white/10 text-white/75 border-white/15",
  IN_CORSO: "bg-blue-400/20 text-blue-100 border-blue-300/25",
  IN_PAUSA: "bg-amber-400/20 text-amber-100 border-amber-300/25",
  COMPLETATO: "bg-emerald-400/20 text-emerald-100 border-emerald-300/25",
  ANNULLATO: "bg-red-400/20 text-red-100 border-red-300/25",
};

export const ACTIVITY_STATUS_STYLES: Record<StatoAttivita, string> = {
  DA_FARE: NEUTRO,
  IN_CORSO: MALVA,
  COMPLETATA: OK,
};

export const PROJECT_STATUS_LABELS: Record<StatoProgetto, string> = {
  PIANIFICATO: "Pianificato",
  IN_CORSO: "In corso",
  IN_PAUSA: "In pausa",
  COMPLETATO: "Completato",
  ANNULLATO: "Annullato",
};

export const ACTIVITY_STATUS_LABELS: Record<StatoAttivita, string> = {
  DA_FARE: "Da fare",
  IN_CORSO: "In corso",
  COMPLETATA: "Completata",
};

export function ProgettoStatusBadge({
  stato,
  scuro = false,
}: {
  stato: StatoProgetto;
  // Variante per la card scura della lista progetti (fondo #232323).
  // Su fondo scuro i badge normali (fondo chiaro pieno) sono blocchi chiari
  // accecanti: qui si usano tinte traslucide con testo chiaro, che
  // mantengono il significato del colore senza il pieno.
  // Questo componente e' esclusivo della sezione Progetti, quindi estenderlo
  // non ha effetti altrove. PriorityBadge, che e' condiviso con dashboard,
  // calendario e ticket, NON ha questa variante.
  scuro?: boolean;
}) {
  const stile = scuro ? PROJECT_STATUS_STYLES_SCURO[stato] : PROJECT_STATUS_STYLES[stato];
  return <span className={chip(stile, { taglia: "md" })}>{PROJECT_STATUS_LABELS[stato]}</span>;
}

export function AttivitaStatusBadge({ stato }: { stato: StatoAttivita }) {
  return (
    <span className={`${CHIP} ${ACTIVITY_STATUS_STYLES[stato]}`}>
      {ACTIVITY_STATUS_LABELS[stato]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stato della sincronizzazione Google Calendar
// ---------------------------------------------------------------------------

export const GOOGLE_STYLES: Record<GoogleStato, string> = {
  SINCRONIZZATO: OK,
  ERRORE: URGENZA,
  PENDENTE: ATTESA,
  DA_CANCELLARE: ATTESA,
};

export const GOOGLE_LABELS: Record<GoogleStato, string> = {
  SINCRONIZZATO: "Google",
  ERRORE: "Errore Google",
  PENDENTE: "Da sincronizzare",
  DA_CANCELLARE: "Da rimuovere",
};

// Non renderizzato quando lo stato e' assente: un'attivita' senza scadenza o
// con sincronizzazione non configurata non deve mostrare un badge inutile.
export function GoogleSyncBadge({
  stato,
  ultimoErrore,
  dataSync,
}: {
  stato: GoogleStato | null | undefined;
  ultimoErrore?: string | null;
  dataSync?: string | null;
}) {
  // Il badge esiste solo quando c'e' qualcosa da dire.
  if (!stato) return null;

  const title =
    stato === "ERRORE"
      ? (ultimoErrore ?? "Errore di sincronizzazione.")
      : stato === "SINCRONIZZATO" && dataSync
        ? `Sincronizzato su Google il ${new Date(dataSync).toLocaleString("it-IT")}`
        : GOOGLE_LABELS[stato];

  return (
    <span title={title} className={`${CHIP} ${GOOGLE_STYLES[stato]}`}>
      {GOOGLE_LABELS[stato]}
    </span>
  );
}
