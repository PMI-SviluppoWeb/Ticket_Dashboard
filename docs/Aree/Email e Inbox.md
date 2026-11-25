---
title: Email e Inbox
aliases:
  - Email
  - Inbox
  - Posta in arrivo
tags:
  - area/email
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Email e Inbox

Ricezione multi-casella (IMAP e Gmail OAuth), triage automatico, coda umana
"Da verificare", aggancio ai ticket.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Posta in arrivo | `app/inbox/page.tsx` |
| Dettaglio email | `components/InboxDettaglio.tsx` |
| Configurazione caselle | `app/admin/email/page.tsx` |
| Accessi per operatore | `components/caselle/AccessiCasellaPanel.tsx` |

Tab inbox: **Da verificare / Ticket / Ignorate / Errori**. Un operatore vede solo
le email delle caselle che gli sono assegnate; l'admin vede tutto.

## API

| Route | Metodi |
| --- | --- |
| `/api/hooks/email` | POST (webhook worker) |
| `/api/inbox` | GET lista |
| `/api/inbox/[id]` | GET dettaglio |
| `/api/inbox/[id]/azione` | POST `crea_ticket`, `aggancia`, `ignora`, `recupera` |
| `/api/caselle` + `[id]` | CRUD caselle (admin) |
| `/api/caselle/[id]/test`, `/poll`, `/accessi` | admin |
| `/api/caselle/visibili`, `/scopri` | visibili: tutti; scopri: admin |
| `/api/gmail/connect`, `/api/gmail/callback` | OAuth |
| `/api/impostazioni/email-interni` | admin |

## Dati e logica

- `lib/imap-worker.ts` — polling IMAP, cursore UID, backoff, webhook.
- `lib/gmail-worker.ts` — polling Gmail, segna letto solo dopo il webhook.
- `lib/gmail-oauth.ts` — OAuth PKCE, refresh token, Gmail API, invio MIME.
- `lib/caselle.ts` — CRUD caselle, credenziali cifrate, visibilità.
- `lib/email-classifier.ts` — regole deterministiche + triage AI + fallback.
- `lib/threading.ts`, `lib/email-headers.ts` — aggancio risposte.
- `lib/email-interni*.ts` — mittenti interni.
- Tabelle: `email_inbox`, `caselle_email`, `caselle_operatori`, `tickets`,
  `messages`, `allegati_messaggi`, `email_log`, `impostazioni`.

## Flussi

### IMAP

Ogni ciclo legge le caselle `tipo='imap'`, si connette, imposta un cursore UID
persistente al primo poll e processa solo gli UID successivi. Marca `\Seen`
dopo l'elaborazione e **non avanza oltre un UID fallito** (lo ritenta).
Supporta UIDVALIDITY, backoff e riconnessione.

### Gmail

Legge le caselle `tipo='gmail'` con `is:unread after:<epoch>`, scarica
`format=raw`, parsa con PostalMime, POSTa al webhook e **solo dopo il successo**
rimuove `UNREAD`.

### Webhook (`app/api/hooks/email/route.ts`)

1. Verifica `x-webhook-secret` (timing-safe, fail-closed in produzione).
2. Deduplica su `email_inbox.message_id`; una riga `errore` può essere ritentata.
3. Mittenti interni: se nel thread di un ticket aggiungono un messaggio
   `assistant`, altrimenti vengono ignorati e registrati.
4. Threading: cerca `Message-ID` in `email_log`/`email_inbox`, poi il token
   `[TICK-xxxx]` solo se il mittente coincide col ticket (o se interno).
5. Se trova un ticket chiuso/risolto, lo riapre a `IN_CORSO` e notifica.
6. Triage: regole sugli header, poi AI su OpenRouter con JSON validato e
   fallback prudente; decisione `ticket | da_verificare | ignora` in base alla
   soglia della casella.
7. Un cliente in anagrafica non viene mai scartato in silenzio: da "ignora"
   passa a "da_verificare".
8. Creazione ticket `canale=email` con primo messaggio = corpo email, allegati
   in `allegati_messaggi`, notifica e autorisposta nello stesso thread.

### Azioni umane

| Azione | Effetto |
| --- | --- |
| `crea_ticket` | crea ticket canale email, priorità MEDIA, note con esito AI |
| `aggancia` | aggiunge il messaggio a un ticket (id o `TICK-…`) e riapre se chiuso |
| `ignora` | stato `ignorata`, triage `ignora`, correzione umana |
| `recupera` | riporta a `da_verificare` |

### Caselle

Password/refresh token cifrati AES-GCM e mai esposti dall'API. Una sola casella
predefinita. Gmail si collega via OAuth PKCE con `prompt=consent` per ottenere
sempre un refresh token.

## Permessi

- Inbox: operatore solo per le caselle assegnate; admin tutto. Le email storiche
  senza `casella_id` sono visibili solo all'admin. Il dettaglio non accessibile
  risponde `404`.
- CRUD caselle, test, poll, accessi, mittenti interni: **solo admin**.
- `/api/caselle/visibili`: tutti, senza host/credenziali.

## Punti d'attenzione

> [!warning] Limiti noti
> - `triage_osservazione` è salvato e restituito ma **non partecipa alla
>   decisione**: l'esito AI vale sempre.
> - Esistono due colonne di stato: `email_inbox.stato` (vincolo storico) e
>   `stato_triage` (usato dalla UI con fallback).
> - Gli allegati email sono salvati in `allegati_messaggi` ma **non c'è un
>   endpoint di download**.
> - L'IMAP cerca tutti gli UID > cursore, non solo i non letti: così non perde
>   mail lette da altri client.
> - Il rate limit di questionario/API macchina è in memoria; solo il login è su DB.
> - CORS: il middleware consente `localhost:3000`, l'app gira su `3001`.

## Collegamenti

- [[Flussi/Email a ticket|Email a ticket]]
- [[Aree/Ticket|Ticket]] · [[Aree/Admin|Admin]]
- [[Architettura/Runtime e processi|Runtime e processi]] · [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
