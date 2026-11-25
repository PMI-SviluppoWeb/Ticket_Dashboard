---
title: Knowledge
aliases:
  - Knowledge base
  - Documentazione interna
tags:
  - area/knowledge
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Knowledge

Base di conoscenza interna: PDF con testo estratto e link categorizzati, con
ricerca testuale.

## Pagine e API

| Cosa | Dove |
| --- | --- |
| Pagina unica | `app/knowledge/page.tsx` |
| Documenti | `GET/POST /api/knowledge`, `GET/PATCH/DELETE /api/knowledge/[id]` |
| Link | `GET/POST /api/knowledge/links`, `GET/PATCH/DELETE /api/knowledge/links/[id]` |

## Dati e logica

- `lib/knowledge.ts` — CRUD `knowledge_docs`, parsing JSON dei link.
- `lib/knowledge-links.ts` — CRUD `knowledge_links`.
- Tabelle: `knowledge_docs` (`nome_file`, `dimensione`, `pagine`, `testo`,
  `links`, `data_creazione`) e `knowledge_links` (`titolo`, `url`,
  `descrizione`, `categoria`).

## Flussi

### Upload PDF

`POST /api/knowledge` (admin): solo `.pdf`, max 25 MB. `unpdf` estrae testo e
numero pagine. Un PDF senza testo estraibile (scansionato/protetto) viene
rifiutato. **Il testo è salvato nel DB, non il file originale.**

### Ricerca

`GET /api/knowledge?q=...` con `LIKE` su `nome_file` e `testo`. La UI carica
tutti i documenti e pagina lato client (5 per pagina).

### Lettura

`GET /api/knowledge/[id]` restituisce il testo completo; il modale permette di
copiarlo.

### Link

Creazione/modifica da qualsiasi operatore; URL validati solo `http/https`.
Categorie UI: tutte / generale / documentazione / tutorial / api / risorse.
Eliminazione link: admin.

## Permessi

| Azione | Chi |
| --- | --- |
| Lettura documenti e link | qualsiasi operatore |
| Upload documento | admin |
| Eliminazione documento | admin |
| Creazione/modifica link | qualsiasi operatore |
| Eliminazione link | admin |
| PATCH dei link di un documento | qualsiasi operatore |

## Punti d'attenzione

> [!warning] Limiti noti
> - Il PDF originale non è conservato: si può solo leggere/copiare il testo.
> - La ricerca è `LIKE %q%`, non full-text e senza ricerca vettoriale/LLM.
> - La paginazione dei documenti è client-side.
> - L'API `PATCH /api/knowledge/[id]` supporta i link associati a un documento,
>   ma la pagina non ha un editor: funzione incompleta.
> - La pagina non usa `useOperatore()` per nascondere i pulsanti admin: il
>   controllo è solo lato API (un non-admin riceve `403`).

## Collegamenti

- [[Aree/Admin|Admin]]
- [[Riferimenti/API|API]] · [[Modello dati/Tabelle|Tabelle]]
