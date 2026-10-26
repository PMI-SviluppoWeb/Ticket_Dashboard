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

// ---------------------------------------------------------------------------
// Progetti e calendario
//
// Convenzione date del modulo:
//  - campi di pianificazione (inseriti dall'utente): "YYYY-MM-DDTHH:mm" naive,
//    senza fuso. Round-trip a conversione zero con <input type="datetime-local">,
//    lessicalmente ordinabili, e slice(0,10) e' gia' il giorno locale.
//  - campi di audit (generati dal sistema): ISO 8601 UTC.
// NON mescolare mai queste date con quelle dei ticket (stringhe it-IT non
// ordinabili) in un ORDER BY o in un JOIN.
// ---------------------------------------------------------------------------

export type StatoProgetto =
  | "PIANIFICATO"
  | "IN_CORSO"
  | "IN_PAUSA"
  | "COMPLETATO"
  | "ANNULLATO";

export type StatoAttivita = "DA_FARE" | "IN_CORSO" | "COMPLETATA";

// Origine di un elemento di calendario, derivata dagli id (non e' una colonna).
export type OrigineEvento = "progetto" | "cliente" | "generico";

export interface ProgettoRow {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  cliente_id: string;
  stato: StatoProgetto;
  priorita: Priorita;
  responsabile: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  note: string | null;
  attivo: boolean;
  data_creazione: string;
  data_aggiornamento: string;
}

// Vista di lista: ragione sociale risolta via JOIN + conteggi
export interface ProgettoListRow extends ProgettoRow {
  cliente_ragione_sociale: string;
  num_attivita: number;
  // Sottoinsieme di num_attivita con stato COMPLETATA. Serve alla barra di
  // avanzamento della lista: la percentuale e' derivata, non memorizzata,
  // cosi' non puo' andare fuori sincrono con le attivita' reali.
  // Opzionale perche' questo tipo e' consumato anche da app/calendario, che
  // non ha bisogno della percentuale: il campo resta additivo.
  num_attivita_completate?: number;
  num_ticket: number;
}

export interface Progetto extends ProgettoRow {
  cliente_ragione_sociale: string;
  attivita: AttivitaRow[];
  tickets: TicketRow[];
}

export interface ProgettoInput {
  nome: string;
  descrizione?: string | null;
  cliente_id: string;
  stato?: StatoProgetto;
  priorita?: Priorita;
  responsabile?: string | null;
  data_inizio?: string | null;
  data_fine?: string | null;
  note?: string | null;
}

export interface ProgettoUpdate extends Partial<Omit<ProgettoInput, "cliente_id">> {
  cliente_id?: string;
  attivo?: boolean;
}

export interface AttivitaRow {
  id: string;
  // nullo = evento fuori progetto. progetto_id e cliente_id non possono
  // essere valorizzati entrambi (vincolo applicativo, vedi le rotte API).
  progetto_id: string | null;
  cliente_id: string | null;
  titolo: string;
  descrizione: string | null;
  stato: StatoAttivita;
  priorita: Priorita;
  data_inizio: string | null;
  // La chiave del calendario: senza scadenza l'elemento non compare.
  data_scadenza: string | null;
  data_completamento: string | null;
  assegnatario: string | null;
  data_creazione: string;
  data_aggiornamento: string;
  // Stato della sincronizzazione verso Google Calendar, risolto via LEFT JOIN
  // su attivita_google. Opzionale e additivo: null/assente = mai sincronizzata
  // o sincronizzazione non configurata. Non rompe i componenti esistenti.
  google_stato?: GoogleStato | null;
  google_ultimo_errore?: string | null;
  google_data_sync?: string | null;
}

export interface AttivitaInput {
  progetto_id?: string | null;
  cliente_id?: string | null;
  titolo: string;
  descrizione?: string | null;
  stato?: StatoAttivita;
  priorita?: Priorita;
  data_inizio?: string | null;
  data_scadenza?: string | null;
  assegnatario?: string | null;
}

export type AttivitaUpdate = Partial<Omit<AttivitaInput, "progetto_id">> & {
  progetto_id?: string | null;
};

// Riga denormalizzata restituita dalla query di intervallo del calendario.
export interface AttivitaCalendario extends AttivitaRow {
  progetto_nome: string | null;
  progetto_codice: string | null;
  cliente_ragione_sociale: string | null;
}

