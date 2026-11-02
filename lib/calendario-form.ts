import type {
  AttivitaInput,
  EventoCalendario,
  OrigineEvento,
  Priorita,
  StatoAttivita,
} from "./types";
import { origineEvento } from "./calendario";
import {
  DURATA_DEFAULT_MIN,
  MINUTI_GIORNO,
  diffMinuti,
  inizioFineEvento,
  minutiDelGiorno,
  oraDaMinuti,
  spostaDataOra,
} from "./calendario-griglia";

// ===========================================================================
// Ponte tra EventoCalendario, il form completo e il popover compatto.
// Funzioni pure: niente fetch, niente React.
// ===========================================================================

export interface FormEvento {
  titolo: string;
  descrizione: string;
  progetto_id: string;
  cliente_id: string;
  stato: StatoAttivita;
  priorita: Priorita;
  data_inizio: string;
  data_scadenza: string;
  assegnatario: string;
  etichette: string[];
}

export const EMPTY_FORM: FormEvento = {
  titolo: "",
  descrizione: "",
  progetto_id: "",
  cliente_id: "",
  stato: "DA_FARE",
  priorita: "MEDIA",
  data_inizio: "",
  data_scadenza: "",
  assegnatario: "",
  etichette: [],
};

export function formVuoto(): FormEvento {
  return { ...EMPTY_FORM, etichette: [] };
}

export function formDaEvento(e: EventoCalendario): FormEvento {
  return {
    titolo: e.titolo,
    descrizione: e.descrizione ?? "",
    progetto_id: e.progetto_id ?? "",
    cliente_id: e.cliente_id ?? "",
    stato: e.stato,
    priorita: e.priorita,
    data_inizio: e.data_inizio ?? "",
    data_scadenza: e.data_scadenza ?? "",
    assegnatario: e.assegnatario ?? "",
    etichette: (e.etichette ?? []).map((et) => et.id),
  };
}

// Progetto e cliente sono mutuamente esclusivi nell'API: il progetto vince.
// Il form completo non mostrava progetto_id e quindi lo perdeva a ogni
// salvataggio; ora entrambi gli editor passano da qui.
export function payloadDaForm(f: FormEvento): AttivitaInput {
  const progetto_id = f.progetto_id || null;
  return {
    titolo: f.titolo.trim(),
    descrizione: f.descrizione || null,
    progetto_id,
    cliente_id: progetto_id ? null : f.cliente_id || null,
    stato: f.stato,
    priorita: f.priorita,
    data_inizio: f.data_inizio || null,
    data_scadenza: f.data_scadenza || null,
    assegnatario: f.assegnatario || null,
    etichette: f.etichette,
  };
}

// ---------------------------------------------------------------------------
// Popover compatto
// ---------------------------------------------------------------------------

export interface DatiEventoCompatto {
  titolo: string;
  descrizione: string;
  data: string; // YYYY-MM-DD
  inizio: string; // HH:mm
  fine: string; // HH:mm
  giornoFineSuccessivo: boolean;
  assegnatario: string;
  etichette: string[];
  origine: OrigineEvento;
  progetto_id: string;
  cliente_id: string;
}

export function aggiungiGiornoChiave(chiave: string): string {
  return spostaDataOra(`${chiave}T00:00`, 1440).slice(0, 10);
}

export function naiveDaDataOra(
  data: string,
  ora: string,
  giornoSuccessivo = false
): string {
  return `${giornoSuccessivo ? aggiungiGiornoChiave(data) : data}T${ora.slice(0, 5)}`;
}

