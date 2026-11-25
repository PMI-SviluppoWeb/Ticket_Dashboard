---
title: Glossario
aliases:
  - Glossario
  - Termini
tags:
  - glossario
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Glossario

| Termine | Significato |
| --- | --- |
| **Ticket** | Richiesta di assistenza. Numero `TICK-%06d`. Stati: `NUOVO`, `IN_CORSO`, `RISOLTO`, `CHIUSO`. |
| **Canale** | Origine del ticket: `manuale`, `email`, `whatsapp` (il valore `telefono` esiste ma non è usato). |
| **Presa in carico** | Transizione a `IN_CORSO`; imposta operatore e data di inizio lavoro. |
| **Nota tecnica** | Intervento interno con titolo e soluzione; può essere inviato al cliente via email. |
| **SLA** | Obiettivi di presa in carico/risoluzione per priorità, in **minuti lavorativi**. |
| **Minuti lavorativi** | Tempo calcolato su orario d'ufficio, pausa e festivi (`lib/sla.ts`). Diverso dal tempo reale del report ore. |
| **Progetto** | Lavoro extra-assistenza. Stati: `PIANIFICATO`, `IN_CORSO`, `IN_PAUSA`, `COMPLETATO`, `ANNULLATO`. |
| **Attività / task** | Elemento di lavoro di un progetto (o evento libero) con date, stato, persone. |
| **Sezione** | Raggruppamento locale delle task nella board (non persistito). |
| **Proposta** | Bozza di progetto + attività creata da un agente AI, in attesa di approvazione umana. |
| **Agente** | Configurazione AI: prompt, modello, strumenti, provider, visibilità. |
| **Copilot** | Pannello globale dell'AI, disponibile su tutte le pagine. |
| **Esecuzione** | Una chiamata dell'agente, loggata in `agenti_esecuzioni` con token e trace. |
| **Conversazione** | Thread agente + operatore, con più esecuzioni. |
| **Tool / strumento** | Funzione che l'agente può chiamare (`cerca_ticket`, `proponi_progetto_con_task`, ...). |
| **Gruppo di strumenti** | Insieme di tool abilitabili dalla UI admin (Ticket, Clienti, Statistiche, Operazioni). |
| **Casella** | Account email IMAP o Gmail configurato in `/admin/email`. |
| **Triage** | Classificazione automatica delle email in `ticket`, `da_verificare`, `ignora`. |
| **Mittente interno** | Indirizzo/dominio considerato interno; non crea ticket. |
| **Threading** | Aggancio di una risposta al ticket giusto tramite header o token `[TICK-…]`. |
| **Rapportino** | Documento di chiusura ticket: ore, attività, snapshot cliente. Numero `RAP-…`. |
| **Voce tempo** | Intervallo del cronometro (`voci_tempo`); una sola aperta per operatore. |
| **Etichetta** | Categoria colorata del calendario, locale (non va su Google). |
| **Questionario** | Form pubblico con token monouso per raccogliere informazioni dal cliente. |
| **Inventario IT** | Vista derivata dalle risposte dei questionari (computer, server, software...). |
| **Chiave API** | Credenziale macchina per `/api/esterni/v1`, mostrata una volta e salvata come hash. |
| **Idempotency-Key** | Header che evita la doppia creazione di un ticket da parte del bot. |
| **Registro attività** | Audit generico (`registro_attivita`) con origine utente/agente/api/sistema. |
| **Area** | Gruppo di pagine nella navigazione (Dashboard, Progetti, Admin, ...). |
| **Admin / Operatore** | Ruoli. L'admin vede aree riservate e gestisce configurazione e utenti. |

## Collegamenti

- [[Ticket Dashboard|Indice]]
- [[Aree/Ticket|Ticket]] · [[Aree/Progetti|Progetti]] · [[Aree/AI e Agenti|AI e Agenti]]
