---
title: Chiusura e rapportino
aliases:
  - Chiusura ticket
  - Rapportino
tags:
  - flusso
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Chiusura e rapportino

Cosa succede quando un ticket passa a `CHIUSO`.

## Sequenza

1. L'operatore chiude il ticket: `PATCH /api/tickets/[id]` con `stato=CHIUSO`.
2. `updateTicket` aggiorna stato, date e storico; se il ticket era `IN_CORSO`
   chiude anche `data_fine_lavoro`.
3. La route, se c'è un'email valida, invia in background l'email di chiusura con
   note tecniche e allegati.
4. La route chiama `generaRapportinoDaTicket`.
5. Il rapportino:
   - richiede ticket `CHIUSO`;
   - non sovrascrive un rapportino `confermato`/`esportato`;
   - salva snapshot cliente, attività (sommario + soluzioni note), ore per
     operatore e minuti totali;
   - numero `RAP-<numero ticket senza TICK->`.

## Ore

Ordine di priorità per `minuti_totali`:

1. `tempo_effettivo_minuti` del ticket;
2. somma delle voci `voci_tempo` **chiuse**;
3. `tempo_stimato_minuti`.

Le voci per operatore sono solo quelle chiuse.

## Rigenerazione

- **Automatica**: se un ticket già `CHIUSO` riceve una correzione di
  `tempo_effettivo_minuti`, il rapportino viene aggiornato (solo se non è
  confermato/esportato).
- **Manuale**: `POST /api/rapportini` con `{ ticketId }`.
- **Da UI**: `components/RapportinoDettaglio.tsx` modifica attività, note, ore e
  stato.

## Stati

```
bozza → confermato
confermato → bozza
esportato (non modificabile; percorso non ancora attivo)
```

## Arca

Le colonne `arca_*` sono predisposte; `arca_stato` parte da `da_configurare`.
L'invio non è implementato: il pulsante in UI è disabilitato.

## Punti d'attenzione

> [!warning] Cose da sapere
> - Il rapportino si genera **solo per `CHIUSO`**, non per `RISOLTO`.
> - Il trigger automatico è solo `PATCH /api/tickets/[id]` (e `POST
>   /api/rapportini`): altri percorsi che cambiano stato con `updateTicket` non
>   lo generano.
> - Il totale manuale può non coincidere con la somma delle voci: il totale
>   corretto prevale e la UI lo dice.
> - Eliminare il ticket elimina anche il rapportino.

## Dove guardare

- [[Aree/Rapportini|Rapportini]] · [[Aree/Ticket|Ticket]] · [[Aree/Report ore|Report ore]]
- `lib/rapportini.ts`, `components/RapportinoDettaglio.tsx`
