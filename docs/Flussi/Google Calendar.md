---
title: Google Calendar
aliases:
  - Sync Google
  - Google Calendar
tags:
  - flusso
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Google Calendar

Sincronizzazione **one-way** app → Google: le attività con data diventano eventi
su un calendario condiviso con un service account. Gli eventi creati in Google
non tornano indietro.

## Configurazione

1. Google Cloud Console: abilita **Google Calendar API**.
2. Crea un service account e scarica la chiave JSON.
3. Condividi il calendario di destinazione con l'email del service account con
   permesso "Apporta modifiche".
4. Imposta in `.env`: `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY`
   (PEM su una riga, con `\n`).
5. In `/calendario` (pannello Google, admin) scegli calendario e finestra, poi
   "Sincronizza ora".

`GOOGLE_DRY_RUN=true` esercita il flusso senza rete.

## Sequenza

1. Creazione/modifica di un'attività → `insertAttivita`/`updateAttivita`.
2. In background `sincronizzaAttivita` decide: insert, update, delete o
   spostamento.
3. L'id evento Google è **derivato** dall'id attività: l'insert è idempotente.
   - `409` sull'insert → `PATCH`;
   - `404/410` sull'update → ricreazione.
4. Esito e errore finiscono in `attivita_google` (stato, tentativi,
   ultimo_errore).
5. La UI mostra gli errori e permette "Riprova gli errori".
6. `riconcilia` (admin) allinea la finestra configurata e smaltisce le tombstone
   `DA_CANCELLARE`.

## Cosa viene sincronizzato

- Solo `attivita` (task/eventi) con data.
- Progetti e ticket **non** sono eventi.
- Le etichette restano locali: Google non le ha.

## Errori e resilienza

- `sincronizzaAttivita` non lancia mai al chiamante: un errore Google non fa
  fallire il salvataggio dell'attività.
- La cancellazione di un progetto con più di 25 attività lascia tombstone e la
  riconciliazione le smaltisce.
- Un errore resta in `attivita_google` finché non viene ritentato.

## Punti d'attenzione

> [!warning] Da sapere
> - La sync è solo app → Google: modifiche fatte in Google vengono sovrascritte
>   alla riconciliazione successiva.
> - Se il calendario non compare nella lista (account Gmail gratuito), la UI
>   accetta l'id scritto a mano.
> - Il pannello Google è dentro `/calendario`, ma la scrittura config/sync è
>   admin-only.

## Dove guardare

- [[Aree/Calendario|Calendario]]
- `lib/google-calendar.ts`, `lib/google-evento.ts`, `lib/google-sync.ts`
- `app/api/google/*`
- [[Riferimenti/Variabili ambiente|Variabili ambiente]]
