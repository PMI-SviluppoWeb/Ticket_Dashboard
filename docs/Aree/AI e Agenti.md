---
title: AI e Agenti
aliases:
  - Agenti
  - Copilot
  - AI
tags:
  - area/ai
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# AI e Agenti

Agenti configurabili che leggono i dati dell'app (ticket, clienti, statistiche)
e possono **proporre** progetti con attività. Nessuna scrittura automatica: le
proposte richiedono approvazione umana.

## Pagine

| Cosa | Dove |
| --- | --- |
| I miei agenti | `app/agenti/page.tsx` |
| Monitor esecuzioni | `app/agenti/attivita/page.tsx` |
| Proposte (elenco) | `app/agenti/proposte/page.tsx` |
| Proposta (dettaglio) | `app/agenti/proposte/[id]/page.tsx` |
| Configurazione admin | `app/admin/agenti/page.tsx` |
| Copilot globale | `components/copilot/CopilotContext.tsx`, `CopilotDrawer.tsx`, `CopilotTrigger.tsx` |
| Card proposta | `components/copilot/PropostaProgettoCard.tsx` |
| Form agente | `components/agenti/AgenteForm.tsx` |
| Assegnazioni | `components/agenti/AssegnazioniPanel.tsx` |

## Provider (`lib/ai-provider.ts`)

Due backend con lo stesso formato OpenAI Chat Completions:

| Provider | Quando | Tool |
| --- | --- | --- |
| `hermes` | `HERMES_BASE_URL` presente e agente senza tools | no (Hermes non vede il DB) |
| `openrouter` | default o agente con tools | sì, loop **in-app** |

- Modello di default: `deepseek/deepseek-v4.1-flash-1017`
  (`AI_MODEL_DEFAULT` / `OPENROUTER_MODEL` / `HERMES_MODEL`).
- OpenRouter usa `provider.data_collection: "deny"`.
- Un agente **con strumenti** usa sempre OpenRouter: le query le esegue la
  nostra app in `lib/agenti-tools.ts`.
- Gli agenti con ruolo `assistente` (legge contenuti clienti) non possono usare
  Hermes.

## Strumenti e gruppi

| Gruppo | Tool | Scrittura |
| --- | --- | --- |
| Ticket | `cerca_ticket`, `get_ticket` | sola lettura |
| Clienti | `cerca_clienti`, `get_cliente` | sola lettura |
| Statistiche | `statistiche_dashboard` | sola lettura |
| Operazioni | `proponi_progetto_con_task` | crea **solo una proposta** |

Definizioni pure in `lib/agenti-tools-def.ts` (condivise con la UI admin);
esecuzione in `lib/agenti-tools.ts`. Risultati troncati per non gonfiare il
contesto.

## Esecuzione (`lib/agenti.ts`)

1. Risolve il provider; costruisce il prompt = `system_prompt` + sezione
   `## COMPITO DI DEFAULT` con `istruzioni_default`.
2. Registra l'esecuzione `in_corso` in `agenti_esecuzioni`.
3. Loop strumenti max **6 turni** + 1 turno finale forzato senza tools.
4. Ogni chiamata tool è tracciata (turno, tool, argomenti, esito troncato).
5. Chiude l'esecuzione con stato, durata, token e trace.

## Memoria e contesto

- Storico massimo 12 esecuzioni / 12.000 caratteri / 4.000 per messaggio.
- Contesto ticket: ultimi 6 messaggi, ultime 3 note, descrizione delimitata
  come **contenuto non fidato**.
- Contesto cliente e progetto (solo id).
- Il Copilot passa il contesto della pagina corrente solo per
  `/tickets/[id]`, `/clienti/[id]`, `/progetti/[id]`.

## Proposte (`lib/proposte.ts`, `lib/proposte-schema.ts`)

- Tabella `agenti_proposte`: stato `in_attesa | approvata | rifiutata`.
- Payload validato: nome progetto obbligatorio, max 30 attività, date
  `YYYY-MM-DDTHH:mm`, priorità ammesse, max 20 persone.
- Modifica consentita solo se `in_attesa`.
- Approvazione: richiede cliente, crea progetto `PIANIFICATO` + attività
  `DA_FARE`, notifica il proponente. Rifiuto con notifica.
- Permessi: admin o autore della proposta.

## API

| Route | Metodi |
| --- | --- |
| `/api/agenti` | GET, POST |
| `/api/agenti/[id]` | GET, PATCH, DELETE |
| `/api/agenti/[id]/esegui` | POST |
| `/api/agenti/[id]/conversazioni` + `/[conversazioneId]` | GET, POST, DELETE |
| `/api/agenti/[id]/esecuzioni` | GET |
| `/api/agenti/[id]/assegnazioni` | GET, PUT, DELETE (admin) |
| `/api/agenti/[id]/pin` | POST |
| `/api/agenti/proposte` + `[id]` | GET, PATCH |
| `/api/agenti/proposte/[id]/approva`, `/rifiuta` | POST |
| `/api/agenti/attivita` | GET (monitor) |

## Permessi

- Agenti personali: il proprietario; agenti di libreria: visibili a tutti salvo
  disabilitazione per operatore.
- Admin: vede e gestisce tutto, incluse le assegnazioni e gli agenti personali
  degli altri.
- Un non-admin può creare solo agenti personali e non può cambiarne la
  visibilità.

## Punti d'attenzione

> [!warning] Da sapere
> - `GET /api/agenti/[id]/esecuzioni` non filtra per operatore: chi può usare un
>   agente di libreria vede le esecuzioni di tutti per quell'agente.
> - Le sezioni del monitor usano polling 5 s solo se c'è un'esecuzione in corso.
> - Il modello DeepSeek è condiviso da Hermes e OpenRouter; cambiarlo richiede
>   di aggiornare gli agenti già salvati (la migrazione v4 ha allineato i
>   vecchi `gpt-4o-mini`).
> - Hermes non riceve mai i tools: un agente "operativo" deve stare su OpenRouter.

## Collegamenti

- [[Flussi/Proposta agente a progetto|Proposta agente a progetto]]
- [[Aree/Progetti|Progetti]] · [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
- [[Riferimenti/Variabili ambiente|Variabili ambiente]]
