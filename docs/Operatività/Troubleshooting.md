---
title: Troubleshooting
aliases:
  - Problemi comuni
  - FAQ operativa
tags:
  - operativita
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Troubleshooting

## Login e sessioni

| Sintomo | Causa probabile | Cosa fare |
| --- | --- | --- |
| `429` al login | 5 tentativi falliti in 15 min per email+IP | attendere o pulire `tentativi_login` |
| Sessione scaduta subito | `JWT_SECRET` cambiato / versione sessione | rifare login; in produzione secret stabile |
| Login ok ma API `401` | cookie non inviato o JWT scaduto | controllare `session`, HTTPS, reverse proxy |

## Email

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| Webhook `503` | `WEBHOOK_SECRET` mancante | impostarlo in `.env` (app e worker) |
| Email non arriva | worker spento / casella non abilitata | `npm run worker`, `/admin/email`, tab inbox |
| IMAP bloccato | un UID fallisce e il cursore non avanza | guardare i log, correggere e riavviare |
| Gmail `401/403` | refresh token scaduto/revocato | ricollegare l'account da `/admin/email` |
| Form caselle disabilitato | manca `ENCRYPTION_KEY` | impostarla (≥32 caratteri) e riavviare |
| Nessuna email automatica | `EMAIL_AUTOMATICHE_DISATTIVATE=true` | riattivare; le manuali restano |

## Clienti e sync

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| Cliente nuovo non in elenco | cache HTTP 120 s o sync non ancora passata | attendere, `npm run sync-clienti` |
| Cliente rinominato non trovato nei ticket | fallback per `ragione_sociale` | usare `cliente_id` / risincronizzare |
| Sync errori | credenziali Arca/SQL o join `cd_cf` | controllare env e log del worker |

## Google Calendar

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| Sync disattivata | env `GOOGLE_*` assenti | configurarle e riavviare |
| Eventi non creati | calendario non condiviso col service account | condividere con permesso "Apporta modifiche" |
| Errori in `attivita_google` | quota/rete/permessi | "Riprova gli errori" o riconciliare |
| Evento modificato in Google viene sovrascritto | sync one-way | la modifica va fatta nell'app |

## AI e agenti

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| Agente non risponde | manca `OPENROUTER_API_KEY` / `HERMES_API_KEY` | impostare la chiave |
| Modello non valido | `OPENROUTER_MODEL` errato | default `deepseek/deepseek-v4.1-flash-1017` |
| L'agente non usa i tool | agente senza strumenti o su Hermes | abilitare un gruppo, usare OpenRouter |
| Proposta non approvabile | manca il cliente / stato non `in_attesa` | aprire il dettaglio e completare |

## API macchina

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| `401` | chiave assente/errata/revocata | controllare `Bearer` e `/admin/chiavi-api` |
| `403` | ambito mancante | creare una chiave con l'ambito giusto |
| `429` | 120 richieste/min superate | rallentare il bot |
| Ticket non visibile | non è `canale=whatsapp` | usare un ticket creato dal bot |

## App e deploy

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| Allegati spariti dopo rebuild | `uploads/` non montato | volume nel compose |
| Container unhealthy | dipendenze/worker/porta | `docker compose logs`, `ps` |
| CORS bloccato | middleware consente solo porta 3000 | usare stesso origin o proxy |
| Conteggi cruscotto diversi | fusi orari (Rome vs processo) | verificare il periodo e l'ambiente |
| Modifica non subito visibile | cache client 30 s | attendere o ricaricare |

## Documentazione

| Sintomo | Causa | Cosa fare |
| --- | --- | --- |
| `npm run docs:stato` esce con errore | link rotti | correggere i link elencati in `Stato documentazione.md` |
| Grafo non aggiornato | graphify assente o update non eseguito | `npm run docs:grafo` |
| Obsidian non vede la cartella | junction non seguita | riaprire Obsidian o aprire `docs/` come vault |

## Collegamenti

- [[Operatività/Setup locale|Setup locale]] · [[Operatività/Deploy Docker|Deploy Docker]]
- [[Architettura/Runtime e processi|Runtime e processi]] · [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
