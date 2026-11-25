---
title: Calendario
aliases:
  - Calendario
  - Agenda
tags:
  - area/calendario
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Calendario

Calendario condiviso di eventi e task: attività di progetto, eventi con cliente,
eventi generici. Viste giorno/settimana/mese/agenda, drag&resize e sync
**una direzione** verso Google Calendar.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Pagina calendario | `app/calendario/page.tsx` |
| Pannello laterale e filtri | `components/calendario/PannelloCalendario.tsx`, `FiltriAvanzati.tsx` |
| Vista settimana/giorno | `VistaSettimanaOraria.tsx`, `VistaGiorno.tsx`, `ColonnaGiorno.tsx` |
| Editor evento | `PopoverEvento.tsx`, `EventoGriglia.tsx` |
| Drag/resize | `components/calendario/useTrascinamentoEvento.ts` |

## API

| Route | Metodi |
| --- | --- |
| `/api/calendario` | GET eventi per `dal`/`al`, filtri progetto/cliente/stato/etichetta |
| `/api/attivita` | GET eventi senza progetto, POST |
| `/api/attivita/[id]` | PATCH, DELETE |
| `/api/etichette` + `[id]` | CRUD etichette |
| `/api/google/stato`, `/config`, `/calendari`, `/verifica`, `/sync` | stato e gestione Google |

## Dati e logica

- `lib/calendario.ts` — funzioni pure: viste, range, settimana da lunedì,
  griglia mese da 42 celle, raggruppamento per giorno.
- `lib/calendario-griglia.ts` — matematica oraria: clipping per giorno, packing
  sovrapposizioni, drag/resize, limiti.
- `lib/calendario-form.ts` — ponte evento ↔ form completo ↔ popover compatto.
- `lib/google-evento.ts` — payload Google, inizio/fine, id evento derivato.
- `lib/google-calendar.ts` — client service account, token cache, retry.
- `lib/google-sync.ts` — orchestrazione, tombstone, riconciliazione.
- `lib/etichette.ts` — CRUD etichette e pivot `attivita_etichette`.
- Tabelle: `attivita`, `progetti`, `clienti`, `etichette`,
  `attivita_etichette`, `attivita_google`, `impostazioni`.

## Flussi

### Caricamento

La pagina calcola il range della vista → `GET /api/calendario?dal&al` →
`listEventiCalendario` legge le `attivita` con `data_scadenza` nell'intervallo,
join progetto/cliente, etichette in una seconda query.

### Creazione e modifica

Form o popover → `POST /api/attivita` o `PATCH /api/attivita/[id]` →
`insertAttivita`/`updateAttivita` → sync Google in background.

### Drag e resize

UI ottimistica, **un solo PATCH** al rilascio del puntatore; rollback su errore.
Da tastiera `Alt+frecce` con debounce 400 ms e un solo PATCH.

### Etichette

CRUD `/api/etichette`; assegnazione alla task tramite il payload attività;
pivot aggiornata da `setEtichetteAttivita`. Le etichette restano locali: Google
non le riceve.

### Google Calendar

Admin configura mappatura e finestra → "Sincronizza ora" → `riconcilia` →
per ogni attività `sincronizzaAttivita` decide insert/update/delete/spostamento.
Gli errori diventano righe `attivita_google` in `ERRORE` con tentativi e ultimo
errore; la UI permette "Riprova gli errori".

## Permessi

- Calendario, attività ed etichette: qualsiasi operatore autenticato.
- Lettura stato/config Google: tutti; **scrittura config, verifica e sync: solo
  admin** (la UI è dentro il calendario, non in `/admin`).

## Punti d'attenzione

> [!warning] Cose da sapere
> - **I ticket non sono una sorgente del calendario**: gli eventi derivano solo
>   da `attivita`. Anche la `data_fine` del progetto non è un evento.
> - Le date sono stringhe naive `YYYY-MM-DDTHH:mm` (ora di parete), mai UTC.
> - Se `data_inizio` manca o è successiva alla scadenza, l'evento è mostrato
>   come blocco di 1 ora che termina alla scadenza.
> - La vista mese ha sempre 42 celle, settimana da lunedì.
> - Nel form progetto e cliente sono mutuamente esclusivi: vince il progetto.
> - Il popover compatto comprime i multi-giorno; oltre 24h apre il modal completo.
> - Progetto/cliente/stato filtrano lato server; origine/etichetta/persona lato
>   client (un cambio non rifà la fetch).
> - Google usa un id evento derivato dall'id attività: insert idempotente,
>   `409 → PATCH`, `404/410` su update → ricreazione.
> - La cancellazione di un progetto con più di 25 attività lascia tombstone
>   `DA_CANCELLARE` e la riconciliazione le smaltisce.
> - `sincronizzaAttivita` non lancia mai al chiamante: un errore Google non fa
>   fallire il salvataggio.

## Collegamenti

- [[Flussi/Google Calendar|Google Calendar]]
- [[Aree/Progetti|Progetti]] · [[Aree/Admin|Admin]]
- [[Riferimenti/Variabili ambiente|Variabili ambiente]]
