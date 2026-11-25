---
title: Tabelle
aliases: []
tags:
  - auto
  - riferimento
  - database
aggiornato: 2026-11-25
commit: 81b3f92
---


> [!info] Nota generata automaticamente
> Fonte: codice del repository. Non modificare a mano: viene riscritta da `npm run docs:riferimenti`.


Tabelle definite in `lib/db.ts` (37). Lo schema e' creato in modo lazy al primo accesso e aggiornato con `ALTER TABLE` additivi; non c'e' un ORM.

Indice rapido:

- `agenti`
- `agenti_assegnazioni`
- `agenti_conversazioni`
- `agenti_esecuzioni`
- `agenti_proposte`
- `allegati`
- `allegati_messaggi`
- `attivita`
- `attivita_etichette`
- `attivita_google`
- `caselle_email`
- `caselle_operatori`
- `chiavi_api`
- `chiavi_idempotenza`
- `clienti`
- `clienti_commerciale`
- `email_inbox`
- `email_log`
- `etichette`
- `impostazioni`
- `knowledge_docs`
- `knowledge_links`
- `messages`
- `notifications`
- `notifications_lette`
- `operatori`
- `progetti`
- `progetti_tickets`
- `questionari`
- `questionari_risposte`
- `rapportini`
- `registro_attivita`
- `technical_notes`
- `tentativi_login`
- `tickets`
- `tickets_storico_stati`
- `voci_tempo`

## agenti

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `nome` | TEXT NOT NULL |
| `descrizione` | TEXT |
| `ruolo` | TEXT NOT NULL DEFAULT 'assistente' |
| `modello` | TEXT NOT NULL DEFAULT '' |
| `system_prompt` | TEXT NOT NULL |
| `istruzioni_default` | TEXT |
| `messaggio_iniziale` | TEXT |
| `strumenti` | TEXT NOT NULL DEFAULT '[]' |
| `provider` | TEXT NOT NULL DEFAULT 'auto' |
| `attivo` | INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)) |
| `creato_da` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## agenti_assegnazioni

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `agente_id` | TEXT NOT NULL |
| `operatore_id` | TEXT NOT NULL |
| `abilitato` | INTEGER NOT NULL DEFAULT 1 CHECK (abilitato IN (0,1)) |
| `pinnato` | INTEGER NOT NULL DEFAULT 0 CHECK (pinnato IN (0,1)) |
| `ordine` | INTEGER NOT NULL DEFAULT 0 |
| `data_creazione` | TEXT NOT NULL |

## agenti_conversazioni

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `agente_id` | TEXT NOT NULL |
| `operatore_id` | TEXT NOT NULL |
| `titolo` | TEXT |
| `contesto` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## agenti_esecuzioni

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `agente_id` | TEXT NOT NULL |
| `input_utente` | TEXT NOT NULL |
| `output` | TEXT |
| `stato` | TEXT NOT NULL DEFAULT 'in_corso' |
| `errore` | TEXT |
| `modello` | TEXT |
| `prompt_tokens` | INTEGER |
| `completion_tokens` | INTEGER |
| `durata_ms` | INTEGER |
| `operatore_id` | TEXT |
| `contesto` | TEXT |
| `traccia` | TEXT |
| `data_creazione` | TEXT NOT NULL |

