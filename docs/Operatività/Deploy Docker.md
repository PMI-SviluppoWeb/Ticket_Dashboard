---
title: Deploy Docker
aliases:
  - Deploy
  - Produzione
tags:
  - operativita
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Deploy Docker

Stack: un container `ticket-dashboard` (Next + worker email/sync) su porta
**3001**.

## Come avviene

- Push su `main` → GitHub Actions con runner **self-hosted** (container Proxmox).
- Il job ripristina `.env` da `/opt/secrets/ticket-dashboard.env`.
- Gate: `docker build --target check .` esegue typecheck + test; se fallisce, la
  produzione non viene toccata.
- Build e avvio: `docker compose up -d --build --wait`.
- `clean: false` nel checkout preserva `.env` e `uploads/`.

Workflow: `.github/workflows/deploy.yml`.

## Dockerfile

Multi-stage:

| Stage | Cosa fa |
| --- | --- |
| `deps` | `npm ci` completo |
| `prod-deps` | `npm ci --omit=dev` per il runtime |
| `check` | typecheck + test (usato dalla CI) |
| `builder` | `next build` |
| `runner` | immagine finale Node 22 Alpine, non-root, `tini` |

Il runner copia anche `lib/` e `scripts/` e installa `tsx@4.23.13` fisso: il
worker ne ha bisogno e Next non lo traccia.

## docker-compose

| Voce | Valore |
| --- | --- |
| Porta | `3001:3001` |
| Env | `env_file: .env` |
| Volume | `./uploads:/app/uploads` (allegati persistenti) |
| Limiti | 1 GB RAM, 1.5 CPU |
| Log | rotazione 10 MB × 3 |
| Healthcheck | HTTP su `127.0.0.1:3001` |
| Avvio | `scripts/start-services.sh` (worker + Next) |

> [!warning] `uploads/` è un volume
> Se non è montato, gli allegati spariscono a ogni rebuild. È il primo punto da
> controllare in caso di file mancanti.

## Variabili in produzione

Obbligatorie: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`,
`WEBHOOK_SECRET`, `ENCRYPTION_KEY`. Senza `WEBHOOK_SECRET` il webhook risponde
`503` e nessuna email diventa ticket. Il secret deve essere identico per app e
worker (stesso `.env`).

Elenco completo: [[Riferimenti/Variabili ambiente|Variabili ambiente]].
Modello: `.env.docker.example`.

## Comandi utili

```powershell
docker compose config                 # valida il compose
docker compose up -d --build          # build + avvio
docker compose ps                     # stato/health
docker compose logs -f ticket-dashboard
docker stats                          # RAM/CPU
```

Test dopo il deploy:

- login e dashboard su `http://<host>:3001`;
- log worker senza errori;
- email di test → ticket in `/inbox`;
- allegato → file in `uploads/`.

## Aggiornare

1. Push su `main` (la CI fa check + deploy), oppure sul server:
   `git pull && docker compose up -d --build`.
2. Verificare `docker compose ps` e i log.
3. Se ci sono migrazioni dati, fare prima il backup:
   [[Operatività/Backup e ripristino|Backup e ripristino]].

## Collegamenti

- `DEPLOY.md` nel repository (guida dettagliata)
- [[Architettura/Runtime e processi|Runtime e processi]]
- [[Operatività/Troubleshooting|Troubleshooting]]
