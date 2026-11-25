---
title: Questionario pubblico
aliases:
  - Questionario
  - Questionari
tags:
  - area/questionario
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Questionario pubblico

Questionario conoscitivo inviato al cliente con un **link pubblico e token
monouso**. Le risposte alimentano la scheda cliente e l'inventario IT.

## Pagine e API

| Cosa | Dove |
| --- | --- |
| Form pubblico (senza login) | `app/questionario/page.tsx` |
| Gestione per cliente | `app/clienti/[id]/page.tsx` → `components/clienti/QuestionariPanel.tsx` |
| API pubblica | `GET/POST /api/questionario` |
| API admin | `GET/POST /api/clienti/[id]/questionari`, `DELETE .../[questionarioId]` |

## Dati e logica

- `lib/questionari.ts` — creazione token/link, invio email, lookup, salvataggio,
  annullamento.
- `lib/questionari-schema.ts` — schema fisso, `risposteVuote()`, validazione.
- `lib/email-templates.ts` — template email del questionario.
- Tabelle: `questionari` (token **hash**, stato, titolo, messaggio,
  destinatario, scadenza, esiti invio) e `questionari_risposte` (JSON completo +
  colonne chiave: `n_computer`, `n_server`, `arca_versione`, `arca_licenze`,
  `n_software`, `nps`, `consenso_privacy`).

## Flusso

1. L'admin crea il questionario per un cliente.
2. Token casuale 24 byte; nel DB solo hash SHA-256. Scadenza default 30 giorni
   (1-365). Link `APP_BASE_URL/questionario?token=...`.
3. Se `inviaEmail` e destinatario presenti, parte l'email; lo stato diventa
   `inviato` solo se l'invio riesce.
4. Il cliente apre il link: `GET /api/questionario?token=` valida hash, stato e
   scadenza; espone solo azienda, titolo, messaggio, stato, scadenza.
5. Compilazione: `POST` con token+risposte. Validazione severa (referente
   obbligatorio, email valida se presente, consenso privacy obbligatorio, testi
   troncati, numeri limitati).
6. Salvataggio: una sola risposta per questionario (PK su
   `questionari_risposte.questionario_id`), stato `compilato`, notifica
   broadcast e registro con origine `api`.
7. Annullamento: solo se non compilato.

## Permessi

- Form e API pubblica: nessuna sessione. Protezione = token non indovinabile,
  scadenza, hash, consenso privacy, rate limit.
- Creazione/elenco/annullamento: **solo admin**.

## Punti d'attenzione

> [!warning] Limiti noti
> - Il token è **di fatto monouso**: dopo la compilazione non si riapre. Per un
>   nuovo invio bisogna creare un altro questionario.
> - Il link completo non è recuperabile dopo la creazione (solo hash nel DB):
>   va conservato o si rigenera il questionario.
> - La notifica di compilazione è broadcast (a tutti).
> - `n_software` è il numero di righe dell'inventario, non una quantità
>   dichiarata.
> - Il rate limit è in memoria (20/min per IP+token), non distribuito.
> - Non esiste un "rinvia email" per un questionario esistente.

## Collegamenti

- [[Aree/Clienti|Clienti]]
- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]] · [[Modello dati/Tabelle|Tabelle]]