## agenti_proposte

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `esecuzione_id` | TEXT |
| `agente_id` | TEXT |
| `conversazione_id` | TEXT |
| `progetto_id` | TEXT |
| `tipo` | TEXT NOT NULL |
| `payload` | TEXT NOT NULL |
| `stato` | TEXT NOT NULL DEFAULT 'in_attesa' |
| `proposta_da` | TEXT |
| `deciso_da` | TEXT |
| `errore` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_decisione` | TEXT |

## allegati

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `note_tecnica_id` | TEXT NOT NULL REFERENCES technical_notes(id) ON DELETE CASCADE |
| `ticket_id` | TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE |
| `nome_file` | TEXT NOT NULL |
| `nome_originale` | TEXT NOT NULL |
| `dimensione` | INTEGER NOT NULL |
| `tipo_mime` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## allegati_messaggi

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `messaggio_id` | TEXT NOT NULL |
| `ticket_id` | TEXT NOT NULL |
| `nome_file` | TEXT NOT NULL |
| `nome_originale` | TEXT NOT NULL |
| `dimensione` | INTEGER NOT NULL |
| `tipo_mime` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## attivita

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `progetto_id` | TEXT |
| `cliente_id` | TEXT |
| `titolo` | TEXT NOT NULL |
| `descrizione` | TEXT |
| `stato` | TEXT NOT NULL DEFAULT 'DA_FARE' |
| `priorita` | TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priorita IN ('BASSA','MEDIA','ALTA')) |
| `data_inizio` | TEXT |
| `data_scadenza` | TEXT |
| `data_completamento` | TEXT |
| `assegnatario` | TEXT |
| `persone` | TEXT NOT NULL DEFAULT '[]' |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## attivita_etichette

| Colonna | Definizione |
| --- | --- |
| `attivita_id` | TEXT NOT NULL |
| `etichetta_id` | TEXT NOT NULL |

## attivita_google

| Colonna | Definizione |
| --- | --- |
| `attivita_id` | TEXT PRIMARY KEY |
| `calendar_id` | TEXT NOT NULL |
| `event_id` | TEXT NOT NULL |
| `stato` | TEXT NOT NULL DEFAULT 'PENDENTE' |
| `tentativi` | INTEGER NOT NULL DEFAULT 0 |
| `ultimo_errore` | TEXT |
| `data_sync` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## caselle_email

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `etichetta` | TEXT NOT NULL |
| `indirizzo` | TEXT NOT NULL UNIQUE |
| `tipo` | TEXT NOT NULL DEFAULT 'imap' CHECK (tipo IN ('imap','gmail')) |
| `imap_host` | TEXT NOT NULL |
| `imap_port` | INTEGER NOT NULL DEFAULT 993 |
| `imap_secure` | INTEGER NOT NULL DEFAULT 1 CHECK (imap_secure IN (0,1)) |
| `smtp_host` | TEXT NOT NULL |
| `smtp_port` | INTEGER NOT NULL DEFAULT 587 |
| `smtp_secure` | INTEGER NOT NULL DEFAULT 0 CHECK (smtp_secure IN (0,1)) |
| `utente` | TEXT NOT NULL |
| `password_cifrata` | TEXT NOT NULL |
| `oauth_refresh_token_cifrata` | TEXT |
| `gmail_da_epoch` | INTEGER |
| `abilitata` | INTEGER NOT NULL DEFAULT 1 CHECK (abilitata IN (0,1)) |
| `predefinita` | INTEGER NOT NULL DEFAULT 0 CHECK (predefinita IN (0,1)) |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## caselle_operatori

| Colonna | Definizione |
| --- | --- |
| `casella_id` | TEXT NOT NULL |
| `operatore_id` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## chiavi_api

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `nome` | TEXT NOT NULL |
| `hash` | TEXT NOT NULL UNIQUE |
| `prefisso` | TEXT NOT NULL |
| `ambiti` | TEXT NOT NULL DEFAULT '[]' |
| `attiva` | INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0,1)) |
| `ultimo_uso` | TEXT |
| `data_creazione` | TEXT NOT NULL |

## chiavi_idempotenza

| Colonna | Definizione |
| --- | --- |
| `chiave` | TEXT PRIMARY KEY |
| `risposta` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## clienti

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ragione_sociale` | TEXT NOT NULL |
| `nome_contatto` | TEXT |
| `email` | TEXT |
| `telefono` | TEXT |
| `indirizzo` | TEXT |
| `citta` | TEXT |
| `provincia` | TEXT |
| `cap` | TEXT |
| `partita_iva` | TEXT |
| `note` | TEXT |
| `attivo` | INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)) |
| `data_creazione` | TEXT NOT NULL |

## clienti_commerciale

| Colonna | Definizione |
| --- | --- |
| `cliente_id` | TEXT PRIMARY KEY |
| `referente_tecnico` | TEXT |
| `referente_decisionale` | TEXT |
| `email_decisionale` | TEXT |
| `telefono_decisionale` | TEXT |
| `stato_cliente` | TEXT NOT NULL DEFAULT 'attivo' |
| `settore` | TEXT |
| `dimensione_aziendale` | TEXT |
| `priorita_commerciale` | TEXT NOT NULL DEFAULT 'media' |
| `note_commerciali` | TEXT |
| `data_aggiornamento` | TEXT NOT NULL |

