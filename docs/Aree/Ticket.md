---
title: Ticket
aliases:
  - Ticket
  - Assistenza
tags:
  - area/ticket
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Ticket

Il cuore dell'app: gestione completa del ticket di assistenza, dalla creazione
alla chiusura con rapportino.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Dettaglio pagina | `app/tickets/[id]/page.tsx` → `components/TicketPage.tsx` |
| Assistente AI nel ticket | `components/AssistenteTicket.tsx` |
| Lista ticket | dashboard `/` e altre viste che usano `lib/tickets.ts` |
| SLA admin | `app/admin/sla/page.tsx` |

## API

| Route | Metodi | Note |
| --- | --- | --- |
| `/api/tickets` | GET, POST | lista filtrabile; creazione |
| `/api/tickets/[id]` | GET, PATCH, DELETE | dettaglio+SLA; cambio stato; delete admin |
| `/api/tickets/[id]/messages` | POST | messaggio in conversazione |
| `/api/tickets/[id]/notes` | POST | nota tecnica |
| `/api/tickets/[id]/notes/[noteId]` | PATCH, DELETE | modifica; delete admin |
| `/api/tickets/[id]/notes/[noteId]/send-email` | POST | invio nota al cliente |
| `/api/tickets/[id]/email` | GET, POST | log email; invio manuale |
| `/api/tickets/[id]/assistente` | POST | riassunto/bozza/nota + ticket simili |
| `/api/uploads`, `/api/uploads/[id]` | POST, GET, DELETE | allegati |
| `/api/tempi*` | GET, POST, PATCH, DELETE | cronometro |

## Dati e logica

- `lib/tickets.ts` — CRUD, numerazione `TICK-%06d`, storico stati, contatti,
  eliminazione.
- `lib/sla.ts` — calcolo SLA su **minuti lavorativi** (orario, pausa, festivi).
- `lib/sla-config.ts` — configurazione in `impostazioni.sla_config`.
- `lib/allegati.ts` — whitelist MIME, nomi sanitizzati.
- `lib/email.ts` + `lib/email-templates.ts` + `lib/email-log.ts` — invio e log.
- `lib/rapportini.ts` — generazione alla chiusura.
- Tabelle: `tickets`, `messages`, `technical_notes`, `allegati`,
  `tickets_storico_stati`, `email_log`, `voci_tempo`, `rapportini`,
  `notifications`, `registro_attivita`.

## Flussi

### Creazione

`POST /api/tickets` valida cliente/sommario/descrizione, estrae email e telefono
dal testo (`lib/contatti.ts`), genera id e numero. `createTicket` fa un batch:
contatore + ticket + primo messaggio + storico. Poi notifica e, se c'è
un'email valida, autorisposta (registrata in `email_log`).

### Presa in carico

`PATCH` con `stato=IN_CORSO`; se manca l'operatore, il server assegna quello
della sessione. La transizione imposta `data_inizio_lavoro` e
`preso_in_carico_il` con `COALESCE`.

### Note tecniche ed email

La nota ha `titolo` e `soluzione` obbligatori. Dopo la creazione la UI propone
di inviare al cliente un testo "cliente-friendly": l'invio passa da
`send-email`, allega i file della nota e usa la casella che ha ricevuto la mail
del ticket.

### Cambio stato ed email automatiche

Dopo un `PATCH` con `stato`, in background:

| Transizione | Email |
| --- | --- |
| `NUOVO → IN_CORSO` | presa in carico |
| `→ CHIUSO` | chiusura con note tecniche e allegati |
| altri stati | nessuna email |

Le email automatiche si possono sospendere con
`EMAIL_AUTOMATICHE_DISATTIVATE=true`; quelle manuali restano attive.

### Chiusura

Il `PATCH` che porta a `CHIUSO` (o che corregge le ore di un ticket già chiuso)
chiama `generaRapportinoDaTicket`. Vedi [[Flussi/Chiusura e rapportino|Chiusura e rapportino]].

### Allegati

Upload max 10 MB, MIME derivato dall'estensione, salvataggio in
`uploads/<uuid>.<ext>`. Download con MIME ricalcolato e CSP sandbox.
Eliminazione solo admin.

### SLA

Obiettivi per priorità in minuti lavorativi (default: ALTA 60/480, MEDIA
240/1440, BASSA 480/2880). La presa e la risoluzione sono calcolate con
`valutaSla`; "in scadenza" entro 120 minuti. Config solo admin.

## Permessi

- Lettura e modifica: qualsiasi operatore autenticato (nessun filtro di
  ownership sul dettaglio).
- Lista default non-admin: propri ticket + `NUOVO` non assegnati.
- `DELETE` ticket/nota/allegato e configurazione SLA: solo admin.
- Creazione broadcast notification: solo admin.

## Punti d'attenzione

> [!warning] Comportamenti non ovvi
> - Un ticket chiuso **non è immutabile lato API**: la UI disabilita i
>   controlli, ma `PATCH` accetta modifiche e può riaprirlo.
> - `PATCH/DELETE` di una nota usano solo `noteId` e **non verificano** che la
>   nota appartenga al ticket nell'URL.
> - Un non-admin che passa `operatore=TUTTI` vede i ticket di tutti: il default
>   è "miei + non assegnati", ma il parametro esplicito apre.
> - Il canale `telefono` è ammesso dal tipo ma non viene mai impostato; la UI
>   non mostra il canale.
> - `tickets_storico_stati` è scritto ma non esposto in UI/API: serve al tasso
>   di riapertura del cruscotto.
> - Gli allegati ricevuti via email (`allegati_messaggi`) non hanno download.
> - Alla chiusura `tempo_stimato_minuti` è calcolato da `data_inizio_lavoro` e
>   adesso, non dalle voci del cronometro; il rapportino privilegia
>   `tempo_effettivo`, poi le voci, poi lo stimato.
> - Il rapportino si genera solo per `CHIUSO`, non per `RISOLTO`.

## Collegamenti

- [[Flussi/Email a ticket|Email a ticket]] · [[Flussi/Chiusura e rapportino|Chiusura e rapportino]]
- [[Aree/Report ore|Report ore]] · [[Aree/Rapportini|Rapportini]]
- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]] · [[Modello dati/Panoramica e ER|Modello dati]]
