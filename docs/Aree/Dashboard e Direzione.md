---
title: Dashboard e Direzione
aliases:
  - Dashboard
  - Direzione
  - Cruscotto
tags:
  - area/dashboard
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Dashboard e Direzione

Tre viste diverse, spesso confuse tra loro:

| Vista | Route | Chi | Cosa mostra |
| --- | --- | --- | --- |
| Dashboard operativa | `/` | tutti | ticket, calendario, inbox, task di oggi |
| Direzione | `/direzione` | solo admin | squadra, presenze, SLA, carichi, trend |
| Cruscotto | `/admin/dashboard` | solo admin | KPI di periodo, trend, qualità triage, consumo AI |

`/operatore` è un redirect permanente a `/` (vecchio percorso).

## Dashboard operativa

- Pagina `app/page.tsx`; sintesi da `GET /api/dashboard`, lista da
  `GET /api/tickets`.
- Per un operatore il filtro ticket parte su "I miei"; l'admin vede tutto.
- Pannelli: ticket, calendario, inbox, task.
- Aggiornamento periodico con `usePolling`.
- Dati in `lib/dashboard.ts`: un solo `db.batchRead`, confini giorno/settimana
  calcolati in **Europe/Rome**.
- KPI: ticket miei/tutti, task in scadenza/ritardo, progetti attivi, minuti
  oggi/settimana.
- La lista team è separata e admin-only.

## Direzione

- Pagina `app/direzione/page.tsx`, API `GET /api/direzione`, polling 30 s.
- Presenza **inferita**, non dichiarata (`lib/direzione.ts`):
  - voce tempo aperta → `al_lavoro`;
  - ultima azione nel registro < 30 min → `attivo`;
  - altrimenti `non_attivo`.
- `db.batchRead` con operatori, voci aperte, minuti oggi/settimana, ticket per
  operatore, task in ritardo, ultimo registro, ticket aperti, inbox da
  verificare, trend 7 giorni.
- SLA calcolato con `valutaSla` (`lib/sla.ts`), ordinamento per SLA/priorità/età.
- KPI squadra: ticket, SLA, tempo, inbox, progetti; i "miei" riusano
  `caricaDashboard`.

## Cruscotto admin

- Pagina `app/admin/dashboard/page.tsx`; API `GET /api/admin/dashboard?da&a`.
- Periodo default mese corrente, preset 30/90 giorni.
- KPI: ticket creati/chiusi, backlog, anzianità media, presa media, risoluzione
  media, % SLA presa/risoluzione, riaperture.
- Trend aperti/chiusi (SVG), barre per modulo e canale, ore per operatore,
  qualità del triage email, consumo token AI.
- L'API fa un `batchRead` con ~12 query e calcola SLA/triage/AI.

> [!warning] Confini giornalieri
> `lib/dashboard.ts` usa esplicitamente `Europe/Rome`, mentre
> `app/api/admin/dashboard/route.ts` costruisce inizio/fine giorno nel fuso del
> processo (in Docker: UTC). I due cruscotti possono contare in modo diverso le
> righe tra mezzanotte e le 2.

## Tabelle e file

| Tabelle | File chiave |
| --- | --- |
| `tickets`, `voci_tempo`, `attivita`, `progetti`, `notifications`, `registro_attivita`, `email_inbox` | `lib/dashboard.ts`, `lib/direzione.ts`, `app/api/dashboard/route.ts`, `app/api/direzione/route.ts`, `app/api/admin/dashboard/route.ts` |

## Collegamenti

- [[Aree/Ticket|Ticket]] · [[Aree/Report ore|Report ore]] · [[Aree/Email e Inbox|Email e Inbox]]
- [[Architettura/Autenticazione e ruoli|Autenticazione e ruoli]]