## email_inbox

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `message_id` | TEXT NOT NULL UNIQUE |
| `from_email` | TEXT NOT NULL |
| `from_nome` | TEXT |
| `subject` | TEXT NOT NULL |
| `body_preview` | TEXT |
| `body_html` | TEXT |
| `ticket_id` | TEXT |
| `casella_id` | TEXT |
| `stato` | TEXT NOT NULL DEFAULT 'processata' |
| `data_creazione` | TEXT NOT NULL |

## email_log

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ticket_id` | TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE |
| `tipo` | TEXT NOT NULL |
| `destinatario` | TEXT NOT NULL |
| `oggetto` | TEXT NOT NULL |
| `corpo` | TEXT NOT NULL |
| `stato` | TEXT NOT NULL DEFAULT 'inviata' CHECK (stato IN ('inviata','errore')) |
| `errore` | TEXT |
| `data_creazione` | TEXT NOT NULL |

## etichette

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `nome` | TEXT NOT NULL UNIQUE |
| `colore` | TEXT NOT NULL DEFAULT '#6B7280' |
| `data_creazione` | TEXT NOT NULL |

## impostazioni

| Colonna | Definizione |
| --- | --- |
| `chiave` | TEXT PRIMARY KEY |
| `valore` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## knowledge_docs

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `nome_file` | TEXT NOT NULL |
| `dimensione` | INTEGER NOT NULL |
| `pagine` | INTEGER |
| `testo` | TEXT NOT NULL |
| `links` | TEXT DEFAULT '[]' |
| `data_creazione` | TEXT NOT NULL |

## knowledge_links

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `titolo` | TEXT NOT NULL |
| `url` | TEXT NOT NULL |
| `descrizione` | TEXT |
| `categoria` | TEXT DEFAULT 'generale' |
| `data_creazione` | TEXT NOT NULL |

## messages

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ticket_id` | TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE |
| `ruolo` | TEXT NOT NULL CHECK (ruolo IN ('user','assistant')) |
| `contenuto` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## notifications

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `titolo` | TEXT NOT NULL |
| `messaggio` | TEXT NOT NULL |
| `ticket_id` | TEXT |
| `tipo` | TEXT NOT NULL DEFAULT 'info' |
| `letta` | INTEGER NOT NULL DEFAULT 0 CHECK (letta IN (0,1)) |
| `data_creazione` | TEXT NOT NULL |

## notifications_lette

| Colonna | Definizione |
| --- | --- |
| `notification_id` | TEXT NOT NULL |
| `operatore_id` | TEXT NOT NULL |
| `data` | TEXT NOT NULL |

## operatori

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `nome` | TEXT NOT NULL |
| `email` | TEXT NOT NULL UNIQUE |
| `password_hash` | TEXT NOT NULL |
| `ruolo` | TEXT NOT NULL DEFAULT 'operatore' CHECK (ruolo IN ('admin','operatore')) |
| `attivo` | INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)) |
| `data_creazione` | TEXT NOT NULL |
| `ultimo_accesso` | TEXT |

## progetti

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `codice` | TEXT NOT NULL UNIQUE |
| `nome` | TEXT NOT NULL |
| `descrizione` | TEXT |
| `cliente_id` | TEXT NOT NULL |
| `stato` | TEXT NOT NULL DEFAULT 'PIANIFICATO' |
| `priorita` | TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priorita IN ('BASSA','MEDIA','ALTA')) |
| `responsabile` | TEXT |
| `persone` | TEXT NOT NULL DEFAULT '[]' |
| `data_inizio` | TEXT |
| `data_fine` | TEXT |
| `note` | TEXT |
| `attivo` | INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)) |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## progetti_tickets

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `progetto_id` | TEXT NOT NULL |
| `ticket_id` | TEXT NOT NULL |
| `data_creazione` | TEXT NOT NULL |

## questionari

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `cliente_id` | TEXT NOT NULL |
| `token_hash` | TEXT NOT NULL UNIQUE |
| `stato` | TEXT NOT NULL DEFAULT 'creato' |
| `titolo` | TEXT NOT NULL |
| `messaggio` | TEXT |
| `destinatario` | TEXT |
| `scadenza` | TEXT |
| `inviato_il` | TEXT |
| `compilato_il` | TEXT |
| `esito_invio` | TEXT |
| `errore_invio` | TEXT |
| `creato_da` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |

## questionari_risposte

