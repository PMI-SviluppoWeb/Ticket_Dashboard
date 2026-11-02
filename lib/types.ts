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

// Riga di una LISTA. I due testi lunghi restano fuori: nessuna tabella li
// mostra, e possono essere di migliaia di caratteri per riga — su una pagina da
// 25 risultati sono decine di kB trasportati per niente. Il dettaglio
// (`getTicket`) continua a leggerli.
export type TicketListRow = Omit<TicketRow, "descrizione_dettagliata" | "note">;

export interface TicketListResult {
  tickets: TicketListRow[];
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

// Etichetta personalizzata del calendario. Il colore e' un hex libero
// ("#RRGGBB") scelto dall'utente.
export interface Etichetta {
  id: string;
  nome: string;
  colore: string;
  data_creazione: string;
}

export interface ProgettoRow {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  cliente_id: string;
  stato: StatoProgetto;
  priorita: Priorita;
  responsabile: string | null;
  // Collaboratori OLTRE al responsabile. Sempre un array (il data layer
  // decodifica la colonna JSON), mai la stringa grezza.
  persone: string[];
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
  // Riga di lista: il progetto mostra numero/cliente/sommario, non i testi
  // lunghi del ticket (che arrivano solo aprendo il dettaglio).
  tickets: TicketListRow[];
}

export interface ProgettoInput {
  nome: string;
  descrizione?: string | null;
  cliente_id: string;
  stato?: StatoProgetto;
  priorita?: Priorita;
  responsabile?: string | null;
  // Solo i collaboratori: il responsabile ha il suo campo. Passare qui anche
  // il responsabile non lo duplica (lib/persone.ts lo toglie).
  persone?: string[];
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
  // Collaboratori OLTRE all'assegnatario. Sempre un array (il data layer
  // decodifica la colonna JSON).
  persone: string[];
  data_creazione: string;
  data_aggiornamento: string;
  // Stato della sincronizzazione verso Google Calendar, risolto via LEFT JOIN
  // su attivita_google. Opzionale e additivo: null/assente = mai sincronizzata
  // o sincronizzazione non configurata. Non rompe i componenti esistenti.
  google_stato?: GoogleStato | null;
  google_ultimo_errore?: string | null;
  google_data_sync?: string | null;
  // Etichette personalizzate assegnate (risolte via JOIN). Opzionale e
  // additivo: assente = nessuna etichetta o lettura che non le richiede.
  etichette?: Etichetta[];
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
  // Solo i collaboratori: l'assegnatario ha il suo campo (lib/persone.ts
  // toglie un eventuale doppione).
  persone?: string[];
  // Id delle etichette da assegnare (sostituisce l'intero set).
  etichette?: string[];
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

// ---------------------------------------------------------------------------
// Home: sintesi, agenda e lavoro personale.
//
// Un solo endpoint (`/api/dashboard`) e un solo `batchRead` alimentano tutta la
// fascia sopra la tabella ticket. I tipi qui sotto sono PROIEZIONI snelle: non
// estendono `EventoCalendario`/`ProgettoListRow`, perche' la home non mostra
// descrizioni, note ne' lo stato della sincronizzazione Google, e trasportarli
// costerebbe payload a ogni poll.
//
// `mia` e `in_ritardo` arrivano calcolati dal server: il browser non deve
// confrontare le proprie date con le stringhe naive di `data_scadenza`, che
// darebbero un risultato diverso per un utente in un altro fuso.
// ---------------------------------------------------------------------------

export interface TempoDashboard {
  minuti_oggi: number;
  minuti_settimana: number;
}

export interface DashboardSintesi {
  ticket: {
    miei: { aperti: number; nuovi: number; in_corso: number };
    tutti: { aperti: number; nuovi: number; in_corso: number; da_prendere: number };
  };
  task_miei: { in_scadenza: number; in_ritardo: number };
  progetti_attivi: number;
  tempo: { mio: TempoDashboard; tutti: TempoDashboard };
}

export interface EventoAgendaDashboard {
  id: string;
  titolo: string;
  stato: StatoAttivita;
  priorita: Priorita;
  // "YYYY-MM-DDTHH:mm" dell'ora di Roma, come tutte le scadenze delle attivita'.
  data_scadenza: string;
  assegnatario: string | null;
  progetto_id: string | null;
  cliente_id: string | null;
  progetto_nome: string | null;
  progetto_codice: string | null;
  cliente_ragione_sociale: string | null;
  mia: boolean;
  in_ritardo: boolean;
  // Etichette personalizzate (opzionale: la home puo' non richiederle).
  etichette?: Etichetta[];
}

export interface TaskScadenzaDashboard {
  id: string;
  titolo: string;
  stato: StatoAttivita;
  priorita: Priorita;
  data_scadenza: string;
  assegnatario: string | null;
  progetto_id: string | null;
  progetto_nome: string | null;
  progetto_codice: string | null;
  cliente_ragione_sociale: string | null;
  in_ritardo: boolean;
}

export interface ProgettoDashboard {
  id: string;
  codice: string;
  nome: string;
  stato: StatoProgetto;
  data_fine: string | null;
  cliente_ragione_sociale: string;
  num_attivita: number;
  num_attivita_completate: number;
  num_ticket: number;
}

export interface VoceApertaDashboard {
  operatore_id: string;
  operatore: string;
  inizio: string;
  // Minuti maturati fino al momento della query. Il client vi somma il
  // cronometro che scorre, cosi' il numero mostrato non dipende dall'orologio
  // del browser ne' dal fuso della macchina server.
  minuti_finora: number;
  tipo: TipoVoceTempo;
  bersaglio: string | null;
}

export interface DashboardData {
  operatore: { id: string; nome: string; ruolo: "admin" | "operatore" };
  // ISO: mostrato come "aggiornato alle HH:mm" e usato per delimitare il poll.
  generato_il: string;
  sintesi: DashboardSintesi;
  agenda: EventoAgendaDashboard[];
  mie_task: TaskScadenzaDashboard[];
  progetti: ProgettoDashboard[];
  // Vuoto per i non admin: l'elenco nomina i colleghi e cosa stanno facendo,
  // informazione che il resto dell'app riserva agli amministratori
  // (`/api/operatori/stats`).
  in_corso_ora: VoceApertaDashboard[];
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
