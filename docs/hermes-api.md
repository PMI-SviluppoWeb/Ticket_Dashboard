---
title: API macchina Hermes
aliases:
  - API Hermes
  - Bot WhatsApp
tags:
  - riferimento
  - area/ai
verificato_al_commit: 81b3f92
created: 2026-07-01
---

# API macchina per il bot WhatsApp (Hermes)

L'app espone una piccola API HTTP per il bot che gira su **Hermes**. Il bot non
usa una sessione utente: autentica ogni richiesta con una **chiave API** creata
dall'admin in **Chiavi API**.

## Sicurezza

- La chiave si mostra **una sola volta** alla creazione; nel database resta solo
  l'hash SHA-256.
- Ogni chiave ha **ambiti** espliciti. Una chiamata fuori ambito riceve `403`.
- Rate limit: **120 richieste al minuto** per chiave (`429` oltre).
- Il bot riceve **solo** l'anagrafica del numero che sta scrivendo: la ricerca
  per telefono non restituisce altri clienti.
- Il bot può leggere/scrivere **solo ticket con `canale = whatsapp`**.

## Autenticazione

```http
Authorization: Bearer <CHIAVE_API>
Content-Type: application/json
```

## Ambiti

| Ambito | Consente |
| --- | --- |
| `clienti:read` | `GET /clienti/cerca` |
| `tickets:write` | `POST /tickets`, `POST /tickets/{id}/messaggi` |
| `tickets:read` | `GET /tickets/{id}` |

## Endpoint

Base URL: `https://<dominio-supporto>/api/esterni/v1`

### 1. Cerca il chiamante

```http
GET /clienti/cerca?telefono=+39 333 1234567
```

Risposta:

```json
{
  "cliente": {
    "id": "CLI-001",
    "ragione_sociale": "Rossi & Figli S.r.l.",
    "nome_contatto": "Marco Rossi",
    "email": "marco.rossi@rossifigli.it",
    "telefono": "333 1234567"
  }
}
```

`cliente` e `null` se il numero non è in anagrafica.

### 2. Crea un ticket

```http
POST /tickets
Idempotency-Key: <uuid-univoco-del-messaggio>
```

```json
{
  "telefono": "+39 333 1234567",
  "contatto": "Marco Rossi",
  "sommario_problema": "Errore stampa fattura",
  "descrizione_dettagliata": "Alla stampa della fattura 123 esce errore...",
  "priorita": "MEDIA",
  "modulo_software": "Fatturazione"
}
```

Risposta `201`:

```json
{ "id": "<uuid>", "numero": "TICK-000042", "stato": "NUOVO", "cliente": "Rossi & Figli S.r.l." }
```

- `Idempotency-Key` è **fortemente consigliata**: se il bot ritenta la stessa
  richiesta, riceve la stessa risposta senza creare un doppione.
- Il ticket nasce con `canale = whatsapp` e il primo messaggio è la
  `descrizione_dettagliata`.

### 3. Aggiungi un messaggio alla conversazione

```http
POST /tickets/{id}/messaggi
```

```json
{ "contenuto": "Il problema si presenta solo sui PDF", "ruolo": "user" }
```

`ruolo`: `user` (messaggio del cliente) o `assistant` (messaggio del bot).
Risposta `201`: `{ "ok": true, "messaggio_id": "<uuid>", "riaperto": false }`.

Se il ticket era chiuso e arriva un messaggio `user`, viene riaperto
(`stato = IN_CORSO`) e l'operatore assegnato riceve una notifica.

### 4. Leggi lo stato

```http
GET /tickets/{id}
```

```json
{ "id": "<uuid>", "numero": "TICK-000042", "stato": "IN_CORSO", "aggiornato_il": "2026-11-18T10:22:00.000Z" }
```

Restituisce **solo lo stato**, mai il contenuto della conversazione.

## Errori

| Codice | Significato |
| --- | --- |
| `400` | Parametri mancanti o non validi |
| `401` | Chiave mancante/non valida/revocata |
| `403` | Ambito mancante |
| `404` | Ticket non trovato (o non WhatsApp) |
| `429` | Troppe richieste |
| `500` | Errore interno |

Tutte le chiamate finiscono nel **registro attività** con origine `api` e
l'identificativo della chiave usata.