| Colonna | Definizione |
| --- | --- |
| `questionario_id` | TEXT PRIMARY KEY |
| `cliente_id` | TEXT NOT NULL |
| `risposte` | TEXT NOT NULL |
| `n_computer` | INTEGER |
| `n_server` | INTEGER |
| `arca_versione` | TEXT |
| `arca_licenze` | INTEGER |
| `n_software` | INTEGER |
| `nps` | INTEGER |
| `consenso_privacy` | INTEGER NOT NULL DEFAULT 0 |
| `data_compilazione` | TEXT NOT NULL |

## rapportini

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ticket_id` | TEXT NOT NULL UNIQUE |
| `cliente_id` | TEXT |
| `numero` | TEXT NOT NULL |
| `stato` | TEXT NOT NULL DEFAULT 'bozza' |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |
| `data_chiusura` | TEXT |
| `operatore_id` | TEXT |
| `operatore` | TEXT |
| `cliente_ragione_sociale` | TEXT NOT NULL |
| `cliente_partita_iva` | TEXT |
| `cliente_indirizzo` | TEXT |
| `cliente_citta` | TEXT |
| `cliente_provincia` | TEXT |
| `cliente_cap` | TEXT |
| `cliente_email` | TEXT |
| `cliente_telefono` | TEXT |
| `ticket_numero` | TEXT NOT NULL |
| `modulo_software` | TEXT |
| `sommario` | TEXT |
| `descrizione` | TEXT |
| `attivita` | TEXT |
| `note_aggiuntive` | TEXT |
| `minuti_totali` | INTEGER NOT NULL DEFAULT 0 |
| `voci` | TEXT NOT NULL DEFAULT '[]' |
| `arca_stato` | TEXT NOT NULL DEFAULT 'da_configurare' |
| `arca_riferimento` | TEXT |
| `arca_inviato_il` | TEXT |
| `arca_errore` | TEXT |
| `creato_da` | TEXT |

## registro_attivita

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `operatore_id` | TEXT |
| `origine` | TEXT NOT NULL DEFAULT 'utente' |
| `azione` | TEXT NOT NULL |
| `entita` | TEXT |
| `entita_id` | TEXT |
| `dettagli` | TEXT |
| `data` | TEXT NOT NULL |

## technical_notes

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ticket_id` | TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE |
| `titolo` | TEXT NOT NULL |
| `problema` | TEXT NOT NULL |
| `soluzione` | TEXT NOT NULL |
| `operatore` | TEXT |
| `data_creazione` | TEXT NOT NULL |

## tentativi_login

| Colonna | Definizione |
| --- | --- |
| `chiave` | TEXT PRIMARY KEY |
| `email` | TEXT NOT NULL |
| `ip` | TEXT NOT NULL |
| `tentativi` | INTEGER NOT NULL DEFAULT 0 |
| `bloccato_fino` | TEXT |
| `ultimo_tentativo` | TEXT NOT NULL |

## tickets

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `numero` | TEXT NOT NULL UNIQUE |
| `cliente` | TEXT NOT NULL |
| `contatto` | TEXT NOT NULL |
| `telefono` | TEXT |
| `email` | TEXT |
| `modulo_software` | TEXT NOT NULL |
| `sommario_problema` | TEXT NOT NULL |
| `descrizione_dettagliata` | TEXT NOT NULL |
| `priorita` | TEXT NOT NULL CHECK (priorita IN ('BASSA','MEDIA','ALTA')) |
| `stato` | TEXT NOT NULL DEFAULT 'NUOVO' |
| `note` | TEXT |
| `operatore` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |
| `data_chiusura` | TEXT |
| `data_inizio_lavoro` | TEXT |
| `tempo_stimato_minuti` | INTEGER |
| `tempo_effettivo_minuti` | INTEGER |

## tickets_storico_stati

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `ticket_id` | TEXT NOT NULL |
| `da_stato` | TEXT |
| `a_stato` | TEXT NOT NULL |
| `operatore_id` | TEXT |
| `operatore` | TEXT |
| `data` | TEXT NOT NULL |

## voci_tempo

| Colonna | Definizione |
| --- | --- |
| `id` | TEXT PRIMARY KEY |
| `attivita_id` | TEXT |
| `ticket_id` | TEXT |
| `operatore_id` | TEXT NOT NULL |
| `operatore` | TEXT NOT NULL |
| `descrizione` | TEXT |
| `inizio` | TEXT NOT NULL |
| `fine` | TEXT |
| `data_creazione` | TEXT NOT NULL |
| `data_aggiornamento` | TEXT NOT NULL |