// Un evento che finisce dopo la mezzanotte viene compresso nel giorno
// successivo: il popover compatto ha una sola data. Per intervalli piu'
// lunghi si usa «Tutti i dettagli».
export function datiCompattiDaEvento(e: EventoCalendario): DatiEventoCompatto {
  const range = inizioFineEvento(e);
  const inizio = range?.inizio ?? e.data_scadenza ?? "";
  const fine = range?.fine ?? e.data_scadenza ?? "";
  const data = inizio.slice(0, 10);
  const dataFine = fine.slice(0, 10);
  return {
    titolo: e.titolo,
    descrizione: e.descrizione ?? "",
    data,
    inizio: inizio.slice(11, 16),
    fine: fine.slice(11, 16),
    giornoFineSuccessivo: dataFine > data,
    assegnatario: e.assegnatario ?? "",
    etichette: (e.etichette ?? []).map((et) => et.id),
    origine: origineEvento(e),
    progetto_id: e.progetto_id ?? "",
    cliente_id: e.cliente_id ?? "",
  };
}

// Nuovo evento da uno slot: durata di un'ora, senza oltrepassare la mezzanotte
// (la lettura per giorno usa una scadenza entro le 23:59).
export function datiNuoviDaSlot(
  chiave: string,
  minuti: number
): DatiEventoCompatto {
  // Massimo 23:58 di inizio: cosi' la fine resta sempre almeno un minuto
  // dopo, e non si genera mai un "24:00" ne' un intervallo a cavallo di
  // mezzanotte che il popover interpreterebbe come giorno successivo.
  const inizioMin = Math.max(0, Math.min(MINUTI_GIORNO - 2, minuti));
  const fineMin = Math.min(MINUTI_GIORNO - 1, inizioMin + DURATA_DEFAULT_MIN);
  return {
    titolo: "",
    descrizione: "",
    data: chiave,
    inizio: oraDaMinuti(inizioMin),
    fine: oraDaMinuti(fineMin),
    giornoFineSuccessivo: false,
    assegnatario: "",
    etichette: [],
    origine: "generico",
    progetto_id: "",
    cliente_id: "",
  };
}

export function formDaDatiCompatti(
  d: DatiEventoCompatto,
  base: FormEvento
): FormEvento {
  const progetto_id = d.origine === "progetto" ? d.progetto_id : "";
  const cliente_id = d.origine === "cliente" ? d.cliente_id : "";
  return {
    ...base,
    titolo: d.titolo,
    descrizione: d.descrizione,
    progetto_id,
    cliente_id,
    data_inizio: naiveDaDataOra(d.data, d.inizio),
    data_scadenza: naiveDaDataOra(d.data, d.fine, d.giornoFineSuccessivo || d.fine <= d.inizio),
    assegnatario: d.assegnatario,
    etichette: d.etichette,
  };
}

export function datiCompattiDaForm(f: FormEvento): DatiEventoCompatto {
  const dataInizio = f.data_inizio || f.data_scadenza;
  const data = dataInizio.slice(0, 10);
  const inizio = f.data_inizio ? f.data_inizio.slice(11, 16) : "";
  const fine = f.data_scadenza ? f.data_scadenza.slice(11, 16) : "";
  return {
    titolo: f.titolo,
    descrizione: f.descrizione,
    data,
    inizio,
    fine,
    giornoFineSuccessivo: Boolean(
      f.data_scadenza && f.data_scadenza.slice(0, 10) > data
    ),
    assegnatario: f.assegnatario,
    etichette: f.etichette,
    origine: f.progetto_id
      ? "progetto"
      : f.cliente_id
        ? "cliente"
        : "generico",
    progetto_id: f.progetto_id,
    cliente_id: f.cliente_id,
  };
}

// ---------------------------------------------------------------------------
// Utile per l'ordinamento del pannello
// ---------------------------------------------------------------------------

export function minutiInizioEvento(e: EventoCalendario): number {
  const range = inizioFineEvento(e);
  if (!range) return MINUTI_GIORNO;
  return minutiDelGiorno(range.inizio) ?? MINUTI_GIORNO;
}

export function durataEvento(e: EventoCalendario): number {
  const range = inizioFineEvento(e);
  return range ? Math.max(0, diffMinuti(range.fine, range.inizio)) : 0;
}
