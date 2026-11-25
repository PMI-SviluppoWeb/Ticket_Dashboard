---
title: Setup locale
aliases:
  - Setup
  - Sviluppo locale
tags:
  - operativita
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Setup locale

## Prerequisiti

- **Node.js 22** e npm (il Docker usa Node 22 Alpine).
- Un database **Turso** (URL + token) oppure accesso a quello di sviluppo.
- Facoltativo: Docker Desktop per provare il deploy.
- Facoltativo: account SMTP/IMAP, Google, OpenRouter/Hermes per le integrazioni.

## 1. Dipendenze e ambiente

```powershell
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Minimo per avviare:

| Variabile | Serve per |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | database |
| `JWT_SECRET` | sessioni (in produzione obbligatorio) |
| `WEBHOOK_SECRET` | webhook email (in produzione obbligatorio) |
| `ENCRYPTION_KEY` | caselle email (almeno 32 caratteri) |

Integrazioni: `SMTP_*`, `IMAP_*`, `GMAIL_*`, `GOOGLE_*`, `OPENROUTER_API_KEY`,
`HERMES_*`, `ARCA_*`, `SQL_*`. Elenco completo in
[[Riferimenti/Variabili ambiente|Variabili ambiente]].

> [!warning] `ENCRYPTION_KEY`
> Non cambiarla dopo aver salvato caselle email: le password diventerebbero
> illeggibili.

## 2. Avvio

```powershell
npm run dev      # http://localhost:3001
npm run worker   # in un secondo terminale
```

Il database viene creato/migrato in modo lazy al primo accesso: non c'è un
comando "migrate" separato.

## 3. Primo utente

In sviluppo si può usare lo script di seed (mai in produzione):

```powershell
node scripts/init-admin.js      # admin@test.it / admin123456
# oppure
node scripts/init-operatori.js
```

In produzione il primo admin si crea dal pannello admin
(`POST /api/auth/register`, che richiede admin) o con un inserimento controllato.
Gli hash dei seed usano 100k iterazioni: accettati al login e ricalcolati a 600k.

## 4. Verifiche rapide

```powershell
npm run typecheck
npm run test
npm run lint
```

- Login → dashboard.
- Aprire un ticket, una nota, un progetto.
- Se il worker è attivo: inviare un'email di test a una casella configurata e
  controllare `/inbox`.
- Se Google è configurato: creare un'attività con data e verificare l'evento.

## 5. Documentazione

```powershell
npm run docs
```

Vedi [[00-come-usare|Come usare questa documentazione]].

## Collegamenti

- [[Operatività/Deploy Docker|Deploy Docker]] · [[Operatività/Troubleshooting|Troubleshooting]]
- [[Architettura/Runtime e processi|Runtime e processi]]
