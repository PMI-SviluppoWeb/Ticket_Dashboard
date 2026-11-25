---
title: Variabili ambiente
aliases: []
tags:
  - auto
  - riferimento
  - ambiente
aggiornato: 2026-11-25
commit: 81b3f92
---


> [!info] Nota generata automaticamente
> Fonte: codice del repository. Non modificare a mano: viene riscritta da `npm run docs:riferimenti`.


Solo NOMI delle variabili: i valori reali stanno in `.env` / `.env.local` e non vanno mai versionati.

| Variabile | Presente negli esempi | Letta dal codice |
| --- | --- | --- |
| `AI_MODEL_DEFAULT` | — | sì |
| `APP_BASE_URL` | `.env.example`, `.env.docker.example` | sì |
| `ARCA_API_BASE_URL` | `.env.example` | sì |
| `ARCA_API_KEY` | `.env.example` | sì |
| `DB_TRACE` | — | sì |
| `EMAIL_AUTOMATICHE_DISATTIVATE` | `.env.example`, `.env.docker.example` | sì |
| `EMAIL_FROM` | `.env.example`, `.env.docker.example` | sì |
| `EMAIL_MESSAGE_DOMAIN` | — | sì |
| `EMAIL_TRIAGE_MODEL` | — | sì |
| `ENCRYPTION_KEY` | `.env.example`, `.env.docker.example` | sì |
| `GMAIL_API_BASE` | — | sì |
| `GMAIL_POLL_INTERVAL_MS` | `.env.example`, `.env.docker.example` | sì |
| `GOOGLE_CALENDAR_API_BASE` | — | sì |
| `GOOGLE_DRY_RUN` | — | sì |
| `GOOGLE_GMAIL_CLIENT_ID` | `.env.example`, `.env.docker.example` | sì |
| `GOOGLE_GMAIL_CLIENT_SECRET` | `.env.example`, `.env.docker.example` | sì |
| `GOOGLE_OAUTH_TOKEN_URL` | — | sì |
| `GOOGLE_OAUTH_URL` | — | sì |
| `GOOGLE_PRIVATE_KEY` | `.env.example`, `.env.docker.example` | sì |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `.env.example`, `.env.docker.example` | sì |
| `HERMES_API_KEY` | `.env.example` | sì |
| `HERMES_BASE_URL` | `.env.example` | sì |
| `HERMES_MODEL` | `.env.example` | sì |
| `IMAP_ENV_FALLBACK` | `.env.example`, `.env.docker.example` | sì |
| `IMAP_HOST` | `.env.docker.example` | sì |
| `IMAP_PASS` | `.env.docker.example` | sì |
| `IMAP_POLL_INTERVAL_MS` | `.env.docker.example` | sì |
| `IMAP_PORT` | `.env.docker.example` | sì |
| `IMAP_SECURE` | `.env.docker.example` | sì |
| `IMAP_USER` | `.env.docker.example` | sì |
| `JWT_SECRET` | `.env.example`, `.env.docker.example` | sì |
| `NODE_ENV` | — | sì |
| `OPENROUTER_API_KEY` | `.env.docker.example` | sì |
| `OPENROUTER_MODEL` | — | sì |
| `PORT` | `.env.example` | — |
| `SMTP_HOST` | `.env.example`, `.env.docker.example` | sì |
| `SMTP_PASS` | `.env.example`, `.env.docker.example` | sì |
| `SMTP_PORT` | `.env.example`, `.env.docker.example` | sì |
| `SMTP_USER` | `.env.example`, `.env.docker.example` | sì |
| `SQL_DATABASE` | `.env.example`, `.env.docker.example` | sì |
| `SQL_DOMAIN` | `.env.docker.example` | — |
| `SQL_ENCRYPT` | `.env.example`, `.env.docker.example` | sì |
| `SQL_PASS` | `.env.example`, `.env.docker.example` | sì |
| `SQL_SERVER` | `.env.example`, `.env.docker.example` | sì |
| `SQL_TRUST_CERT` | `.env.example`, `.env.docker.example` | sì |
| `SQL_USER` | `.env.example`, `.env.docker.example` | sì |
| `SQL_WINDOWS_AUTH` | `.env.docker.example` | sì |
| `SYNC_CLIENTI_INTERVAL_MS` | — | sì |
| `TURSO_AUTH_TOKEN` | `.env.example`, `.env.docker.example` | sì |
| `TURSO_DATABASE_URL` | `.env.example`, `.env.docker.example` | sì |
| `USERDOMAIN` | — | sì |
| `USERNAME` | — | sì |
| `WEBHOOK_SECRET` | `.env.example`, `.env.docker.example` | sì |
| `WEBHOOK_URL` | — | sì |

## Note

- `JWT_SECRET` e `WEBHOOK_SECRET` sono obbligatori in produzione.
- `ENCRYPTION_KEY` serve per cifrare le credenziali delle caselle email: cambiarla rende illeggibili le password gia' salvate.
- `OPENROUTER_API_KEY` / `HERMES_*` abilitano gli agenti AI; senza chiavi le funzioni AI restano spente o degradano.
