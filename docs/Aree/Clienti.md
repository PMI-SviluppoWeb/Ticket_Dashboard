---
title: Clienti
aliases:
  - Clienti
  - Scheda 360
tags:
  - area/clienti
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Clienti

Anagrafica sincronizzata da Arca (sola lettura locale) con scheda 360, dati
commerciali, questionari e inventario IT.

## Pagine e componenti

| Cosa | Dove |
| --- | --- |
| Elenco clienti (admin) | `app/clienti/page.tsx` |
| Scheda cliente | `app/clienti/[id]/page.tsx` |
| Form commerciale | `components/clienti/CommercialeForm.tsx` |
| Questionari | `components/clienti/QuestionariPanel.tsx` |
| Inventario IT | `components/clienti/InventarioPanel.tsx` |
| Ticket e ore | `components/clienti/TicketReportPanel.tsx` |
| Form pubblico questionario | `app/questionario/page.tsx` |

Tab della scheda: **Panoramica**, **Questionari** (admin), **Inventario**
(admin), **Ticket e ore**, **Progetti e rapportini**.

## API

| Route | Metodi | Accesso |
| --- | --- | --- |
| `/api/clienti` | GET | autenticato (cache 120 s senza `q`) |
| `/api/clienti/[id]` | GET | autenticato |
| `/api/clienti/panoramica` | GET | admin |
| `/api/clienti/[id]/scheda` | GET | autenticato |
| `/api/clienti/[id]/commerciale` | GET, PATCH | admin |
| `/api/clienti/[id]/questionari` | GET, POST | admin |
| `/api/clienti/[id]/questionari/[questionarioId]` | DELETE | admin |
| `/api/questionario` | GET, POST | pubblico con token |

## Dati e logica

- `lib/clienti.ts` — letture anagrafica; id `TEXT` opachi.
- `lib/clienti-commerciale.ts` — dati commerciali locali e panoramica con
  metriche.
- `lib/sync/config.ts` — sorgente `api` o `sql-server`, mappa campi Arca.
- `lib/sync/sync-clienti.ts` — upsert idempotente.
- `lib/sync/sources/api-source.ts` — API Arca `dbo_CF` + `dbo_CFContatto`.
- `lib/sync/sources/sql-server-source.ts` — alternativa SQL Server.
- `lib/sync-worker.ts` / `scripts/sync-clienti.ts` — sync periodica o manuale.
- Tabelle: `clienti`, `clienti_commerciale`, `questionari`,
  `questionari_risposte`, oltre a ticket/progetti/rapportini in lettura.

## Flussi

### Sync da Arca

Worker/script → `fetchClientiFromApi` (due GET in parallelo) → merge contatti
per `cd_cf` → `mapCliente` → INSERT/UPDATE su `clienti`. Dettagli e limiti in
[[Flussi/Sync clienti|Sync clienti]].

### Scheda 360

`GET /api/clienti/[id]/scheda` esegue un `db.batchRead`: ticket, ore ticket,
moduli ricorrenti, contatti, progetti, rapportini.

### Dati commerciali

Form → `PATCH /api/clienti/[id]/commerciale` → upsert in
`clienti_commerciale` con registro.

### Questionari

L'admin crea il questionario, il cliente compila dal link pubblico, la risposta
alimenta anche l'inventario IT. Vedi [[Aree/Questionario pubblico|Questionario pubblico]].

## Permessi

- Elenco clienti e panoramica: **solo admin**.
- Scheda `/clienti/[id]` e API scheda: qualsiasi operatore (serve dai ticket).
- Dati commerciali e questionari: **solo admin**.
- API esterna `clienti:read`: chiave API (bot WhatsApp).

## Punti d'attenzione

> [!warning] Limiti noti
> - La sync è **solo Arca → app**: non crea/modifica clienti su Arca e non
>   elimina i clienti scomparsi dalla sorgente.
> - Il join anagrafica/contatti usa `cd_cf`, non `id_cf`.
> - I clienti nuovi compaiono nelle select entro ~2 minuti per la cache HTTP.
> - La scheda associa i ticket con doppia logica: `cliente_id` **oppure**
>   `cliente = ragione_sociale`. Una rinomina può rompere il fallback per nome.
> - Le "Ore" del cliente sono solo voci `voci_tempo` agganciate a ticket: **non**
>   includono tempo su task di progetto o tempo generico.
> - Il link del questionario è mostrato una sola volta (nel DB c'è solo l'hash).
> - Lo stato `scaduto` è calcolato in lettura, non scritto.
> - L'inventario dipende dai questionari compilati: senza questionari è vuoto.

## Collegamenti

- [[Flussi/Sync clienti|Sync clienti]] · [[Aree/Questionario pubblico|Questionario pubblico]]
- [[Aree/Ticket|Ticket]] · [[Aree/Progetti|Progetti]] · [[Aree/Rapportini|Rapportini]]
