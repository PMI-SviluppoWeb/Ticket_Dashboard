---
title: Sync clienti
aliases:
  - Sincronizzazione clienti
  - Arca sync
tags:
  - flusso
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Sync clienti

L'anagrafica clienti è **importata** da Arca nel database dell'app. La
direzione è una sola: Arca → app.

## Sorgenti

| Sorgente | Config | File |
| --- | --- | --- |
| API Arca | `ARCA_API_BASE_URL`, `ARCA_API_KEY`, `source: "api"` (default) | `lib/sync/sources/api-source.ts` |
| SQL Server | `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASS`, auth Windows opzionale | `lib/sync/sources/sql-server-source.ts` |

La scelta è in `lib/sync/config.ts`; la mappa campi Arca è lì.

## Sequenza

1. `syncClienti()` legge la sorgente.
2. Per l'API: due GET paralleli (`dbo_CF` e `dbo_CFContatto`), merge contatti
   per **`cd_cf`** (non `id_cf`).
3. `mapCliente` normalizza i campi.
4. `clienteExists` → INSERT o UPDATE su `clienti`.
5. `updateCliente` non azzera i campi assenti.

## Quando gira

| Modalità | Comando / processo | Intervallo |
| --- | --- | --- |
| Worker | `npm run worker` (sync-worker) | `SYNC_CLIENTI_INTERVAL_MS`, default 6 h |
| Manuale | `npm run sync-clienti` | una tantum |

## Cosa NON fa

> [!warning] Solo import
> - Non crea/modifica clienti su Arca.
> - Non elimina i clienti scomparsi dalla sorgente.
> - Non tocca dati commerciali (`clienti_commerciale`) né questionari.

## Effetti collaterali

- `/api/clienti` è in cache HTTP per 120 s: un cliente nuovo può comparire nelle
  select dopo circa 2 minuti.
- Ticket e progetti puntano al cliente con `cliente_id`; la scheda usa anche un
  fallback per `ragione_sociale`. Una rinomina può rompere il fallback.

## Dove guardare

- [[Aree/Clienti|Clienti]]
- `lib/sync/sync-clienti.ts`, `lib/sync/config.ts`, `lib/sync-worker.ts`
- `scripts/sync-clienti.ts`
- `docs/MIGRAZIONE-API-ARCA.md` per il passaggio da SQL Server alle API
