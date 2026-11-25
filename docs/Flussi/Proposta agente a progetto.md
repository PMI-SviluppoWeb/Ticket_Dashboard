---
title: Proposta agente a progetto
aliases:
  - Proposta progetto
  - Approvazione proposta
tags:
  - flusso
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Proposta agente a progetto

L'agente AI non scrive progetti: **propone**. La creazione avviene solo dopo
l'approvazione umana.

## Sequenza

1. L'operatore chiede al Copilot di trasformare una richiesta in progetto/task
   (spesso partendo da un ticket).
2. L'agente chiama il tool `proponi_progetto_con_task` con un payload:
   progetto, cliente, priorità, attività.
3. `creaProposta` valida il payload (`lib/proposte-schema.ts`) e scrive una riga
   in `agenti_proposte` con stato `in_attesa`.
4. Il Copilot ricarica le proposte della conversazione e mostra la card
   `PropostaProgettoCard`.
5. L'umano può:
   - **modificare** (pagina `/agenti/proposte/[id]`: cliente, progetto,
     attività, priorità, date, assegnatari);
   - **approvare**;
   - **rifiutare**.
6. Approvazione (`approvaProposta`):
   - richiede un cliente;
   - crea progetto `PIANIFICATO` e attività `DA_FARE` in blocco;
   - imposta proposta `approvata` e `progetto_id`;
   - notifica il proponente.
7. Rifiuto: proposta `rifiutata` + notifica.

## Validazione del payload

- Nome progetto obbligatorio.
- Max **30 attività**.
- Date `YYYY-MM-DDTHH:mm`.
- Priorità ammesse.
- Max **20 persone**.

## Permessi

- Admin: vede e gestisce tutte le proposte.
- Operatore: vede solo le proprie; può approvare/rifiutare solo le proprie.
- Modifica consentita solo se `in_attesa`.

## Perché è sicuro

- Il tool è l'unico strumento "operativo" dell'agente e **non scrive** nel
  dominio: scrive una proposta.
- L'approvazione è un atto umano esplicito.
- L'agente può comunque sbagliare cliente o attività: la pagina di dettaglio
  esiste proprio per correggere prima di approvare.

## Punti d'attenzione

> [!warning] Da sapere
> - `PropostaProgettoCard` nel Copilot può approvare senza passare dal
>   dettaglio: se manca il cliente l'approvazione fallisce.
> - L'agente deve usare OpenRouter (con tools); Hermes non riceve i tool.
> - Le proposte non sono modificabili dopo l'approvazione/rifiuto.

## Dove guardare

- [[Aree/AI e Agenti|AI e Agenti]] · [[Aree/Progetti|Progetti]]
- `lib/proposte.ts`, `lib/proposte-schema.ts`, `lib/agenti-tools.ts`
- Pagine: `app/agenti/proposte/`, `app/agenti/proposte/[id]/page.tsx`