// Elemento mostrato in calendario. `tipo` e' il punto di estensione per i
// ticket: oggi vale sempre "attivita".
export interface EventoCalendario extends AttivitaCalendario {
  tipo: "attivita" | "ticket";
}

// ---------------------------------------------------------------------------
// Sincronizzazione Google Calendar (una direzione: App -> Google)
//
// L'app e' l'unica fonte di verita'; Google e' in sola lettura per il team.
// La mappatura origine -> calendario e' configurabile a runtime e vive nella
// tabella `impostazioni`; le credenziali stanno in variabili d'ambiente.
// ---------------------------------------------------------------------------

export type GoogleStato = "PENDENTE" | "SINCRONIZZATO" | "ERRORE" | "DA_CANCELLARE";

export type GoogleModalita = "per_origine" | "unico";

// Riga della tabella attivita_google. La riga sopravvive alla cancellazione
// dell'attivita' quando lo stato e' DA_CANCELLARE: e' il tombstone che
// permette di propagare la cancellazione a Google senza perderla.
export interface AttivitaGoogleRow {
  attivita_id: string;
  calendar_id: string;
  event_id: string;
  stato: GoogleStato;
  tentativi: number;
  ultimo_errore: string | null;
  data_sync: string | null;
  data_creazione: string;
  data_aggiornamento: string;
}

export interface ConfigGoogle {
  abilitato: boolean;
  modalita: GoogleModalita;
  calendario_default: string;
  mappatura: Partial<Record<OrigineEvento, string>>;
  timezone: string;
  finestra_giorni: number;
}

// Conteggi mostrati dalla UI: quante attivita' sono in ciascuno stato.
export interface ConteggiGoogle {
  sincronizzati: number;
  in_errore: number;
  da_cancellare: number;
  mai_sincronizzati: number;
}

export interface ProgettoTicket {
  id: string;
  progetto_id: string;
  ticket_id: string;
  data_creazione: string;
}

export interface ProgettoListResult {
  progetti: ProgettoListRow[];
  totale: number;
  pagina: number;
  paginaSize: number;
}

// ---------------------------------------------------------------------------
// Tempi di lavorazione (cronometro)
//
// Una voce appartiene a UNA cosa sola: attivita' XOR ticket. Nessuno dei due
// vuol dire tempo generico. `fine` nullo = voce in corso, cioe' il cronometro
// che sta correndo in questo momento.
// ---------------------------------------------------------------------------

// Etichetta risolta in lettura: il bersaglio di una voce puo' essere stato
// cancellato dopo la registrazione, e in quel caso il tempo resta valido.
export type TipoVoceTempo = "attivita" | "ticket" | "generico";

export interface VoceTempoRow {
  id: string;
  attivita_id: string | null;
  ticket_id: string | null;
  operatore_id: string;
  operatore: string;
  descrizione: string | null;
  // ISO 8601. Le voci di tempo sono eventi puntuali con fuso: a differenza
  // delle date di pianificazione dei progetti, qui serve l'istante esatto.
  inizio: string;
  // null = in corso.
  fine: string | null;
  data_creazione: string;
  data_aggiornamento: string;
}

// Riga denormalizzata per la UI: titolo del bersaglio risolto via JOIN.
// La durata NON e' memorizzata: si ricava da inizio/fine, cosi' non puo'
// divergere dalle date (la voce in corso non ha una durata finche' non finisce).
export interface VoceTempoEstesa extends VoceTempoRow {
  tipo: TipoVoceTempo;
  bersaglio: string | null;
}

export interface VoceTempoInput {
  attivita_id?: string | null;
  ticket_id?: string | null;
  descrizione?: string | null;
}


export interface EmailInbox {
  id: string;
  message_id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  body_html: string | null;
  ticket_id: string | null;
  stato: "processata" | "errore" | "ignorata";
  data_creazione: string;
}

export type EmailIntent =
  | "technical_issue"
  | "billing_issue"
  | "account_access"
  | "feature_request"
  | "complaint"
  | "question"
  | "other";

export interface EmailClassification {
  intent: EmailIntent;
  priorita: Priorita;
  sommario: string;
  modulo_suggerito: string;
  requiresHumanReview: boolean;
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
