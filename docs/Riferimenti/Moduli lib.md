---
title: Moduli lib
aliases: []
tags:
  - auto
  - riferimento
  - moduli
aggiornato: 2026-11-25
commit: 81b3f92
---


> [!info] Nota generata automaticamente
> Fonte: codice del repository. Non modificare a mano: viene riscritta da `npm run docs:riferimenti`.


Moduli server/client di `lib/` (74). La descrizione e' il primo commento del file, non una sintesi redazionale.

| File | Descrizione dal codice |
| --- | --- |
| `lib/agenti-contesto.ts` | =========================================================================== Memoria conversazionale e contesto per gli agenti.  Modulo PURO (nessun import server-only/db): le funzioni sono testabili e vengono usate da lib/agenti.ts per costruire il prompt… |
| `lib/agenti-tools-def.ts` | Definizioni dei gruppi di strumenti "dati dell'app" — dati PURI, senza import di server: condiviso da lib/agenti-tools.ts (esecutore server) e dalla pagina /admin/agenti (checkbox in UI). Ogni gruppo corrisponde a uno o piu' tool reali in… |
| `lib/agenti-tools.ts` | =========================================================================== Strumenti "dati dell'app" per il loop agentico IN-APP.  Il modello (OpenRouter) richiama questi tool con function calling; la ESECUZIONE avviene qui, dentro la nostra app, sul… |
| `lib/agenti.ts` | Accesso dati e invocazione degli agenti AI.  Un agente = system prompt + modello + (opzionale) strumenti "dati dell'app". L'esecuzione è sincrona e viene loggata integralmente in agenti_esecuzioni (input, output, stato, durata, token, trace) — quel log è… |
| `lib/ai-provider.ts` | =========================================================================== Provider AI parametrico per l'esecuzione degli agenti.  Due backend con lo STESSO formato di risposta (OpenAI Chat Completions):   - "hermes"    → Hermes Agent (API server… |
| `lib/allegati.ts` | Tipi di allegato ammessi e regole di visualizzazione.  Il MIME NON si prende mai dal client: un file .html dichiarato "image/png" verrebbe servito come immagine, ma alcuni browser lo annusano comunque come HTML ed eseguono lo script. Qui il tipo si deriva… |
| `lib/api-cache.ts` | =========================================================================== Cache delle risposte GET, in memoria di scheda.  Perche' esiste: ogni pagina fa la propria `fetch` in `useEffect`, e tornare su una pagina gia' visitata significa rifare il giro… |
| `lib/attivita.ts` | =========================================================================== ATTENZIONE — QUESTO MODULO E' IL PUNTO DI AGGANCIO DELLA SINCRONIZZAZIONE VERSO GOOGLE CALENDAR.  insertAttivita / updateAttivita / deleteAttivita chiamano la sincronizzazione e… |
| `lib/auth.ts` | PBKDF2: 600k iterazioni (OWASP 2024) per gli hash nuovi. Gli hash storici (100k) restano validi e vengono ricalcolati automaticamente al primo login riuscito, senza richiedere un reset password a nessuno. |
| `lib/autoconfig.ts` | =========================================================================== Auto-scoperta impostazioni IMAP/SMTP da un semplice indirizzo email (stile Outlook/Thunderbird): l'utente non inserisce mai host e porte.  Pipeline a cascata, in ordine:   1.… |
| `lib/cache.ts` | =========================================================================== Memo in-process per i dati di CONFIGURAZIONE.  Non e' la cache delle risposte HTTP (quella sta in `lib/api-cache.ts`): qui si evita di ripetere la stessa query al database quando… |
| `lib/calendario-form.ts` | =========================================================================== Ponte tra EventoCalendario, il form completo e il popover compatto. Funzioni pure: niente fetch, niente React.… |
| `lib/calendario-griglia.ts` | =========================================================================== Matematica della griglia oraria: nessun React, nessun DOM.  Gli orari del calendario sono stringhe naive "YYYY-MM-DDTHH:mm" (ora di parete di Roma), non istanti UTC. Per sommare… |
| `lib/calendario.ts` | Funzioni pure di supporto al calendario: nessun accesso al DB, nessuna libreria di date. Tutto con Date nativo. |
| `lib/caselle-worker.ts` | Lettura caselle email per l'IMAP worker (processo separato da Next).  Questo modulo NON importa lib/db.ts (server-only esploderebbe fuori da Next) ne lib/caselle.ts (che a sua volta importa db): usa direttamente il client Turso condiviso di… |
| `lib/caselle.ts` | Accesso dati per le caselle email multi-account.  Ogni riga = un account IMAP+SMTP pollato dall'IMAP worker e usato per le risposte. Le password viaggiano solo cifrate (lib/cifratura.ts): qui le funzioni di lettura "grezza" sono private e le API espongono… |
| `lib/chiavi-api.ts` | =========================================================================== Chiavi API macchina (bot WhatsApp su Hermes).  Nel DB vive SOLO l'hash SHA-256 della chiave: il valore in chiaro viene restituito una volta sola alla creazione. La chiave… |
| `lib/cifratura.ts` | Crittografia AES-256-GCM per le password delle caselle email.  Le credenziali STANNO nel DB (scelta esplicita: configurazione completa dall'applicazione), ma cifrate con una chiave che vive solo in env (ENCRYPTION_KEY): senza quella chiave i valori sono… |
| `lib/clienti-commerciale.ts` | — |
| `lib/clienti.ts` | Gli id cliente sono eterogenei: le righe seed sono 'CLI-001'...'CLI-005', quelle sincronizzate da Arca sono stringhe numeriche. Vanno sempre trattati come TEXT opaco, mai parsati. |
| `lib/contatti.ts` | Contatti del cliente dentro un ticket.  Due modi per riempire email/telefono: il campo dedicato oppure il testo libero (contatto, descrizione). L'agente vocale arriva spuro dal centralino e butta tutto in `contatto`, quindi prima dei campi si prova sempre… |
| `lib/csv.ts` | Serializzazione di una cella CSV. Modulo puro (niente DB, niente "server-only") cosi' e' testabile direttamente. |
| `lib/dashboard.ts` | =========================================================================== La home in una richiesta.  La dashboard mostra ticket, task, progetti (solo conteggio) e tempo. Sono poche SELECT indipendenti dentro UN `db.batchRead`, quindi UNA richiesta HTTP.… |
| `lib/db.ts` | Client condiviso con l'IMAP worker: la creazione vive in lib/turso-client.ts (senza "server-only"), qui resta solo l'inoltro. |
| `lib/direzione.ts` | =========================================================================== Direzione: la vista "oggi" dell'admin.  Non esiste un tracking di sessione: la presenza e' INFERITA.  - voce tempo aperta        -> "al lavoro" (e mostra su cosa)  - ultima azione… |
| `lib/durata.ts` | =========================================================================== Tempi del progetto e del cronometro.  I progetti non hanno un tempo proprio memorizzato: il tempo reale arriva dalle voci di `voci_tempo` (task, ticket, tempo generico) e, per lo… |
| `lib/email-classifier.ts` | Triage delle email in arrivo.  Ordine delle decisioni (dalla piu' economica alla piu' costosa):   1. regole sugli header e sul mittente (gratis, deterministiche);   2. modello, con output JSON validato qui (l'AI non puo' inventare esiti);   3. fallback… |
| `lib/email-headers.ts` | Funzioni pure per gli header di threading (niente DB): testabili da sole. |
| `lib/email-interni-config.ts` | Regole effettive:  - tutte le caselle ABILITATE (assistenza@..., svilupoweb@...) sono sempre    interne;  - piu' gli indirizzi/domini extra configurati dall'admin. |
| `lib/email-interni.ts` | Riconoscimento dei mittenti interni: le email inviate dalle nostre caselle non devono creare ticket.  Modulo puro (niente DB) cosi' e' testabile: la configurazione arriva da lib/email-interni-config.ts. |
| `lib/email-log.ts` | — |
| `lib/email-templates.ts` | Ogni valore che arriva dal DB o dall'input utente passa da qui. Senza, un ticket con "<script>" nel sommario (o un allegato chiamato "<img onerror=...>") verrebbe eseguito nel client di posta del cliente. |
| `lib/email.ts` | Timeout comuni: senza, un SMTP che non risponde lascia appesa la richiesta HTTP che sta aspettando l'invio (es. il cambio di stato di un ticket): il default di sistema di nodemailer e' di 2 minuti, troppo per una richiesta utente. |
| `lib/esterni.ts` | Ricerca cliente per numero di telefono per l'API macchina (bot WhatsApp). Restituisce SOLO l'anagrafica che corrisponde a quel numero: il bot non deve poter enumerare i clienti. |
| `lib/etichette.ts` | =========================================================================== ETICHETTE PERSONALIZZATE DEL CALENDARIO.  Due tabelle: `etichette` (anagrafica nome+colore) e `attivita_etichette` (assegnazione N:N). Le scritture sulla pivot qui NON passano da… |
| `lib/gmail-oauth.ts` | =========================================================================== OAuth 2.0 (PKCE) + Gmail API per il collegamento account Gmail delle caselle.  Zero-configuration per l'utente: nessuna porta, nessun server, nessuna password. L'utente clicca,… |
| `lib/gmail-worker.ts` | Worker di polling Gmail via OAuth 2.0 + Gmail API (affianca l'IMAP worker: le caselle IMAP restano pollate da lib/imap-worker.ts, quelle Gmail qui).  Stesso flusso di consegna: ogni email scaricata viene POSTata al webhook /api/hooks/email (dedup,… |
| `lib/google-calendar.ts` | =========================================================================== Client HTTP verso Google Calendar. Autenticazione con service account (RS256).  REGOLA DI MANUTENZIONE — in questo file non si chiama MAI `fetch` direttamente: ogni chiamata passa… |
| `lib/google-evento.ts` | Funzioni PURE per la sincronizzazione Google Calendar: nessun accesso al DB, nessuna rete, nessuna libreria di date. Sono il pezzo verificabile senza credenziali, ed e' qui che vive tutta la logica delicata sui fusi. |
| `lib/google-sync.ts` | =========================================================================== Orchestrazione della sincronizzazione App -> Google.  Principio: queste funzioni NON LANCIANO MAI verso il chiamante. Google non e' la fonte di verita' e non deve mai far fallire… |
| `lib/imap-worker.ts` | Poll interval: letto LAZY dentro startImapWorker(), per lo stesso motivo di webhookHeaders() sotto — in start-worker.ts le import girano PRIMA di dotenv.config(), quindi una variabile catturata a livello di modulo resterebbe al default e il valore in .env… |
| `lib/impostazioni.ts` | Store chiave/valore generico per la configurazione modificabile a runtime.  Non contiene SEGRETI: le credenziali Google stanno in variabili d'ambiente (il DB e' Turso, remoto e condiviso). Qui solo dati non sensibili. |
| `lib/knowledge-links.ts` | — |
| `lib/knowledge.ts` | — |
| `lib/nav.ts` | =========================================================================== Navigazione ad AREE, non a singole pagine.  Prima la rail aveva una voce per ogni schermata (11 da admin): due icone Mail identiche, due "dashboard", due icone tempo e un overflow… |
| `lib/notifications.ts` | destinatario_id NULL = notifica per tutti gli operatori autenticati. Valorizzato = solo per quell'operatore (es. "ticket assegnato a te"). |
| `lib/operatore-client.ts` | =========================================================================== L'operatore della sessione, chiesto una volta sola.  Prima ogni pagina lo chiedeva due volte (la Sidebar nel layout e la pagina stessa), e alcune anche di piu': due richieste HTTP… |
| `lib/persone.ts` | =========================================================================== Le persone che condividono un progetto o una task.  Modulo PURO: lo importa il server (lib/attivita.ts, lib/progetti.ts) e lo importano i Client Component (card del progetto,… |
| `lib/progetti.ts` | Coercizione esplicita: la barra di avanzamento fa aritmetica su questo valore, e un NULL (nessuna attivita' completata) deve valere 0, non NaN. |
| `lib/progetto-card.ts` | =========================================================================== Dati di presentazione delle card della lista Progetti.  Modulo PURO: nessun accesso al database, nessun import di server-only. Il motivo e' concreto: app/progetti/page.tsx e' un… |
| `lib/proposte-schema.ts` | Valida e normalizza il payload della proposta. Con `richiediCliente` (usato all'approvazione) il cliente e' obbligatorio; alla creazione puo' mancare. |
| `lib/proposte.ts` | Se assente l'utente e' admin e vede tutto. |
| `lib/questionari-schema.ts` | Schema FISSO del questionario cliente (Fase 1). Le domande vivono qui, cosi' il form pubblico e la validazione server usano la stessa definizione. In una fase successiva questi elenchi potranno diventare template salvati. |
| `lib/questionari.ts` | — |
| `lib/rapportini.ts` | =========================================================================== Rapportini di chiusura ticket.  Un rapportino e' generato alla chiusura del ticket e contiene:  - i dati del CLIENTE (snapshot: non un join, cosi' il documento non cambia    se… |
| `lib/redirect.ts` | Il parametro ?redirect= arriva dall'esterno (URL del middleware o link forgiato): accettiamo SOLO path interni. Senza questo controllo, ?redirect=https://evil.example porta via l'utente appena fa login. Regole:  - deve iniziare con "/" (niente URL… |
| `lib/registro.ts` | Registro unico delle mutazioni. Ogni scrittura "di business" (ticket, note, ore, agenti, API macchina) lascia una riga: chi, cosa, su quale entita'.  Regola: il registro non deve MAI far fallire l'operazione principale. Se la scrittura del registro… |
| `lib/report-ore.ts` | =========================================================================== Report ore (fatturazione agenzia).  Risponde a "quante ore su questo cliente a ottobre?": le voci di tempo (voci_tempo) vengono agganciate al cliente attraverso i due bersagli… |
| `lib/sla-config.ts` | — |
| `lib/sla.ts` | =========================================================================== SLA: obiettivi in MINUTI LAVORATIVI, calcolati sull'orario d'ufficio.  Modulo puro (niente DB) cosi' i conti sono testabili: un errore qui sposta le scadenze di ore o di giorni. Il… |
| `lib/sync-worker.ts` | Sync periodica delle anagrafiche clienti dall'ERP (Arca). Gira nello stesso processo dei worker email: nessun nuovo container, un loop in piu'.  Se la sorgente non e' configurata, il primo tentativo fallisce e viene loggato: il worker email non deve… |
| `lib/sync/config.ts` | ────────────────────────────────────────────────────────────── MODIFICA QUI I CAMPI SEGUENTI: ────────────────────────────────────────────────────────────── |
| `lib/sync/db.ts` | Lettura lazy delle env: gli import vengono hoistati prima di dotenv.config(), quindi non leggere process.env a livello di modulo. |
| `lib/sync/sources/api-source.ts` | Formato OData standard |
| `lib/sync/sources/sql-server-source.ts` | Costruisce la lista campi da selectare |
| `lib/sync/sync-clienti.ts` | Passa solo i campi presenti nella INSERT (combacino con i placeholder) |
| `lib/task-local.ts` | =========================================================================== Stato LOCALE della board delle task: sezioni, sottoattivita' e commenti.  Questi dati non hanno ancora una tabella sul database: vivono nello stato del componente e si perdono al… |
| `lib/tempi.ts` | =========================================================================== Voci di tempo (cronometro).  Regole del modulo:  - UNA sola voce in corso per operatore. Non e' un vincolo del DB (un indice   parziale non e' portabile su tutte le versioni di… |
| `lib/threading.ts` | Threading delle email: agganciare una risposta al ticket giusto.  Ordine di fiducia:   1. header In-Reply-To / References -> un Message-ID che abbiamo inviato      (email_log) o ricevuto (email_inbox);   2. token [TICK-xxxx] nell'oggetto, ma SOLO se il… |
| `lib/tickets.ts` | Senza i due testi lunghi (descrizione, note): le liste non li mostrano, e trasportarli costa quanto il resto della riga moltiplicato. Il dettaglio usa ROW_FIELDS. |
| `lib/turso-client.ts` | Client Turso condiviso tra l'app Next (lib/db.ts) e l'IMAP worker.  Questo modulo NON importa "server-only": il worker e' un processo Node separato (tsx) dove l'import lancerebbe un errore a runtime. La riga "server-only" vive solo in lib/db.ts, che e' la… |
| `lib/types.ts` | Colonne strutturate (Fase 1): affiancano i campi testuali storici. |
| `lib/useDebounce.ts` | =========================================================================== Debounce di un valore.  Si usa sulla ricerca: senza, ogni carattere digitato e' una richiesta HTTP e quindi una scansione `LIKE '%...%'` sul database remoto. 250 ms e' lo stesso… |
| `lib/usePolling.ts` | =========================================================================== Polling che sa quando smettere.  Un `setInterval` che continua a scheda nascosta chiede al database anche mentre nessuno guarda: con un DB remoto e' traffico (e CPU) buttato. Qui… |
