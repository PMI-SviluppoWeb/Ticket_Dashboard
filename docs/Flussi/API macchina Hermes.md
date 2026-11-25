---
title: API macchina Hermes
aliases:
  - API esterna
  - Bot WhatsApp
  - Hermes API
tags:
  - flusso
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# API macchina Hermes

API HTTP per il bot WhatsApp su Hermes. Non usa la sessione utente: autentica
ogni richiesta con una **chiave API** creata dall'admin.

## Autenticazione

```http
Authorization: Bearer <CHIAVE_API>
Content-Type: application/json
```

- Nel DB c'è solo l'hash SHA-256; la chiave in chiaro è mostrata una volta.
- Ambiti: `clienti:read`, `tickets:read`, `tickets:write`.
- Rate limit: 120 richieste/minuto per chiave (in memoria).
- Errori: `401` chiave assente/non valida, `403` ambito mancante, `429` troppe
  richieste.

## Endpoint

| Endpoint | Ambito | Cosa fa |
| --- | --- | --- |
| `GET /api/esterni/v1/clienti/cerca?telefono=` | `clienti:read` | cliente del numero, al massimo uno |
| `POST /api/esterni/v1/tickets` | `tickets:write` | crea ticket `canale=whatsapp` |
| `GET /api/esterni/v1/tickets/{id}` | `tickets:read` | stato del ticket WhatsApp |
| `POST /api/esterni/v1/tickets/{id}/messaggi` | `tickets:write` | aggiunge messaggio |

`{id}` accetta id interno o numero `TICK-…`.

## Dettagli

- **Ricerca cliente**: confronta gli ultimi 9 caratteri del telefono; restituisce
  solo l'anagrafica del numero cercato (niente enumerazione).
- **Creazione ticket**: richiede `telefono`, `sommario_problema`,
  `descrizione_dettagliata`. Cliente risolto per telefono, modulo default
  `Generico`, priorità `MEDIA`, note `[WhatsApp] …`, primo messaggio =
  descrizione. Crea notifica interna, **non invia email**.
- **Messaggi**: se il ticket è chiuso/risolto, un messaggio `user` lo riapre a
  `IN_CORSO` e notifica l'operatore.
- **Idempotenza**: solo su `POST /tickets`, header `Idempotency-Key`. La risposta
  viene salvata in `chiavi_idempotenza`.

## Gestione chiavi

- Admin → `/admin/chiavi-api` → crea con nome e ambiti; revoca con `DELETE`.
- Dettagli in [[Aree/Admin|Admin]].

## Punti d'attenzione

> [!warning] Limiti noti
> - Tutte le route funzionano **solo su ticket `canale='whatsapp'`**.
> - L'idempotenza non è applicata ai messaggi: un retry del bot può duplicare.
> - Le chiavi di idempotenza non hanno scadenza/pulizia.
> - Il rate limit è per processo, non globale.
> - La documentazione pubblica è `docs/hermes-api.md`; questo file è la nota
>   operativa interna.

## Dove guardare

- `app/api/esterni/v1/**`
- `lib/chiavi-api.ts`, `lib/esterni.ts`
- [[hermes-api|Documentazione API Hermes]]
- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
