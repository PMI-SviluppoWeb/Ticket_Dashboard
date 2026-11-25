---
title: Progetti
aliases:
  - Progetti
  - Kanban progetti
tags:
  - area/progetti
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Progetti

Lavori extra-assistenza: anagrafica progetto, cliente, stato, priorità, team,
scadenze, task, ticket collegati e tempi.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Elenco (kanban di default, card) | `app/progetti/page.tsx` |
| Kanban per stato con drag&drop | `components/ProgettiKanban.tsx` |
| Dettaglio progetto | `app/progetti/[id]/page.tsx` → `components/ProgettoPage.tsx` |
| Board task | `components/ProgettoTaskBoard.tsx` |
| Editor task | `components/ProgettoTaskDrawer.tsx` |
| Persone (avatar/popover) | `components/PersoneCondivise.tsx` |

## Kanban

- Le colonne sono **stati reali**: `PIANIFICATO`, `IN_CORSO`, `IN_PAUSA`,
  `COMPLETATO`, `ANNULLATO`.
- Ogni progetto sta in una sola colonna.
- Trascinare una riga su un'altra colonna fa `PATCH { stato }` con aggiornamento
  ottimistico e rollback se il server rifiuta.
- Alternativa da tastiera: frecce sinistra/destra sulla riga focalizzata.
- Limite: i 100 progetti più recenti (il massimo che `/api/progetti` accetta).
- La griglia che va a capo (1 / 2 / 3 colonne) evita colonne troppo strette.

## API

| Route | Metodi |
| --- | --- |
| `/api/progetti` | GET lista paginata, POST crea |
| `/api/progetti/[id]` | GET, PATCH, DELETE |
| `/api/progetti/[id]/attivita` | GET task, POST crea |
| `/api/progetti/[id]/tickets` | GET, POST collega, DELETE scollega |
| `/api/attivita` | GET eventi senza progetto, POST |
| `/api/attivita/[id]` | GET, PATCH, DELETE (con sync Google) |
| `/api/attivita/team` | GET, admin-only |
| `/api/agenti/proposte/*` | proposte agente → progetto |

## Dati e logica

- `lib/progetti.ts` — CRUD, lista, collegamenti ticket, stati, codice
  `PRG-<ultime 6 cifre timestamp>`.
- `lib/progetto-card.ts` — modulo puro per le card: percentuale, tinta stabile,
  progetto "in evidenza".
- `lib/attivita.ts` — CRUD attività + sync Google in background.
- `lib/task-local.ts` — sezioni, sottoattività, commenti (**solo locali**).
- `lib/persone.ts` — primo nome in `responsabile`/`assegnatario`, altri in
  `persone` (JSON), max 10.
- Tabelle: `progetti`, `attivita`, `progetti_tickets`, `attivita_google`,
  `voci_tempo`, `agenti_proposte`.

## Flussi

### Creazione

Modale → `POST /api/progetti` → validazione → `insertProgetto` → ricarica
lista/kanban.

### Persone

`PersoneCondivise` → `componiPersone` → `PATCH { responsabile, persone }` con
aggiornamento ottimistico e rollback.

### Task

`POST /api/progetti/[id]/attivita` → `insertAttivita` → sync Google in
background. Ogni modifica successiva passa da `PATCH /api/attivita/[id]`.

### Ticket collegati

Ricerca ticket → `POST /api/progetti/[id]/tickets`; il doppione è bloccato dal
vincolo UNIQUE e restituito come `409`.

### Proposta agente

Una proposta creata dal Copilot diventa progetto + attività solo dopo
approvazione umana. Vedi [[Flussi/Proposta agente a progetto|Proposta agente a progetto]].

### Eliminazione

`deleteProgetto` cancella le attività passando da `deleteAttivita` (così Google
resta allineato) sotto le 25 attività; sopra soglia lascia tombstone
`DA_CANCELLARE` e la riconciliazione le smaltisce. Poi elimina collegamenti e
progetto in batch.

## Permessi

> [!warning] Nessun controllo di ruolo
> L'area Progetti è aperta a **qualsiasi operatore autenticato**: leggere,
> creare, modificare ed eliminare. Solo `/api/attivita/team` è admin-only.
> Le proposte sono visibili all'autore; l'admin vede tutte.

## Punti d'attenzione

> [!warning] Cose da sapere
> - **Sezioni, sottoattività, commenti e ticket "della task" sono solo stato
>   locale**: si perdono al refresh. Le sezioni non hanno una tabella DB.
> - Due creazioni nello stesso millisecondo possono collidere sul codice `PRG-…`.
> - Nel dettaglio il "Responsabile" è testo libero, mentre la creazione usa una
>   combobox operatori: possibile divergenza.
> - La percentuale è `null` con zero attività, non `0%`.
> - La stima "giorni lavorativi" esclude solo sabato/domenica, non i festivi.
> - Il dettaglio somma due fonti di tempo: minuti dei ticket e voci `voci_tempo`,
>   mostrate separate perché non omogenee.
> - Persone salvate come **nomi**, non id: rinominare un operatore non aggiorna
>   i riferimenti.
> - `PropostaProgettoCard` nel Copilot può approvare senza passare dal dettaglio;
>   se manca il cliente, l'approvazione fallisce.

## Collegamenti

- [[Flussi/Proposta agente a progetto|Proposta agente a progetto]] · [[Flussi/Google Calendar|Google Calendar]]
- [[Aree/AI e Agenti|AI e Agenti]] · [[Aree/Clienti|Clienti]]
- [[Modello dati/Panoramica e ER|Modello dati]]
