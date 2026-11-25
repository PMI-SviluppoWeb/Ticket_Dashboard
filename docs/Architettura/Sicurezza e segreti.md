---
title: Sicurezza e segreti
aliases:
  - Sicurezza
tags:
  - architettura
  - sicurezza
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Sicurezza e segreti

## Header e browser

`next.config.mjs` imposta per tutte le risposte:

- CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`);
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` restrittiva.

## Credenziali

| Segreto | Come è protetto |
| --- | --- |
| Password operatori | PBKDF2-SHA256 600k, confronto a tempo costante, rehash trasparente |
| Sessioni | JWT HS256 firmato con `JWT_SECRET`, cookie HttpOnly/SameSite |
| Password caselle IMAP/SMTP | AES-256-GCM con `ENCRYPTION_KEY` (`lib/cifratura.ts`) |
| Refresh token Gmail | AES-256-GCM |
| Chiavi API macchina | Nel DB solo hash SHA-256 + prefisso; in chiaro mostrate una volta |
| Token questionari | Nel DB solo hash SHA-256; link mostrato solo alla creazione |
| Webhook email | `x-webhook-secret` con confronto timing-safe, fail-closed in produzione |

> [!warning] `ENCRYPTION_KEY`
> Serve per cifrare le credenziali delle caselle email. Cambiarla rende
> illeggibili le password già salvate: il form caselle si disabilita se manca.

## Upload e allegati (`lib/allegati.ts`)

- MIME derivato **solo dall'estensione** su una whitelist chiusa; il MIME del
  client viene ignorato.
- Max 10 MB.
- Nome file sanitizzato (niente percorsi o caratteri di controllo), salvato
  come `uploads/<uuid>.<ext>`.
- Download: MIME ricalcolato, `Content-Disposition`, `nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, `no-store`.
- SVG non è mai inline; PDF/PNG/JPG/GIF/WEBP sì.
- Eliminazione allegato: solo admin.

## Chiavi API macchina (`lib/chiavi-api.ts`)

- Formato `tk_` + 32 byte casuali; nel DB hash + prefisso.
- Ambiti: `tickets:read`, `tickets:write`, `clienti:read`.
- Rate limit 120 richieste/minuto per chiave (in memoria).
- Idempotenza su `POST /api/esterni/v1/tickets` con `Idempotency-Key`.

## Prompt injection e contenuti non fidati

- Il contesto ticket/cliente passato agli agenti delimita descrizione e messaggi
  come **contenuto non fidato** (`lib/agenti-contesto.ts`).
- Il triage email istruisce il modello a trattare tentativi di injection come
  testo.
- Gli agenti con ruolo `assistente` che leggono contenuti clienti non possono
  usare Hermes (solo OpenRouter, con `data_collection: "deny"`).

## Rate limit

| Ambito | Limite | Storage |
| --- | --- | --- |
| Login | 5 tentativi / 15 min per email+IP | DB (`tentativi_login`) |
| API macchina | 120 richieste / min per chiave | memoria del processo |
| Questionario pubblico | 20 richieste / min per IP+token | memoria del processo |

> [!info] Un solo processo
> I rate limit in memoria assumono una singola istanza. In un deploy multi-istanza
> non sono globali.

## Dati in chiaro

Sono memorizzati in chiaro (per necessità operative): contenuti dei ticket e
delle email, testi delle conversazioni agenti, allegati nel volume `uploads`.
Il registro attività è progettato per non contenere segreti, ma è una
convenzione, non un filtro automatico.

## Segreti e git

`.gitignore` esclude `.env`, `.env*.local`, uploads, backup, output graphify e
chiavi di servizio (`hermes-gmail-*.json`, `*-service-account*.json`).
Gli esempi `.env.example` / `.env.docker.example` sono versionati e contengono
solo nomi e valori fittizi.

## Punti d'attenzione

> [!warning] Da tenere d'occhio
> - `ALLOWED_ORIGINS` nel middleware elenca la porta 3000, l'app gira su 3001.
> - `GET /api/agenti/[id]/esecuzioni` non filtra per operatore: chi può usare un
>   agente di libreria vede le esecuzioni di tutti per quell'agente.
> - `GET /api/tempi/bersaglio` non chiama `richiediOperatore`: è protetta solo
>   dal middleware (firma/scadenza JWT, non `attivo`/`versione_sessione`).
> - Il download degli allegati arrivati via email (`allegati_messaggi`) non ha
>   ancora un endpoint.

## Collegamenti

- [[Architettura/Autenticazione e ruoli|Autenticazione e ruoli]]
- [[Flussi/API macchina Hermes|API macchina Hermes]]
- [[Aree/Questionario pubblico|Questionario pubblico]]
