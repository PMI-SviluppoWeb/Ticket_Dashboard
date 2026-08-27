export type RuoloMessaggio = "user" | "assistant";

export interface Message {
  id: string;
  ruolo: RuoloMessaggio;
  contenuto: string;
  data_creazione: string;
}

export type Priorita = "BASSA" | "MEDIA" | "ALTA";

export type StatoTicket = "NUOVO" | "IN_CORSO" | "RISOLTO" | "CHIUSO";

export interface TechnicalNote {
  id: string;
  ticket_id: string;
  titolo: string;
  problema: string;
  soluzione: string;
  operatore: string | null;
  data_creazione: string;
}

export interface Ticket {
  id: string;
  numero: string;
  cliente: string;
  contatto: string;
  telefono: string | null;
  email: string | null;
  modulo_software: string;
  sommario_problema: string;
  descrizione_dettagliata: string;
  priorita: Priorita;
  stato: StatoTicket;
  note: string | null;
  operatore: string | null;
  data_creazione: string;
  data_aggiornamento: string;
  data_chiusura: string | null;
  messaggi: Message[];
  note_tecniche: TechnicalNote[];
}

export interface TicketRow {
  id: string;
  numero: string;
  cliente: string;
  contatto: string;
  telefono: string | null;
  email: string | null;
  modulo_software: string;
  sommario_problema: string;
  descrizione_dettagliata: string;
  priorita: Priorita;
  stato: StatoTicket;
  note: string | null;
  operatore: string | null;
  data_creazione: string;
  data_aggiornamento: string;
  data_chiusura: string | null;
}

export interface TicketInput {
  id?: string;
  numero?: string;
  cliente: string;
  contatto: string;
  telefono?: string | null;
  email?: string | null;
  modulo_software: string;
  sommario_problema: string;
  descrizione_dettagliata: string;
  priorita: Priorita;
  note?: string;
  messaggi?: Message[];
}

export interface TicketUpdate {
  stato?: StatoTicket;
  priorita?: Priorita;
  note?: string | null;
  operatore?: string | null;
  contatto?: string;
  telefono?: string | null;
  email?: string | null;
}

export interface Stats {
  totale: number;
  nuovi: number;
  inCorso: number;
  risolti: number;
  chiusi: number;
  prioritaAlta: number;
  prioritaMedia: number;
  prioritaBassa: number;
  aperti: number;
}

export interface TicketListResult {
  tickets: TicketRow[];
  totale: number;
  pagina: number;
  paginaSize: number;
}

export interface KnowledgeDocRow {
  id: string;
  nome_file: string;
  dimensione: number;
  pagine: number | null;
  data_creazione: string;
}

export interface KnowledgeDoc extends KnowledgeDocRow {
  testo: string;
}

export interface KnowledgeDocInput {
  nome_file: string;
  dimensione: number;
  pagine: number | null;
  testo: string;
}
