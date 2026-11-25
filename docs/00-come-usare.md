---
title: Come usare questa documentazione
aliases:
  - Come usare la documentazione
tags:
  - guida
created: 2026-11-25
---

# Come usare questa documentazione

## Fonte di verità

Le note vivono in `docs/` **dentro il repository** e sono versionate con git.
Obsidian le vede tramite una junction:

```
C:\Users\Mirko Pandolfi\Documents\Obsidian Vault\Ticket Dashboard
  → C:\Users\Mirko Pandolfi\Desktop\App Ticket Dashboard\docs
```

Quindi: una modifica fatta in Obsidian è una modifica al repository (e va
committata). Non esiste una copia separata da tenere allineata.

## Curato vs generato

| Tipo | Come si riconosce | Chi lo aggiorna |
| --- | --- | --- |
| Curato | tag `architettura`, `area/*`, `flusso`, `operativita` | una persona, quando cambia il comportamento |
| Generato | tag `auto` + callout "Nota generata automaticamente" | `npm run docs` |

Cartelle generate: `Riferimenti/`, `_grafo/`, `Modello dati/Tabelle.md`,
`Stato documentazione.md`. Non modificarle a mano: vengono riscritte.

> [!info] `_grafo/` non è versionata
> La wiki del grafo (139+ articoli) è una cache rigenerabile: in git resta solo
> `_grafo/_generato.md`. In Obsidian la vedi comunque dopo `npm run docs:grafo`.

## Frontmatter

```yaml
---
title: Nome nota
aliases: []
tags:
  - area/ticket
verificato_al_commit: 81b3f92
created: 2026-11-25
---
```

- `verificato_al_commit`: ultimo commit di **codice** a cui la nota è stata
  verificata. [[Stato documentazione]] conta i commit di codice successivi e
  segnala le note ferme.
- Aggiorna questo campo quando rileggi e confermi una nota dopo una modifica.

## Tag usati

- `moc` — nota indice
- `architettura` — come è fatta l'app
- `area/ticket`, `area/progetti`, `area/clienti`, `area/email`, `area/calendario`,
  `area/ai`, `area/rapportini`, `area/report`, `area/knowledge`, `area/admin`,
  `area/questionario`, `area/dashboard`
- `flusso` — percorso end-to-end tra più aree
- `operativita` — setup, deploy, backup, problemi
- `riferimento` — elenco generato dal codice
- `auto` — generato
- `glossario`

## Comandi

```powershell
npm run docs             # riferimenti + grafo + stato
npm run docs:riferimenti # solo Pagine/API/Moduli/Script/Env/Tabelle
npm run docs:grafo       # graphify update + export wiki in docs/_grafo
npm run docs:stato       # Stato documentazione + controllo link rotti
```

`npm run docs:stato` esce con errore se trova link rotti: è il semaforo prima
di un commit.

## Stile delle note

- Italiano, tono diretto.
- Wikilink per le note (`[[Aree/Ticket|Ticket]]`), path di codice in inline
  code (`` `lib/tickets.ts` ``). Non esistono link cliccabili al codice da
  Obsidian: il path serve a ritrovarlo nell'editor.
- Callout per avvisi e comportamenti non ovvi:
  `> [!warning]`, `> [!info]`, `> [!tip]`.
- Ogni nota di area ha: scopo, pagine e API, file chiave, tabelle, flussi,
  permessi, punti d'attenzione.

## Aggiungere una nota

1. Scegli la cartella giusta (`Aree/`, `Flussi/`, `Architettura/`, `Operatività/`).
2. Copia il frontmatter e valorizza `verificato_al_commit` con `git rev-parse --short HEAD`.
3. Linkala dalla nota pertinente e, se è una nuova area, da [[Ticket Dashboard]].
4. Esegui `npm run docs:stato` e correggi eventuali link rotti.

## Se Obsidian non vede la cartella

La junction è un collegamento di Windows. Se Obsidian non la mostra:

1. Chiudi e riapri Obsidian.
2. Se ancora manca, apri `docs/` come vault separato (Obsidian → "Apri cartella
   come vault"). La fonte resta questa, cambia solo il contenitore.
