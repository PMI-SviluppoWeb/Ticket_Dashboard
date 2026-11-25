---
title: API
aliases: []
tags:
  - auto
  - riferimento
  - api
aggiornato: 2026-11-25
commit: 81b3f92
---


> [!info] Nota generata automaticamente
> Fonte: codice del repository. Non modificare a mano: viene riscritta da `npm run docs:riferimenti`.


Route HTTP dell'app (91). Salvo le eccezioni pubbliche (login, questionario, webhook email, callback Gmail, `/api/esterni/*`), richiedono la sessione operatore; le route admin richiedono ruolo `admin`.

| Route | Metodi | File |
| --- | --- | --- |
| /api/admin/dashboard | GET | `app/api/admin/dashboard/route.ts` |
| /api/agenti | GET, POST | `app/api/agenti/route.ts` |
| /api/agenti/[id] | GET, PATCH, DELETE | `app/api/agenti/[id]/route.ts` |
| /api/agenti/[id]/assegnazioni | GET, PUT, DELETE | `app/api/agenti/[id]/assegnazioni/route.ts` |
| /api/agenti/[id]/conversazioni | GET, POST | `app/api/agenti/[id]/conversazioni/route.ts` |
| /api/agenti/[id]/conversazioni/[conversazioneId] | GET, DELETE | `app/api/agenti/[id]/conversazioni/[conversazioneId]/route.ts` |
| /api/agenti/[id]/esecuzioni | GET | `app/api/agenti/[id]/esecuzioni/route.ts` |
| /api/agenti/[id]/esegui | POST | `app/api/agenti/[id]/esegui/route.ts` |
| /api/agenti/[id]/pin | POST | `app/api/agenti/[id]/pin/route.ts` |
| /api/agenti/attivita | GET | `app/api/agenti/attivita/route.ts` |
| /api/agenti/conversazioni | GET | `app/api/agenti/conversazioni/route.ts` |
| /api/agenti/proposte | GET | `app/api/agenti/proposte/route.ts` |
| /api/agenti/proposte/[id] | GET, PATCH | `app/api/agenti/proposte/[id]/route.ts` |
| /api/agenti/proposte/[id]/approva | POST | `app/api/agenti/proposte/[id]/approva/route.ts` |
| /api/agenti/proposte/[id]/rifiuta | POST | `app/api/agenti/proposte/[id]/rifiuta/route.ts` |
| /api/attivita | GET, POST | `app/api/attivita/route.ts` |
| /api/attivita/[id] | GET, PATCH, DELETE | `app/api/attivita/[id]/route.ts` |
| /api/attivita/team | GET | `app/api/attivita/team/route.ts` |
| /api/auth/login | POST | `app/api/auth/login/route.ts` |
| /api/auth/logout | POST | `app/api/auth/logout/route.ts` |
| /api/auth/me | GET | `app/api/auth/me/route.ts` |
| /api/auth/register | POST | `app/api/auth/register/route.ts` |
| /api/calendario | GET | `app/api/calendario/route.ts` |
| /api/caselle | GET, POST | `app/api/caselle/route.ts` |
| /api/caselle/[id] | GET, PATCH, DELETE | `app/api/caselle/[id]/route.ts` |
| /api/caselle/[id]/accessi | GET, PUT | `app/api/caselle/[id]/accessi/route.ts` |
| /api/caselle/[id]/test | POST | `app/api/caselle/[id]/test/route.ts` |
| /api/caselle/poll | POST | `app/api/caselle/poll/route.ts` |
| /api/caselle/scopri | GET | `app/api/caselle/scopri/route.ts` |
| /api/caselle/visibili | GET | `app/api/caselle/visibili/route.ts` |
| /api/chiavi-api | GET, POST | `app/api/chiavi-api/route.ts` |
| /api/chiavi-api/[id] | DELETE | `app/api/chiavi-api/[id]/route.ts` |
| /api/clienti | GET | `app/api/clienti/route.ts` |
| /api/clienti/[id] | GET | `app/api/clienti/[id]/route.ts` |
| /api/clienti/[id]/commerciale | GET, PATCH | `app/api/clienti/[id]/commerciale/route.ts` |
| /api/clienti/[id]/questionari | GET, POST | `app/api/clienti/[id]/questionari/route.ts` |
| /api/clienti/[id]/questionari/[questionarioId] | DELETE | `app/api/clienti/[id]/questionari/[questionarioId]/route.ts` |
| /api/clienti/[id]/scheda | GET | `app/api/clienti/[id]/scheda/route.ts` |
| /api/clienti/panoramica | GET | `app/api/clienti/panoramica/route.ts` |
| /api/dashboard | GET | `app/api/dashboard/route.ts` |
| /api/direzione | GET | `app/api/direzione/route.ts` |
| /api/esterni/v1/clienti/cerca | GET | `app/api/esterni/v1/clienti/cerca/route.ts` |
| /api/esterni/v1/tickets | POST | `app/api/esterni/v1/tickets/route.ts` |
| /api/esterni/v1/tickets/[id] | GET | `app/api/esterni/v1/tickets/[id]/route.ts` |
| /api/esterni/v1/tickets/[id]/messaggi | POST | `app/api/esterni/v1/tickets/[id]/messaggi/route.ts` |
| /api/etichette | GET, POST | `app/api/etichette/route.ts` |
| /api/etichette/[id] | PATCH, DELETE | `app/api/etichette/[id]/route.ts` |
| /api/gmail/callback | GET | `app/api/gmail/callback/route.ts` |
| /api/gmail/connect | GET | `app/api/gmail/connect/route.ts` |
| /api/google/calendari | GET | `app/api/google/calendari/route.ts` |
| /api/google/config | GET, PATCH | `app/api/google/config/route.ts` |
| /api/google/stato | GET | `app/api/google/stato/route.ts` |
| /api/google/sync | POST | `app/api/google/sync/route.ts` |
| /api/google/verifica | POST | `app/api/google/verifica/route.ts` |
| /api/hooks/email | POST | `app/api/hooks/email/route.ts` |
| /api/impostazioni/email-interni | GET, PATCH | `app/api/impostazioni/email-interni/route.ts` |
| /api/inbox | GET | `app/api/inbox/route.ts` |
| /api/inbox/[id] | GET | `app/api/inbox/[id]/route.ts` |
| /api/inbox/[id]/azione | POST | `app/api/inbox/[id]/azione/route.ts` |
| /api/knowledge | GET, POST | `app/api/knowledge/route.ts` |
| /api/knowledge/[id] | GET, PATCH, DELETE | `app/api/knowledge/[id]/route.ts` |
| /api/knowledge/links | GET, POST | `app/api/knowledge/links/route.ts` |
| /api/knowledge/links/[id] | GET, PATCH, DELETE | `app/api/knowledge/links/[id]/route.ts` |
| /api/notifications | GET, POST, PATCH | `app/api/notifications/route.ts` |
| /api/notifications/[id] | PATCH | `app/api/notifications/[id]/route.ts` |
| /api/operatori | GET | `app/api/operatori/route.ts` |
| /api/operatori/[id] | PATCH, DELETE | `app/api/operatori/[id]/route.ts` |
| /api/operatori/stats | GET | `app/api/operatori/stats/route.ts` |
| /api/progetti | GET, POST | `app/api/progetti/route.ts` |
| /api/progetti/[id] | GET, PATCH, DELETE | `app/api/progetti/[id]/route.ts` |
| /api/progetti/[id]/attivita | GET, POST | `app/api/progetti/[id]/attivita/route.ts` |
| /api/progetti/[id]/tickets | GET, POST, DELETE | `app/api/progetti/[id]/tickets/route.ts` |
| /api/questionario | GET, POST | `app/api/questionario/route.ts` |
| /api/rapportini | GET, POST | `app/api/rapportini/route.ts` |
| /api/rapportini/[id] | GET, PATCH, DELETE | `app/api/rapportini/[id]/route.ts` |
| /api/report/ore | GET | `app/api/report/ore/route.ts` |
| /api/sla | GET, PATCH | `app/api/sla/route.ts` |
| /api/stats | GET | `app/api/stats/route.ts` |
| /api/tempi | GET, POST | `app/api/tempi/route.ts` |
| /api/tempi/[id] | PATCH, DELETE | `app/api/tempi/[id]/route.ts` |
| /api/tempi/bersaglio | GET | `app/api/tempi/bersaglio/route.ts` |
| /api/tickets | GET, POST | `app/api/tickets/route.ts` |
| /api/tickets/[id] | GET, PATCH, DELETE | `app/api/tickets/[id]/route.ts` |
| /api/tickets/[id]/assistente | POST | `app/api/tickets/[id]/assistente/route.ts` |
| /api/tickets/[id]/email | GET, POST | `app/api/tickets/[id]/email/route.ts` |
| /api/tickets/[id]/messages | POST | `app/api/tickets/[id]/messages/route.ts` |
| /api/tickets/[id]/notes | POST | `app/api/tickets/[id]/notes/route.ts` |
| /api/tickets/[id]/notes/[noteId] | PATCH, DELETE | `app/api/tickets/[id]/notes/[noteId]/route.ts` |
| /api/tickets/[id]/notes/[noteId]/send-email | POST | `app/api/tickets/[id]/notes/[noteId]/send-email/route.ts` |
| /api/uploads | POST | `app/api/uploads/route.ts` |
| /api/uploads/[id] | GET, DELETE | `app/api/uploads/[id]/route.ts` |

## Route pubbliche

- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/register`
- `/api/questionario` (token del questionario pubblico)
- `/api/hooks/email` (webhook worker, protetto da `x-webhook-secret`)
- `/api/gmail/callback` (OAuth Gmail)
- `/api/esterni/v1/*` (chiave API `Authorization: Bearer`)
