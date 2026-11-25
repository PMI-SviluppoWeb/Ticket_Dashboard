---
title: Autenticazione e ruoli
aliases:
  - Auth
  - Ruoli
tags:
  - architettura
  - sicurezza
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Autenticazione e ruoli

## Modello

- Due ruoli: **`admin`** e **`operatore`** (`lib/auth.ts`, CHECK in `lib/db.ts`).
- Sessione = **JWT HS256** firmato con `JWT_SECRET`, salvato nel cookie
  `session` (`httpOnly`, `sameSite=lax`, `secure` su HTTPS, 7 giorni).
- Le pagine sono protette dal **middleware**; le API fanno un controllo più
  forte con `richiediOperatore()`.

## Flusso di login

1. `POST /api/auth/login` valida email/password.
2. Rate limit: 5 tentativi falliti per `email|IP`, blocco 15 minuti
   (tabella `tentativi_login`).
3. Password verificata con **PBKDF2-SHA256 600.000 iterazioni**; hash legacy a
   100k vengono ricalcolati al login.
4. Creato il JWT con `operatorId`, `email`, `ruolo`, `versione_sessione`.
5. Redirect: admin → `/direzione`, operatore → `/`; il parametro `redirect` è
   sanitizzato contro open redirect (`lib/redirect.ts`).

## Middleware (`middleware.ts`)

- Elenco **esplicito** di path pubblici: login, questionario, webhook email,
  callback Gmail, `/api/auth/*`.
- `/api/esterni/*` è pubblico a livello middleware: l'autenticazione è la
  **chiave API** (vedi [[Flussi/API macchina Hermes|API macchina Hermes]]).
- Tutto il resto: senza cookie valido → API `401`, pagine redirect a `/login`.
- Non emette più header fidati `x-operator-*`: ogni route rilegge la sessione
  dal database.

## `richiediOperatore()` (`lib/auth.ts`)

È il guard delle API. Oltre a verificare la firma del JWT:

1. rilegge l'operatore dal DB;
2. rifiuta se `attivo = 0`;
3. confronta `versione_sessione` (revoca immediata al cambio password o alla
   disattivazione);
4. accetta `{ ruolo: "admin" }` per le route riservate.

## Ruoli e visibilità

- La navigazione è ad **aree** (`lib/nav.ts`): Direzione, Clienti, Report,
  Admin sono `adminOnly`.
- La sidebar mostra solo le aree visibili (`areeVisibili`).
- Lato API le aree riservate ricontrollano il ruolo: non basta nascondere la UI.
- Un operatore può comunque aprire la scheda `/clienti/[id]` (serve dai
  ticket), ma i tab commerciali/questionari sono riservati all'admin.

## Cosa è pubblico

| Path | Protezione |
| --- | --- |
| `/login`, `/api/auth/*` | nessuna sessione (login/registrazione) |
| `/questionario`, `/api/questionario` | token del questionario + scadenza + rate limit |
| `/api/hooks/email` | header `x-webhook-secret` (fail-closed in produzione) |
| `/api/gmail/callback` | `state` + PKCE con cookie HttpOnly |
| `/api/esterni/v1/*` | `Authorization: Bearer <chiave API>` + ambiti |

## Punti d'attenzione

> [!warning] CORS e porta
> `middleware.ts` consente CORS solo per `localhost:3000`, ma l'app gira su
> `3001`. Per chiamate browser cross-origin l'header non viene aggiunto; i
> worker server-side non sono toccati.

> [!warning] Pagine server e sessione
> Il middleware verifica firma e scadenza del JWT, ma **non** `attivo` e
> `versione_sessione` (lo fa solo `richiediOperatore` nelle API). La pagina
> server `/rapportini/[id]` legge il DB affidandosi al solo middleware.

> [!info] `requireAuth` / `requireAdmin`
> Sono definiti in `lib/auth.ts` ma non usati nelle pagine: la protezione è
> middleware + `useOperatore` lato client.

## Collegamenti

- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
- [[Aree/Admin|Admin]] — gestione operatori
- [[Riferimenti/API|API]]
