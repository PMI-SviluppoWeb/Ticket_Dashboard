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
  // Colonne strutturate (Fase 1): affiancano i campi testuali storici.
  operatore_id?: string | null;
  cliente_id?: string | null;
  creato_il?: string | null;
  aggiornato_il?: string | null;
  chiuso_il?: string | null;
  preso_in_carico_il?: string | null;
  canale?: string;
  eliminato_il?: string | null;
  // Calcolata lato server dalla configurazione SLA.
  sla_evidenza?: "scaduto" | "in_scadenza" | null;
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
  operatore_id?: string | null;
  cliente_id?: string | null;
  creato_il?: string | null;
  aggiornato_il?: string | null;
  chiuso_il?: string | null;
  preso_in_carico_il?: string | null;
  canale?: string;
  eliminato_il?: string | null;
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
  // Messaggi iniziali: l'id e' opzionale (lo genera il server se assente).
  messaggi?: Array<
    Pick<Message, "ruolo" | "contenuto"> & { id?: string; data_creazione?: string }
  >;
  // Fase 1: canale di origine e collegamenti strutturati.
  canale?: "manuale" | "email" | "whatsapp" | "telefono";
  operatore_id?: string | null;
  cliente_id?: string | null;
  creato_il?: string;
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
export type TicketListRow = Omit<TicketRow, "descrizione_dettagliata" | "note"> & {
  sla_evidenza?: "scaduto" | "in_scadenza" | null;
};

export interface TicketListResult {
  tickets: TicketListRow[];
  totale: number;
  pagina: number;
  paginaSize: number;
}

// ---------------------------------------------------------------------------
// Rapportini di chiusura
// ---------------------------------------------------------------------------

export type StatoRapportino = "bozza" | "confermato" | "esportato" | "errore";

// Dettaglio ore per operatore (snapshot al momento della generazione).
export interface RapportinoVoce {
  operatore: string;
  minuti: number;
  voci: number;
}

export interface Rapportino {
  id: string;
  ticket_id: string;
  cliente_id: string | null;
  numero: string;
  stato: StatoRapportino;
  data_creazione: string;
  data_aggiornamento: string;
  data_chiusura: string | null;
  operatore_id: string | null;
  operatore: string | null;
  // Snapshot dei dati cliente al momento della generazione.
  cliente_ragione_sociale: string;
  cliente_partita_iva: string | null;
  cliente_indirizzo: string | null;
  cliente_citta: string | null;
  cliente_provincia: string | null;
  cliente_cap: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  // Snapshot del ticket.
  ticket_numero: string;
  modulo_software: string | null;
  sommario: string | null;
  descrizione: string | null;
  // Contenuto editabile.
  attivita: string | null;
  note_aggiuntive: string | null;
  minuti_totali: number;
  voci: RapportinoVoce[];
  // Invio all'ERP Arca (non ancora configurato).
  arca_stato: string;
  arca_riferimento: string | null;
  arca_inviato_il: string | null;
  arca_errore: string | null;
  creato_da: string | null;
}

export interface RapportinoInput {
  attivita?: string | null;
  note_aggiuntive?: string | null;
  minuti_totali?: number;
  stato?: "bozza" | "confermato";
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
  // null = task aperta senza scadenza: resta nel pannello, in fondo.
  data_scadenza: string | null;
  assegnatario: string | null;
  progetto_id: string | null;
  progetto_nome: string | null;
  progetto_codice: string | null;
  cliente_ragione_sociale: string | null;
  in_ritardo: boolean;
  // Calcolato dal server: scadenza entro i prossimi 7 giorni.
  in_scadenza: boolean;
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
  // Tutte le mie task aperte (assegnate o con me tra i collaboratori),
  // comprese quelle senza scadenza. Il team si carica a parte, solo admin.
  mie_task: TaskScadenzaDashboard[];
}

// ---------------------------------------------------------------------------
// Direzione (admin): cosa succede OGGI. La presenza e' inferita: una voce
// tempo aperta significa "al lavoro"; senza voce, un'azione recente nel
// registro significa "attivo". Non esiste un tracking di sessione.
// ---------------------------------------------------------------------------

export type PresenzaOperatore = "al_lavoro" | "attivo" | "non_attivo";

export interface DirezioneCosaFa {
  tipo: "ticket" | "attivita" | "generico";
  // id del ticket o dell'attivita' (null per "generico").
  id: string | null;
  etichetta: string;
  // Progetto dell'attivita', per il link /progetti/[id].
  progetto_id: string | null;
  inizio: string;
  minuti_finora: number;
}

