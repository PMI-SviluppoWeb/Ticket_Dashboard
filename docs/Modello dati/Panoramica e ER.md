---
title: Panoramica e ER
aliases:
  - Modello dati
  - ER
tags:
  - architettura
  - database
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Panoramica e ER

Il database è **Turso/libSQL**. Lo schema vive in `lib/db.ts`; l'elenco
completo e aggiornato delle colonne è in [[Modello dati/Tabelle|Tabelle]]
(generato automaticamente).

## Gruppi di tabelle

| Gruppo | Tabelle | Note |
| --- | --- | --- |
| Operatori e sessioni | `operatori`, `tentativi_login` | ruoli admin/operatore, revoca sessioni |
| Ticket | `tickets`, `messages`, `technical_notes`, `allegati`, `tickets_storico_stati` | canale, SLA, ore |
| Email | `email_inbox`, `email_log`, `allegati_messaggi` | inbox, invii, allegati ricevuti |
| Caselle | `caselle_email`, `caselle_operatori` | credenziali cifrate, accessi per operatore |
| Clienti | `clienti`, `clienti_commerciale` | anagrafica sincronizzata + dati locali |
| Questionari | `questionari`, `questionari_risposte` | token hashato, risposte JSON |
| Progetti | `progetti`, `attivita`, `progetti_tickets`, `attivita_google`, `etichette`, `attivita_etichette` | task, collegamenti, sync Google |
| Tempo | `voci_tempo` | cronometro; una voce aperta per operatore |
| AI | `agenti`, `agenti_esecuzioni`, `agenti_conversazioni`, `agenti_assegnazioni`, `agenti_proposte` | agenti, log, thread, proposte |
| Documenti | `knowledge_docs`, `knowledge_links` | testo PDF estratto, link |
| Rapportini | `rapportini` | snapshot cliente, ore, stato |
| Sicurezza/API | `chiavi_api`, `chiavi_idempotenza` | hash chiavi, risposte idempotenti |
| Sistema | `notifications`, `notifications_lette`, `impostazioni`, `registro_attivita` | notifiche, config, audit |

## Relazioni principali

```mermaid
erDiagram
  CLIENTI ||--o{ TICKETS : "cliente_id"
  CLIENTI ||--o{ PROGETTI : "cliente_id"
  CLIENTI ||--o{ QUESTIONARI : "cliente_id"
  CLIENTI ||--o{ CLIENTI_COMMERCIALE : "cliente_id"

  TICKETS ||--o{ MESSAGES : "ticket_id"
  TICKETS ||--o{ TECHNICAL_NOTES : "ticket_id"
  TICKETS ||--o{ VOCI_TEMPO : "ticket_id"
  TICKETS ||--o| RAPPORTINI : "ticket_id"
  TICKETS ||--o{ TICKETS_STORICO_STATI : "ticket_id"

  PROGETTI ||--o{ ATTIVITA : "progetto_id"
  PROGETTI ||--o{ PROGETTI_TICKETS : "progetto_id"
  TICKETS ||--o{ PROGETTI_TICKETS : "ticket_id"
  ATTIVITA ||--o{ VOCI_TEMPO : "attivita_id"
  ATTIVITA ||--o| ATTIVITA_GOOGLE : "attivita_id"

  CASELLE_EMAIL ||--o{ CASELLE_OPERATORI : "casella_id"
  CASELLE_EMAIL ||--o{ EMAIL_INBOX : "casella_id"
  TICKETS ||--o{ EMAIL_INBOX : "ticket_id"

  AGENTI ||--o{ AGENTI_ESECUZIONI : "agente_id"
  AGENTI ||--o{ AGENTI_CONVERSAZIONI : "agente_id"
  AGENTI_CONVERSAZIONI ||--o{ AGENTI_ESECUZIONI : "conversazione_id"
  AGENTI ||--o{ AGENTI_PROPOSTE : "agente_id"
  AGENTI_PROPOSTE }o--|| PROGETTI : "progetto_id"

  QUESTIONARI ||--o| QUESTIONARI_RISPOSTE : "questionario_id"
```

> [!info] Nomi nel diagramma
> Le entità sono in maiuscolo e senza accenti; `caselle_email` appare come
> `CASELLE_EMAIL`. La fonte vera resta [[Modello dati/Tabelle|Tabelle]].

## Convenzioni trasversali

- **ID** `TEXT`: UUID per le entità create dall'app, id opachi per i clienti
  (possono arrivare da Arca).
- **Date**:
  - audit (`data_creazione`, `data_aggiornamento`, `chiuso_il`, ...) in ISO UTC;
  - calendario (`data_inizio`, `data_scadenza`) in `YYYY-MM-DDTHH:mm` **ora di
    parete**, mai UTC.
- **JSON**: `persone`, `strumenti`, `payload`, `links`, `voci`, `risposte`.
  Sempre decodificati nel data layer.
- **Nessuna FK applicata**: cancellazioni e pulizie sono esplicite.
- **Soft delete**: `tickets.eliminato_il` per conservare lo storico email.
- **Impostazioni**: `impostazioni.chiave/valore` per SLA, Google, contatori.

## Dove guardare

- Colonne complete: [[Modello dati/Tabelle|Tabelle]]
- Accesso e migrazioni: [[Architettura/Pattern dati e API|Pattern dati e API]]
- Tabelle per area: ogni nota di area ha la sua sezione "Tabelle"
