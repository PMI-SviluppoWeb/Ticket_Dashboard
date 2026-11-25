---
title: Rapportini
aliases:
  - Rapportini
  - Rapportino
tags:
  - area/rapportini
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Rapportini

Documento di chiusura ticket: snapshot del cliente, dati ticket, attività
svolta, ore per operatore, note e stato. Predisposto per l'invio ad Arca, non
ancora attivo.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Elenco | `app/rapportini/page.tsx` |
| Dettaglio | `app/rapportini/[id]/page.tsx` (server) → `components/RapportinoDettaglio.tsx` |
| Formattazione | `components/rapportini/formato.ts` |

## API

| Route | Metodi | Note |
| --- | --- | --- |
| `/api/rapportini` | GET, POST | elenco; genera/rigenera da `{ ticketId }` |
| `/api/rapportini/[id]` | GET, PATCH, DELETE | PATCH contenuto/stato; DELETE admin |
| `/api/tickets/[id]` | PATCH | trigger principale di generazione |

## Dati e logica

- `lib/rapportini.ts` — modello, letture, generazione, aggiornamento.
- `lib/tickets.ts` — `getTicket`/`updateTicket`; alla cancellazione del ticket
  elimina anche il rapportino.
- `lib/clienti.ts` — risoluzione e snapshot cliente.
- Tabelle: `rapportini`, `tickets`, `clienti`, `voci_tempo`,
  `technical_notes`, `registro_attivita`.

## Flussi

### Generazione

1. `PATCH /api/tickets/[id]` con `stato=CHIUSO` (stato precedente diverso) →
   `updateTicket` → `generaRapportinoDaTicket`.
2. Se il ticket è già `CHIUSO` e arriva `tempo_effettivo_minuti`, il rapportino
   viene rigenerato/aggiornato.
3. Generazione manuale: `POST /api/rapportini` con `ticketId`; richiede ticket
   `CHIUSO`.

### Contenuto

- **Snapshot cliente**: ragione sociale, P.IVA, indirizzo, città, provincia,
  CAP, email, telefono. Non è un join: resta com'era alla generazione.
- **Attività iniziale**: sommario del ticket + soluzioni delle note tecniche.
- **Ore**: solo voci `voci_tempo` **chiuse**, raggruppate per operatore.
- **Minuti totali**: prima `tempo_effettivo_minuti`; altrimenti somma voci;
  altrimenti `tempo_stimato_minuti`.
- Numero: `RAP-<numero ticket senza TICK->`.
- La placeholder `sconosciuto@placeholder.it` viene azzerata.

### Stati

`bozza → confermato`; da `confermato` si può tornare `bozza`. `esportato` non è
modificabile. `esportato`/`errore` esistono nello schema ma non hanno un
percorso applicativo che li imposta.

### Arca

Colonne `arca_stato`, `arca_riferimento`, `arca_inviato_il`, `arca_errore`;
default `da_configurare`; pulsante "Invia ad Arca" disabilitato.

## Permessi

- Lettura e modifica: qualsiasi operatore autenticato.
- Eliminazione: **solo admin**.

## Punti d'attenzione

> [!warning] Da sapere
> - La generazione automatica è agganciata **solo** a `PATCH /api/tickets/[id]`
>   e a `POST /api/rapportini`. Altri percorsi che cambiano stato con
>   `updateTicket` non la attivano.
> - Un rapportino `confermato`/`esportato` non viene sovrascritto.
> - `minuti_totali` può non coincidere con la somma delle voci mostrate: la UI
>   avvisa che il totale corretto prevale sul dettaglio.
> - Si genera solo per `CHIUSO`, non per `RISOLTO`.
> - La stampa/PDF usa `window.print()`.

## Collegamenti

- [[Flussi/Chiusura e rapportino|Chiusura e rapportino]]
- [[Aree/Ticket|Ticket]] · [[Aree/Report ore|Report ore]] · [[Aree/Clienti|Clienti]]