export interface SquadraOperatore {
  id: string;
  nome: string;
  ruolo: "admin" | "operatore";
  presenza: PresenzaOperatore;
  ultimo_accesso: string | null;
  ultima_attivita: string | null;
  attivita_aperta: DirezioneCosaFa | null;
  minuti_oggi: number;
  minuti_settimana: number;
  ticket_aperti: number;
  task_in_ritardo: number;
}

export interface DirezioneTicketAperto {
  id: string;
  numero: string;
  cliente: string;
  sommario: string;
  priorita: Priorita;
  stato: StatoTicket;
  operatore: string | null;
  creato_il: string | null;
  eta_ore: number;
  sla: "scaduto" | "in_scadenza" | null;
}

export interface DirezioneTrendPunto {
  giorno: string;
  creati: number;
  chiusi: number;
}

export interface DirezioneKpi {
  ticket: { aperti: number; nuovi: number; in_corso: number; da_prendere: number };
  sla: { scaduti: number; in_scadenza: number };
  tempo: { oggi_minuti: number; settimana_minuti: number };
  squadra: { al_lavoro: number; attivi: number; totale: number };
  inbox_da_verificare: number;
  progetti_attivi: number;
}

export interface DirezioneMiei {
  ticket: { aperti: number; nuovi: number; in_corso: number };
  task: { in_scadenza: number; in_ritardo: number };
  task_lista: TaskScadenzaDashboard[];
  tempo: TempoDashboard;
  attivita_aperta: VoceApertaDashboard | null;
}

export interface DirezioneData {
  generato_il: string;
  kpi: DirezioneKpi;
  squadra: SquadraOperatore[];
  ticket_aperti: DirezioneTicketAperto[];
  miei: DirezioneMiei;
  trend: DirezioneTrendPunto[];
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
  casella_id: string | null;
  // "processata" = flusso completato (ticket creato/agganciato),
  // "errore" = lavorazione fallita, "ignorata" = scartata dal triage,
  // "da_verificare" = in attesa di una decisione umana.
  stato: "processata" | "errore" | "ignorata" | "da_verificare";
  stato_triage?: "ticket" | "da_verificare" | "ignora" | null;
  esito_ai: "ticket" | "da_verificare" | "ignora" | null;
  confidenza: number | null;
  motivo: string | null;
  in_reply_to: string | null;
  riferimenti: string | null;
  correzione_umana: string | null;
  corretto_da: string | null;
  body_text?: string | null;
  data_creazione: string;
}

// Casella email collegata all'app (IMAP + SMTP dello stesso account).
// La password NON compare MAI in questo tipo: resta sul server cifrata
// (lib/cifratura.ts) e le API ritornano solo `ha_password`.
export interface CasellaEmail {
  id: string;
  etichetta: string;
  indirizzo: string;
  // 'imap' = account classico pollato via IMAP; 'gmail' = account collegato
  // via OAuth 2.0 + Gmail API (nessuna password, solo refresh token cifrato).
  tipo: "imap" | "gmail";
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  utente: string;
  abilitata: boolean;
  predefinita: boolean;
  // Deroga esplicita alla verifica del certificato TLS per questa casella.
  // Default false: un certificato non valido blocca la connessione.
  tls_non_verificato: boolean;
  triage_attivo: boolean;
  triage_soglia: number;
  triage_priorita: "BASSA" | "MEDIA" | "ALTA" | null;
  triage_operatore: string | null;
  triage_osservazione: boolean;
  ha_password: boolean;
  data_creazione: string;
  data_aggiornamento: string;
}

// Input per creazione/aggiornamento. `password` e' opzionale in aggiornamento:
// assente o vuota = la password salvata resta invariata.
export interface CasellaEmailInput {
  etichetta: string;
  indirizzo: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  utente: string;
  password?: string;
  abilitata: boolean;
  predefinita: boolean;
  tls_non_verificato?: boolean;
  triage_attivo?: boolean;
  triage_soglia?: number;
  triage_priorita?: "BASSA" | "MEDIA" | "ALTA" | null;
  triage_operatore?: string | null;
  triage_osservazione?: boolean;
}

// ---------------------------------------------------------------------------
// Agenti AI
// ---------------------------------------------------------------------------

// Ruolo funzionale dell'agente: determina il contesto d'uso in UI e il
// prompt predefinito suggerito. 'custom' = libero.
export type RuoloAgente = "assistente" | "contenuti" | "clienti" | "custom";

// Backend per l'esecuzione: 'auto' = default globale (Hermes se configurato,
// altrimenti OpenRouter); 'openrouter'/'hermes' = override per-agente.
// NOTA: un agente con strumenti (dati dell'app) gira SEMPRE su OpenRouter:
// il loop degli strumenti lo esegue la nostra app, non Hermes.
export type ProviderAgente = "auto" | "openrouter" | "hermes";

