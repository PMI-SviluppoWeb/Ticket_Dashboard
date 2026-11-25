---
title: Report ore
aliases:
  - Report
  - Ore
  - Cronometro
tags:
  - area/report
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Report ore

Ore per fatturazione, aggregate per cliente/operatore/periodo, e cronometro
globale agganciabile a ticket, task o tempo generico.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Report ore (admin) | `app/report/page.tsx` |
| Cronometro header | `components/CronometroHeader.tsx` |
| Cifra live | `components/CronometroLive.tsx` |
| Timer su task/ticket | `components/TimerBersaglio.tsx` |
| Stato globale timer | `components/TempiContext.tsx` |

## API

| Route | Metodi | Note |
| --- | --- | --- |
| `/api/report/ore` | GET | `format=csv` per export; admin-only |
| `/api/tempi` | GET, POST | voce aperta + ultime voci; `?attivita_minuti=`, `?progetto=` |
| `/api/tempi/[id]` | PATCH, DELETE | ferma; elimina voce chiusa |
| `/api/tempi/bersaglio` | GET | voci di una task o ticket |

## Dati e logica

- `lib/report-ore.ts` — query, aggregazione e CSV (BOM UTF-8, `;` per Excel IT).
- `lib/durata.ts` — formattazione durate, totali, avviso timer dimenticato.
- `lib/tempi.ts` — CRUD `voci_tempo`; una sola voce aperta per operatore;
  totali per task/progetto; voci orfane.
- Tabelle: `voci_tempo`, `attivita`, `tickets`, `progetti`,
  `progetti_tickets`, `clienti`, `operatori`.

## Flussi

### Cronometro

- `POST /api/tempi`: non si possono passare insieme `attivita_id` e
  `ticket_id`. `avviaVoce` chiude l'eventuale voce aperta dello stesso operatore
  e inserisce la nuova in un batch.
- `PATCH /api/tempi/[id]`: ferma la voce (idempotente se già chiusa).
- `DELETE /api/tempi/[id]`: solo voce chiusa e solo del proprietario.
- Il timer vive in `AppShell`, quindi continua cambiando pagina. Sulla pagina
  Progetti è montato esplicitamente perché usa un header proprio.

### Totali

- `GET /api/tempi?attivita_minuti=<progetto_id>`: minuti **solo chiusi** per
  task, in una query aggregata.
- `GET /api/tempi?progetto=<id>`: attività del progetto + ticket collegati.

### Report

`GET /api/report/ore?da&a&cliente&operatore` legge le voci, risolve
cliente/progetto/bersaglio con LEFT JOIN, filtra per data locale, aggrega per
cliente e operatore. Le voci aperte contano fino ad adesso e sono marcate
"in corso". Il CSV contiene tutte le righe; la UI ne mostra 300.

## Permessi

- Report: **solo admin** (pagina e API).
- Cronometro e letture: qualsiasi operatore; ognuno vede/ferma/elimina solo le
  proprie voci.
- Totali per progetto/task: leggibili da tutti gli autenticati.
- `GET /api/tempi/bersaglio` non chiama `richiediOperatore`: è protetta solo dal
  middleware (firma/scadenza JWT).

## Punti d'attenzione

> [!warning] Report ≠ minuti lavorativi
> `reportOre` misura il tempo **reale** tra inizio e fine (o fino ad adesso).
> I minuti lavorativi (orario d'ufficio, pausa, festivi) vivono in `lib/sla.ts`
> e alimentano SLA e cruscotto. Non sono la stessa cosa.

> [!warning] Altri limiti
> - Le voci **aperte** entrano nel totale del report: non c'è un'opzione "solo
>   chiuse".
> - Il cliente è risolto a cascata (attività → progetto attività → progetto
>   ticket → `ticket.cliente`) e il filtro è un match esatto sulla ragione
>   sociale risolta, non un id.
> - `progetti_tickets` può duplicare righe se un ticket è collegato a più
>   progetti: verificare i totali in quel caso.
> - La finestra SQL è larga ±1 giorno e il filtro preciso è in JS per rispettare
>   la data locale.
> - Una sola voce aperta per operatore è una regola applicativa, non un vincolo
>   DB.
> - Le voci non hanno FK: un bersaglio cancellato lascia la voce e il tempo
>   storico.
> - `formatDurata(0)` restituisce "—", `formatDurataZero(0)` restituisce "0m".

## Collegamenti

- [[Aree/Ticket|Ticket]] · [[Aree/Progetti|Progetti]] · [[Aree/Rapportini|Rapportini]]
- [[Architettura/Pattern dati e API|Pattern dati e API]]
