---
title: Runtime e processi
aliases:
  - Worker
  - Deploy runtime
tags:
  - architettura
  - runtime
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Runtime e processi

L'app ha **due processi** da tenere vivi: il server Next e il worker che legge
le email e sincronizza i clienti.

## In locale

```powershell
npm install
npm run dev      # terminale 1: Next su http://localhost:3001
npm run worker   # terminale 2: IMAP + Gmail + sync clienti
```

`npm run worker` = `tsx scripts/start-worker.ts`; carica `.env.local` e `.env`,
stampa una diagnostica delle integrazioni e avvia in parallelo:

| Worker | Cosa fa | Intervallo |
| --- | --- | --- |
| IMAP | legge le caselle `tipo=imap`, manda al webhook | `IMAP_POLL_INTERVAL_MS` (default 120 s) |
| Gmail | legge le caselle `tipo=gmail` via API OAuth | `GMAIL_POLL_INTERVAL_MS` (default 300 s) |
| Sync clienti | aggiorna l'anagrafica da Arca | `SYNC_CLIENTI_INTERVAL_MS` (default 6 h) |

I due worker email usano un cursore persistente (UID IMAP / epoch Gmail) e un
backoff esponenziale; un errore su una casella non ferma le altre.

## In produzione (Docker)

- `Dockerfile` multi-stage su Node 22 Alpine:
  `deps` → `prod-deps` → `check` (typecheck + test) → `builder` → `runner`.
- Il container gira **non-root** (`app`), con `tini` come entrypoint.
- `CMD` = `scripts/start-services.sh`: avvia il worker in background e poi
  `next start -p 3001 -H 0.0.0.0`; uno `SIGTERM` ferma entrambi.
- `docker-compose.yml`: porta `3001`, `env_file: .env`, volume
  `./uploads:/app/uploads`, limiti 1 GB / 1.5 CPU, log rotation, healthcheck.
- Il worker Docker usa `scripts/start-worker-docker.ts` (niente dotenv: le env
  arrivano dal container).

> [!warning] Dipendenze del worker
> `imapflow`, `postal-mime`, `nodemailer` non sono importati dal server Next,
> quindi Next non li traccia. Il Dockerfile copia le dipendenze di produzione
> complete e la cartella `lib/` per farli funzionare.

## Webhook email

Il worker non scrive nel DB: fa una `POST` a
`http://127.0.0.1:3001/api/hooks/email` con header `x-webhook-secret`.
La route (`app/api/hooks/email/route.ts`) fa deduplica, triage e crea o
aggancia il ticket. Dettagli in [[Flussi/Email a ticket|Email a ticket]].

> [!warning] `WEBHOOK_SECRET`
> In produzione è obbligatorio: senza, il webhook risponde `503` e nessuna
> email diventa ticket. Deve essere identico per app e worker (stesso `.env`).

## Variabili

Elenco completo e aggiornato: [[Riferimenti/Variabili ambiente|Variabili ambiente]].
Le più importanti per il runtime: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`JWT_SECRET`, `WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `SMTP_*`, `IMAP_*`,
`GMAIL_*`, `GOOGLE_*`, `OPENROUTER_API_KEY` / `HERMES_*`.

## Collegamenti

- [[Operatività/Setup locale|Setup locale]] · [[Operatività/Deploy Docker|Deploy Docker]]
- [[Flussi/Email a ticket|Email a ticket]] · [[Flussi/Sync clienti|Sync clienti]]
- [[Riferimenti/Script e worker|Script e worker]]
