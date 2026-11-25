---
title: Pattern dati e API
aliases:
  - Dati
  - API pattern
tags:
  - architettura
  - database
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Pattern dati e API

## Database

- **Turso/libSQL** remoto via `@libsql/client`. Il client è creato in
  `lib/turso-client.ts` (senza `server-only`, perché lo usano anche i worker) e
  `lib/db.ts` lo espone all'app.
- `lib/db.ts` contiene **tutto lo schema** in una stringa `SCHEMA` (37 tabelle):
  viene eseguito in modo lazy al primo accesso (`ensureSchema`).
- Non c'è ORM: SQL esplicito con parametri nominativi `@nome` / `:nome`.
- Migrazioni **additive** (`ALTER TABLE ... ADD COLUMN`) eseguite a ogni avvio,
  protette da `SCHEMA_VERSION` (oggi `4`) per le migrazioni dati una tantum.

> [!warning] Regola dello schema
> Lo schema viene spezzato sul `;`: nessun DDL può contenere `;` o `@` nudo nei
> letterali. Vale la pena ricordarlo prima di aggiungere una tabella.

### Adapter

`lib/db.ts` espone un'adapter in stile `better-sqlite3`:

| Metodo | Uso |
| --- | --- |
| `db.prepare(sql).get/all/run` | query singola |
| `db.batch([...])` | più scritture in un colpo |
| `db.batchRead([...])` | più SELECT indipendenti in una sola richiesta HTTP |
| `db.exec` | DDL / script |
| `db.ping` | diagnostica |

`batchRead` è il pattern preferito per le schermate che sommano più query: si
risparmiano round-trip verso il DB remoto. Esempi: `lib/dashboard.ts`,
`lib/direzione.ts`, `app/api/clienti/[id]/scheda/route.ts`.

### Convenzioni

- ID `TEXT` opachi (UUID o id Arca).
- Date di audit in **ISO 8601 UTC**; le date di calendario sono stringhe
  "naive" `YYYY-MM-DDTHH:mm` (ora di parete) e non vanno mai convertite in UTC.
- Colonne JSON (`persone`, `payload`, `strumenti`, `links`, `voci`) decodificate
  nel data layer, mai passate grezze alla UI.
- Nessuna FK applicata: la pulizia è esplicita nel codice (es. `deleteProgetto`).
- Soft delete dove serve: `eliminato_il`.
- Impostazioni chiave/valore in `impostazioni` (`sla_config`, `google_*`, ...).

## Confine client/server

- `lib/*.ts` che toccano il DB importano `"server-only"`: se un Client
  Component li importa, la build fallisce subito.
- I moduli condivisibili col client sono **puri**: `lib/api-cache.ts`,
  `lib/calendario.ts`, `lib/calendario-griglia.ts`, `lib/progetto-card.ts`,
  `lib/persone.ts`, `lib/task-local.ts`, `lib/useDebounce.ts`.
- I worker e gli script **non** possono importare `server-only`: usano
  `lib/turso-client.ts`, `lib/caselle-worker.ts`, `lib/sync/db.ts`.

## Route API

Schema tipico (`app/api/**/route.ts`):

1. `const auth = await richiediOperatore(request)` (o `{ ruolo: "admin" }`);
2. lettura e validazione del body (`request.json().catch(() => ({}))`);
3. chiamata al data layer in `lib/`;
4. `NextResponse.json(...)`; errori con `{ error }` e status coerente.

- Le route pubbliche sono un elenco chiuso in `middleware.ts`.
- `export const dynamic = "force-dynamic"` dove non si vuole cache Next.
- Gli upload passano da `app/api/uploads/*` (vedi [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]).

## Cache lato client (`lib/api-cache.ts`)

- Cache in memoria di scheda: dato mostrato subito, richiesta in background.
- TTL "fresco" 30 s, massimo 5 min.
- Deduplica delle richieste in corso.
- **Qualsiasi scrittura non-GET svuota la cache** (osserva `window.fetch`).
- `prefetchApi` riscalda al passaggio del mouse (usato dalla sidebar).
- Al logout si chiama `svuotaCache()`.

## Audit (`lib/registro.ts`)

`registra({ operatoreId, origine, azione, entita, entitaId, dettagli })`
scrive in `registro_attivita` con origine `utente | agente | api | sistema`.
Non fa mai fallire l'operazione principale. Per convenzione non contiene
password o token: è una regola di chi chiama, non un filtro automatico.

## Collegamenti

- [[Modello dati/Panoramica e ER|Panoramica e ER]] · [[Modello dati/Tabelle|Tabelle]]
- [[Riferimenti/API|Elenco API]] · [[Riferimenti/Moduli lib|Moduli lib]]
- [[Architettura/Runtime e processi|Runtime e processi]]