// Gruppi di strumenti (dati dell'app, sola lettura) selezionabili in UI.
// Ogni gruppo abilita uno piu' tool di lib/agenti-tools.ts.
export type GruppoStrumenti = "ticket" | "clienti" | "statistiche";

export interface Agente {
  id: string;
  nome: string;
  descrizione: string | null;
  ruolo: RuoloAgente;
  modello: string;
  // COME deve comportarsi l'agente (identità, tono, vincoli).
  system_prompt: string;
  // COSA deve fare di default: accodato al prompt a ogni esecuzione.
  istruzioni_default: string | null;
  // Testo mostrato nel Copilot prima del primo turno (opzionale).
  messaggio_iniziale: string | null;
  // Nomi degli strumenti attivi (es. ["cerca_ticket","get_ticket"]).
  strumenti: string[];
  provider: ProviderAgente;
  attivo: boolean;
  creato_da?: string | null;
  proprietario_id?: string | null;
  visibilita?: "libreria" | "personale";
  data_creazione?: string;
  data_aggiornamento?: string;
}

export interface AgenteInput {
  nome: string;
  descrizione?: string;
  ruolo?: RuoloAgente;
  modello?: string;
  system_prompt: string;
  istruzioni_default?: string | null;
  messaggio_iniziale?: string | null;
  strumenti?: string[];
  provider?: ProviderAgente;
  attivo?: boolean;
  visibilita?: "libreria" | "personale";
}

export type StatoEsecuzioneAgente = "in_corso" | "completata" | "errore";

// Voce del trace: una chiamata a strumento del loop (o il sintetico finale).
export interface VoceTraccia {
  turno: number;
  tool: string;
  argomenti: string;
  esito: string;
}

export interface AgenteEsecuzione {
  id: string;
  agente_id: string;
  input_utente: string;
  output: string | null;
  stato: StatoEsecuzioneAgente;
  errore: string | null;
  modello: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  durata_ms: number | null;
  operatore_id: string | null;
  // JSON di contesto opzionale: ticket_id, cliente_id, ...
  contesto: Record<string, unknown> | null;
  // Trace del loop strumenti (null per le esecuzioni conversazionali).
  traccia: VoceTraccia[] | null;
  // Thread Copilot a cui appartiene il turno e backend effettivo usato.
  conversazione_id: string | null;
  provider: string | null;
  avviata_da: "operatore" | "trigger" | "sistema";
  parent_id: string | null;
  data_creazione: string;
}

export interface EsecuzioneAgenteInput {
  input: string;
  contesto?: Record<string, unknown>;
}

// Agente con il flag di "pinnato" per l'operatore corrente (barra rapida del
// Copilot). Per gli agenti personali il flag e' sempre editabile; per quelli
// di libreria dipende dalla riga in agenti_assegnazioni.
export interface AgentePerOperatore extends Agente {
  pinnato: boolean;
}

// Riga di assegnazione di un agente di libreria a un operatore.
export interface AgenteAssegnazione {
  id: string;
  agente_id: string;
  operatore_id: string;
  abilitato: boolean;
  pinnato: boolean;
  ordine: number;
  data_creazione: string;
}

// Thread del Copilot (una chat per agente + operatore).
export interface AgenteConversazione {
  id: string;
  agente_id: string;
  operatore_id: string;
  titolo: string | null;
  contesto: Record<string, unknown> | null;
  data_creazione: string;
  data_aggiornamento: string;
}

// Riga del monitor "Attività agenti": esecuzione arricchita con i nomi per la
// timeline (evita una seconda query in UI).
export interface AgenteAttivita extends AgenteEsecuzione {
  agente_nome: string | null;
  operatore_nome: string | null;
}

export type EmailIntent =
  | "technical_issue"
  | "billing_issue"
  | "account_access"
  | "feature_request"
  | "complaint"
  | "question"
  | "other";

export type EsitoTriage = "ticket" | "da_verificare" | "ignora";

export interface EmailClassification {
  // Decisione di triage. In caso di dubbio "da_verificare", MAI "ignora".
  esito: EsitoTriage;
  // 0..1: quanto il classificatore e' sicuro dell'esito.
  confidenza: number;
  // Una frase sul perche' (mostrata all'operatore nella coda "Da verificare").
  motivo: string;
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
  message_id?: string | null;
  in_reply_to?: string | null;
  riferimenti?: string | null;
  data_creazione: string;
}
