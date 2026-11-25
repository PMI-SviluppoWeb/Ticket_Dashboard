---
title: Stack e struttura
aliases:
  - Architettura
  - Stack
tags:
  - architettura
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Stack e struttura

Applicazione **Next.js 14 App Router** per il supporto clienti PMI Software.
Frontend e backend convivono nello stesso processo Next; i processi di
background (email, sync) girano in un worker separato.

## Stack

| Pezzo | Scelta | Dove |
| --- | --- | --- |
| Framework | Next.js `14.2.x`, React 18 | `package.json`, `app/` |
| Linguaggio | TypeScript strict, alias `@/*` → root | `tsconfig.json` |
| UI | Tailwind con design system custom | `tailwind.config.ts`, `components/` |
| Database | Turso/libSQL remoto, SQL esplicito | `lib/db.ts`, `lib/turso-client.ts` |
| Email | IMAP (`imapflow`), Gmail API, SMTP (`nodemailer`) | `lib/imap-worker.ts`, `lib/gmail-worker.ts`, `lib/email.ts` |
| PDF | `unpdf` per estrarre testo (Knowledge) | `app/api/knowledge/route.ts` |
| AI | OpenRouter o Hermes, formato OpenAI Chat Completions | `lib/ai-provider.ts` |
| Test | `node:test` via `tsx` | `lib/__tests__/` |

## Comandi

```powershell
npm run dev        # Next su :3001
npm run worker     # worker IMAP + Gmail + sync clienti
npm run build
npm run start
npm run typecheck
npm run test
npm run lint
npm run docs       # documentazione (vedi 00-come-usare)
```

## Struttura cartelle

```
app/                 pagine (App Router) + API route
  api/               route HTTP, una cartella per dominio
components/          componenti React, sottocartelle per dominio
lib/                 logica server e dati (SQL, auth, email, AI, ...)
  sync/              sincronizzazione clienti (API Arca / SQL Server)
  __tests__/         test unitari
scripts/             worker, manutenzione, documentazione
docs/                questa documentazione (vault Obsidian)
public/              asset statici
uploads/             allegati caricati (volume Docker, fuori da git)
```

- `app/` è organizzato per **dominio**: `tickets`, `progetti`, `clienti`,
  `inbox`, `calendario`, `agenti`, `rapportini`, `admin`, ecc.
- `components/` rispecchia i domini (`components/calendario/`,
  `components/clienti/`, `components/agenti/`, `components/copilot/`).
- `lib/` contiene sia moduli **server-only** sia moduli **puri** condivisibili
  col client. La distinzione è importante: vedi [[Architettura/Pattern dati e API|Pattern dati e API]].

## Design system

- Palette in `tailwind.config.ts`: superfici crema, inchiostro, unico accento
  `lime`; famiglie **semantiche** di stato (`stato.urgenza`, `attesa`, `ok`,
  `info`, `malva`, `neutro`) con `bg`/`testo`/`bordo`.
- `components/badges.tsx` è la spina dorsale cromatica: chip, priorità, stati
  ticket/progetto/attività, label italiane. Le modifiche qui si propagano in
  tutta l'app.
- Font: Inter per il corpo, Outfit (`--font-display`) per titoli e cifre.
- `components/AppShell.tsx` monta sidebar, Copilot e cronometro globale; le
  rotte pubbliche (questionario) non hanno chrome.

## Chi fa cosa (confini)

| Livello | Responsabilità | Non deve fare |
| --- | --- | --- |
| `app/**/page.tsx` | UI, stato locale, chiamate API | query SQL dirette |
| `app/api/**/route.ts` | auth, validazione input, risposta HTTP | logica di dominio complessa |
| `lib/*.ts` | dominio e accesso dati | decidere ruoli o redirect |
| `lib/*-worker.ts`, `scripts/` | processi fuori da Next | usare `server-only` (girano fuori) |

## Collegamenti

- [[Architettura/Autenticazione e ruoli|Autenticazione e ruoli]]
- [[Architettura/Pattern dati e API|Pattern dati e API]]
- [[Architettura/Runtime e processi|Runtime e processi]]
- [[Architettura/Sicurezza e segreti|Sicurezza e segreti]]
- [[Riferimenti/Pagine|Elenco pagine]] · [[Riferimenti/API|Elenco API]]
