---
title: Admin
aliases:
  - Amministrazione
  - Admin
tags:
  - area/admin
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Admin

Area riservata all'admin: operatori, SLA, chiavi API, agenti AI, caselle email e
cruscotto. Le pagine vivono sotto `/admin/*`; la navigazione le mostra solo agli
admin (`lib/nav.ts`), ma ogni API ricontrolla il ruolo.

## Pagine

| Pagina | Cosa fa |
| --- | --- |
| `app/admin/page.tsx` | Operatori: crea, modifica, disattiva, riattiva, elimina |
| `app/admin/sla/page.tsx` | Obiettivi SLA per priorità, orario, festivi |
| `app/admin/chiavi-api/page.tsx` | Chiavi API macchina |
| `app/admin/agenti/page.tsx` | Agenti AI, libreria, assegnazioni, prova |
| `app/admin/email/page.tsx` | Caselle IMAP/Gmail, accessi, mittenti interni |
| `app/admin/dashboard/page.tsx` | Cruscotto di periodo |

## API

| Dominio | Route |
| --- | --- |
| Operatori | `/api/operatori`, `/api/operatori/[id]`, `/api/operatori/stats`, `/api/auth/register` |
| SLA | `/api/sla` (GET/PATCH, admin) |
| Chiavi API | `/api/chiavi-api`, `/api/chiavi-api/[id]` |
| Agenti | `/api/agenti/*` (vedi [[Aree/AI e Agenti\|AI e Agenti]]) |
| Caselle | `/api/caselle/*` (vedi [[Aree/Email e Inbox\|Email e Inbox]]) |
| Cruscotto | `/api/admin/dashboard` |

## Operatori

- Creazione: `POST /api/auth/register` — **pubblico nel middleware ma richiede
  admin**; valida nome, email univoca, password minima 8.
- Modifica: `PATCH /api/operatori/[id]`.
- Disattiva: `DELETE /api/operatori/[id]` (senza body) → `attivo=0` e
  `versione_sessione` incrementata.
- Riattiva: `DELETE` con `{ attivo: true }`.
- Eliminazione definitiva: `DELETE` con `{ permanente: true }`.

> [!warning] Revoca sessioni
> Cambiare password o disattivare un operatore incrementa `versione_sessione`:
> i JWT già emessi vengono rifiutati alla prima richiesta API.

## SLA

- Configurazione in `impostazioni.sla_config`, salvata con `PATCH /api/sla`.
- Obiettivi per priorità in minuti lavorativi, giorni lavorativi, orario,
  pausa pranzo e festivi.
- Validazione lato API; il calcolo vive in `lib/sla.ts` ed è usato anche dal
  cruscotto e dalla direzione.

## Chiavi API

- Creazione: nome + ambiti (`tickets:read`, `tickets:write`, `clienti:read`).
- La chiave in chiaro è mostrata **una sola volta**; nel DB solo hash SHA-256.
- Revoca: `DELETE /api/chiavi-api/[id]` imposta `attiva=0`.
- Dettagli d'uso in [[Flussi/API macchina Hermes|API macchina Hermes]].

## Notifiche

- `notifications` + `notifications_lette`: lo stato di lettura è **per
  operatore**.
- La campanella fa polling 30 s.
- La creazione broadcast è admin; le altre nascono dai flussi (ticket, proposte,
  questionari, ...).

## Aree e navigazione

- `lib/nav.ts` definisce le aree e i loro figli; `AreaTabs` mostra i tab solo
  per aree con almeno due figli.
- L'area attiva si riconosce dai figli, non dal prefisso URL.
- La sidebar riscalda le API al passaggio del mouse (`prefetchApi`).

## Punti d'attenzione

> [!warning] Da sapere
> - Cruscotto admin e dashboard usano confini giornalieri in fusi diversi (vedi
>   [[Aree/Dashboard e Direzione|Dashboard e Direzione]]).
> - `GET /api/operatori?all=true` è solo admin; un operatore non deve poter
>   enumerare gli altri.
> - Le caselle email sono gestite in `/admin/email`, ma lo stato Google è nel
>   calendario: due punti diversi per integrazioni Google.

## Collegamenti

- [[Aree/AI e Agenti|AI e Agenti]] · [[Aree/Email e Inbox|Email e Inbox]] · [[Aree/Dashboard e Direzione|Dashboard e Direzione]]
- [[Architettura/Autenticazione e ruoli|Autenticazione e ruoli]]
