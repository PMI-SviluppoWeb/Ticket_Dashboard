---
title: Backup e ripristino
aliases:
  - Backup
  - Ripristino
tags:
  - operativita
verificato_al_commit: 81b3f92
created: 2026-11-25
---

# Backup e ripristino

## Backup del database

```powershell
npm run backup-db
```

`scripts/backup-turso.ts` produce un file SQL autonomo (schema + dati) in
`backups/turso-<data>.sql`.

- È di **sola lettura**: non scrive mai sul database.
- Richiede `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` (le stesse dell'app).
- `backups/` è in `.gitignore`: il file resta in locale.

## Ripristino

Con il Turso CLI:

```powershell
turso db shell <database> < backups/<file>.sql
```

Il file è SQL standard: si può anche aprire con un client SQLite.

> [!warning] Il ripristino sovrascrive
> È un'operazione distruttiva: verificare il file e, se possibile, provare su un
> database di test prima della produzione.

## Cosa non è coperto

- **`uploads/`**: gli allegati sono file su disco/volume. Il backup del DB non li
  include; vanno salvati a parte (es. backup del volume Docker).
- **`.env`**: i segreti stanno fuori dal repository; conservarli in un gestore
  di segreti.
- **Google Calendar**: gli eventi remoti si possono ricreare con la
  riconciliazione, ma non sono nel backup.

## Quando farlo

- Prima di una migrazione o di un aggiornamento importante.
- Periodicamente in produzione (conservare più copie, non solo l'ultima).
- Prima di operazioni manuali sul DB.

## Vecchio SQLite

`data/tickets.db.backup-pre-turso` è il residuo della migrazione a Turso. Non è
la fonte attuale: serve solo come archivio storico.

## Collegamenti

- [[Operatività/Deploy Docker|Deploy Docker]] · [[Operatività/Troubleshooting|Troubleshooting]]
- [[Architettura/Pattern dati e API|Pattern dati e API]]
