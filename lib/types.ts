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
  allegati: Allegato[];
}

export interface Allegato {
  id: string;
  note_tecnica_id: string;
  ticket_id: string;
  nome_file: string;
  nome_originale: string;
  dimensione: number;
  tipo_mime: string;
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
  data_inizio_lavoro: string | null;
  tempo_stimato_minuti: number | null;
  tempo_effettivo_minuti: number | null;
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
  data_inizio_lavoro: string | null;
  tempo_stimato_minuti: number | null;
  tempo_effettivo_minuti: number | null;
}

export interface TicketInput {
  id?: string;
  numero?: string;
  cliente: string;
  contatto: string;
  telefono?: string | null;
  email: string;
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
  cliente?: string;
  contatto?: string;
  telefono?: string | null;
  email?: string | null;
  tempo_effettivo_minuti?: number | null;
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

export interface KnowledgeLink {
  url: string;
  title: string;
}

export interface KnowledgeDocRow {
  id: string;
  nome_file: string;
  dimensione: number;
  pagine: number | null;
  links: KnowledgeLink[];
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
  links?: KnowledgeLink[];
}

export interface KnowledgeLinkItem {
  id: string;
  titolo: string;
  url: string;
  descrizione: string | null;
  categoria: string;
  data_creazione: string;
}

export interface KnowledgeLinkInput {
  titolo: string;
  url: string;
  descrizione?: string | null;
  categoria?: string;
}

export interface Operator {
  id: string;
  nome: string;
  email: string;
  ruolo: "admin" | "operatore";
  attivo: boolean;
  data_creazione: string;
  ultimo_accesso: string | null;
}

export interface OperatorInput {
  nome: string;
  email: string;
  password: string;
  ruolo?: "admin" | "operatore";
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface Articolo {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  categoria: string | null;
  prezzo: number | null;
  unita_misura: string;
  attivo: boolean;
  data_creazione: string;
}

export interface ArticoloInput {
  codice: string;
  nome: string;
  descrizione?: string | null;
  categoria?: string | null;
  prezzo?: number | null;
  unita_misura?: string;
}

export interface Cliente {
  id: string;
  ragione_sociale: string;
  nome_contatto: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  citta: string | null;
  provincia: string | null;
  cap: string | null;
  partita_iva: string | null;
  note: string | null;
  attivo: boolean;
  data_creazione: string;
}

export interface ClienteInput {
  ragione_sociale: string;
  nome_contatto?: string | null;
  email?: string | null;
  telefono?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  provincia?: string | null;
  cap?: string | null;
  partita_iva?: string | null;
  note?: string | null;
}

export type EmailTipo = "nuovo_ticket" | "assegnazione" | "nuova_nota" | "chiusura" | "manuale";

export interface EmailLog {
  id: string;
  ticket_id: string;
  tipo: EmailTipo;
  destinatario: string;
  oggetto: string;
  corpo: string;
  stato: "inviata" | "errore";
  errore: string | null;
  data_creazione: string;
}
