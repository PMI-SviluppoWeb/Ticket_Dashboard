---
title: Ticket Dashboard
aliases:
  - Ticket Dashboard
  - Support Desk
tags:
  - moc
created: 2026-11-25
---

# Ticket Dashboard

Documentazione del progetto **Ticket Dashboard** (PMI Software): help desk per
Arca Evolution con ticket, email, progetti, clienti, calendario, rapportini e
agenti AI.

> [!tip] Da dove partire
> - **Capire il quadro**: [[Architettura/Stack e struttura|Stack e struttura]] → [[Architettura/Pattern dati e API|Pattern dati e API]]
> - **Una funzione specifica**: scegli l'area qui sotto
> - **Un percorso completo**: [[Flussi/Email a ticket|Email a ticket]], [[Flussi/Chiusura e rapportino|Chiusura e rapportino]], [[Flussi/Proposta agente a progetto|Proposta agente a progetto]]
> - **Cercare un file o una route**: [[Riferimenti/Pagine|Pagine]], [[Riferimenti/API|API]], [[Modello dati/Tabelle|Tabelle]]

## Aree dell'app

| Area | A cosa serve | Note |
| --- | --- | --- |
| Dashboard | Vista operativa di oggi: ticket, calendario, inbox, task | [[Aree/Dashboard e Direzione\|Dashboard e Direzione]] |
| Direzione | Vista "oggi" per admin: squadra, SLA, carichi | [[Aree/Dashboard e Direzione\|Dashboard e Direzione]] |
| Ticket | Presa in carico, conversazione, note, SLA, chiusura | [[Aree/Ticket\|Ticket]] |
| Progetti | Lavori extra-assistenza, kanban per stato, task | [[Aree/Progetti\|Progetti]] |
| Clienti | Scheda 360, dati commerciali, questionari, inventario | [[Aree/Clienti\|Clienti]] |
| Email | Posta in arrivo multi-casella e triage AI | [[Aree/Email e Inbox\|Email e Inbox]] |
| Calendario | Eventi e task, viste giorno/settimana/mese, sync Google | [[Aree/Calendario\|Calendario]] |
| AI | Agenti, Copilot, conversazioni, proposte | [[Aree/AI e Agenti\|AI e Agenti]] |
| Rapportini | Documento di chiusura ticket con ore e snapshot cliente | [[Aree/Rapportini\|Rapportini]] |
| Report | Ore per fatturazione, cronometro | [[Aree/Report ore\|Report ore]] |
| Knowledge | Base di conoscenza PDF e link | [[Aree/Knowledge\|Knowledge]] |
| Admin | Operatori, SLA, chiavi API, agenti, caselle | [[Aree/Admin\|Admin]] |
| Questionario | Form pubblico per conoscere il cliente | [[Aree/Questionario pubblico\|Questionario pubblico]] |

## Architettura

- [[Architettura/Stack e struttura|Stack e struttura]] — Next.js App Router, TypeScript, Tailwind, Turso
- [[Architettura/Autenticazione e ruoli|Autenticazione e ruoli]] — sessioni, JWT, admin/operatore
- [[Architettura/Pattern dati e API|Pattern dati e API]] — accesso a Turso, route, cache, audit
- [[Architettura/Runtime e processi|Runtime e processi]] — worker email/sync e deploy Docker
- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]] — cifratura, chiavi, upload, prompt injection

## Flussi end-to-end

- [[Flussi/Email a ticket|Email a ticket]] — worker → webhook → triage → ticket
- [[Flussi/Chiusura e rapportino|Chiusura e rapportino]] — ore + note → documento
- [[Flussi/Proposta agente a progetto|Proposta agente a progetto]] — AI propone, umano approva
- [[Flussi/Sync clienti|Sync clienti]] — Arca (API o SQL Server) → anagrafica locale
- [[Flussi/Google Calendar|Google Calendar]] — attività → evento Google (una direzione)
- [[Flussi/API macchina Hermes|API macchina Hermes]] — bot WhatsApp con chiave API

## Riferimenti e modello dati

- [[Modello dati/Panoramica e ER|Panoramica e ER]] — gruppi di tabelle e relazioni
- [[Riferimenti/Pagine|Pagine]] · [[Riferimenti/API|API]] · [[Riferimenti/Moduli lib|Moduli lib]] · [[Riferimenti/Script e worker|Script e worker]] · [[Riferimenti/Variabili ambiente|Variabili ambiente]]
- [[Modello dati/Tabelle|Tabelle]] — tutte le tabelle con le colonne
- [[_grafo/_generato|Grafo del codice]] — mappa generata da graphify

## Operatività

- [[Operatività/Setup locale|Setup locale]] — `.env`, dev, worker
- [[Operatività/Deploy Docker|Deploy Docker]] — immagine, compose, verifiche
- [[Operatività/Backup e ripristino|Backup e ripristino]] — Turso
- [[Operatività/Troubleshooting|Troubleshooting]] — problemi ricorrenti

## Documenti storici

- [[hermes-api]] — API macchina per il bot WhatsApp
- [[MIGRAZIONE-API-ARCA]] — passaggio da SQL Server alle API Arca
- `presentazione-support-desk.html` — presentazione (allegato)

## Manutenzione

- Le note curate si aggiornano a mano; quelle `auto` si rigenerano con `npm run docs`.
- [[Stato documentazione]] dice a che commit siamo e se ci sono link rotti.
- [[00-come-usare]] spiega convenzioni, tag e come aggiungere una nota.

---

> [!info] Questo vault e' la cartella `docs/` del repository
> Il vault Obsidian punta a `C:\Users\Mirko Pandolfi\Desktop\App Ticket Dashboard\docs`
> (junction in `Documents\Obsidian Vault\Ticket Dashboard`). Le modifiche fatte
> qui sono modifiche al repository.
