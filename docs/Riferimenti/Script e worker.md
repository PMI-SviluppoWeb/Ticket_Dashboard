---
title: Script e worker
aliases: []
tags:
  - auto
  - riferimento
  - runtime
aggiornato: 2026-11-25
commit: 81b3f92
---


> [!info] Nota generata automaticamente
> Fonte: codice del repository. Non modificare a mano: viene riscritta da `npm run docs:riferimenti`.


## Script operativi

| File | Descrizione dal codice |
| --- | --- |
| `scripts/backup-turso.ts` | Backup del database Turso di produzione PRIMA di una migrazione.  Produce un file SQL autonomo (schema + dati) in backups/, ripristinabile con il Turso CLI o con qualunque client SQLite:    turso db shell <database> < backups/<file>.sql  Lo script e' di… |
| `scripts/create-test-ticket-2.js` | Ticket 2 - IN_CORSO |
| `scripts/create-test-ticket.js` | Create ticket |
| `scripts/debug-imap.ts` | Controlla cosa c'e' davvero nella casella env: UID non letti e relativi oggetti, per capire se la email di test e' arrivata e perche' il worker non la vede. |
| `scripts/debug-stato.ts` | — |
| `scripts/diagnostica-email.ts` | — |
| `scripts/docs/esporta-grafo.ts` | =========================================================================== Rigenera il grafo del codice con graphify e copia il wiki in docs/_grafo/.  graphify e' uno strumento esterno: se non e' installato la documentazione curata e i riferimenti restano… |
| `scripts/docs/genera-riferimenti.ts` | =========================================================================== Genera le note di RIFERIMENTO della documentazione Obsidian.  Fonte di verita' e' sempre il codice: pagine, route API, moduli lib, script/worker, tabelle del DB e variabili… |
| `scripts/docs/stato.ts` | =========================================================================== Genera `docs/Stato documentazione.md`: fotografia di HEAD, grafo, note curate e link rotti. E' il controllo di salute del vault Obsidian.  Esce con codice 1 se trova link rotti:… |
| `scripts/init-admin.js` | Seed con password fissa: vietato in produzione. Gli operatori si creano dal pannello admin (route /api/auth/register). |
| `scripts/init-operatori.js` | Seed con password fissa: vietato in produzione. Gli operatori si creano dal pannello admin (route /api/auth/register). |
| `scripts/list-tables.ts` | — |
| `scripts/migrate-sqlite-to-turso.cjs` | Migrazione one-shot: copia i dati da data/tickets.db (SQLite) a Turso (libSQL). Preserva gli id esistenti, quindi URL e riferimenti restano validi.  Uso: node scripts/migrate-sqlite-to-turso.cjs Richiede che .env.local contenga TURSO_DATABASE_URL e… |
| `scripts/poll-mail.ts` | Carica l'ambiente PRIMA di importare i worker: i moduli leggono le env in modo lazy, ma le connessioni usano i valori al momento della chiamata. |
| `scripts/pulizia-email.ts` | Pulizia dei ticket nati da email (tipicamente la vecchia casella di .env che riceveva posta promozionale).  SICUREZZA: di default NON cancella nulla. Mostra solo l'anteprima.    npx tsx scripts/pulizia-email.ts   npx tsx scripts/pulizia-email.ts --da… |
| `scripts/start-hermes-gateway.ps1` | — |
| `scripts/start-services.sh` | — |
| `scripts/start-worker-docker.ts` | Vedi scripts/start-worker.ts: stesso processo, loop indipendenti. |
| `scripts/start-worker.ts` | Carica variabili d'ambiente da .env.local |
| `scripts/sync-clienti.ts` | Carica .env.local PRIMA di importare i moduli che leggono le env |
| `scripts/test-api-arca.ts` | — |
| `scripts/test-api-contatti.ts` | Formati telefono |
| `scripts/test-sql-connection.ts` | Try to find the port |
| `scripts/verify-clienti.ts` | Test lookup stile MCP: ricerca per numero (anche parziale/digitale) |
| `scripts/verify-lookup.ts` | Record sincronizzati dall'API (id numerico) |

## Worker e processi in background

Avviati da `scripts/start-worker.ts` (locale) o da `scripts/start-services.sh` (Docker) insieme al server Next.

| File | Descrizione dal codice |
| --- | --- |
| `lib/imap-worker.ts` | Poll interval: letto LAZY dentro startImapWorker(), per lo stesso motivo di webhookHeaders() sotto — in start-worker.ts le import girano PRIMA di dotenv.config(), quindi una variabile catturata a livello di modulo resterebbe al default e il valore in .env… |
| `lib/gmail-worker.ts` | Worker di polling Gmail via OAuth 2.0 + Gmail API (affianca l'IMAP worker: le caselle IMAP restano pollate da lib/imap-worker.ts, quelle Gmail qui).  Stesso flusso di consegna: ogni email scaricata viene POSTata al webhook /api/hooks/email (dedup,… |
| `lib/sync-worker.ts` | Sync periodica delle anagrafiche clienti dall'ERP (Arca). Gira nello stesso processo dei worker email: nessun nuovo container, un loop in piu'.  Se la sorgente non e' configurata, il primo tentativo fallisce e viene loggato: il worker email non deve… |
| `lib/caselle-worker.ts` | Lettura caselle email per l'IMAP worker (processo separato da Next).  Questo modulo NON importa lib/db.ts (server-only esploderebbe fuori da Next) ne lib/caselle.ts (che a sua volta importa db): usa direttamente il client Turso condiviso di… |
| `scripts/start-worker.ts` | Carica variabili d'ambiente da .env.local |
| `scripts/start-worker-docker.ts` | Vedi scripts/start-worker.ts: stesso processo, loop indipendenti. |
| `scripts/start-services.sh` | — |
