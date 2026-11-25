import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ===========================================================================
// Rigenera il grafo del codice con graphify e copia il wiki in docs/_grafo/.
//
// graphify e' uno strumento esterno: se non e' installato la documentazione
// curata e i riferimenti restano validi, quindi questo script avvisa e termina
// senza errore. Il grafo vive in `_grafo/` per non sporcare le note curate.
// ===========================================================================

const ROOT = process.cwd();
const SORGENTE = join(ROOT, "graphify-out", "wiki");
const DESTINAZIONE = join(ROOT, "docs", "_grafo");

function esegui(comando: string): boolean {
  const esito = spawnSync(comando, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  if (esito.error || esito.status !== 0) {
    const dettaglio = (esito.stderr || esito.stdout || "").trim().split(/\r?\n/);
    console.warn(
      `${comando} non riuscito` +
        (esito.error ? `: ${esito.error.message}` : ` (exit ${esito.status}).`)
    );
    for (const riga of dettaglio.slice(-8)) console.warn(`  ${riga}`);
    return false;
  }
  console.log(`  ${comando}: ok`);
  return true;
}

const versione = spawnSync("graphify --version", {
  cwd: ROOT,
  encoding: "utf8",
  shell: true,
});
if (versione.error || versione.status !== 0) {
  console.warn(
    "graphify non disponibile: salto l'aggiornamento del grafo.\n" +
      "Installa graphify e rilancia `npm run docs:grafo`."
  );
  process.exit(0);
}

console.log("Aggiornamento grafo (incrementale, senza LLM)...");
if (!esegui("graphify update .")) process.exit(0);

console.log("Export wiki...");
if (!esegui("graphify export wiki")) process.exit(0);

if (!existsSync(SORGENTE)) {
  console.warn(`Wiki non trovata in ${SORGENTE}: niente da copiare.`);
  process.exit(0);
}

rmSync(DESTINAZIONE, { recursive: true, force: true });
mkdirSync(DESTINAZIONE, { recursive: true });

let copiati = 0;
for (const nome of readdirSync(SORGENTE)) {
  if (!nome.endsWith(".md")) continue;
  const origine = join(SORGENTE, nome);
  const destinazione = join(DESTINAZIONE, nome);
  if (nome === "index.md") {
    const testo = readFileSync(origine, "utf8");
    const banner =
      "> [!info] Generato da graphify\n" +
      "> Sezione automatica: si rigenera con `npm run docs:grafo`.\n" +
      "> Per la documentazione ragionata parti da [[Ticket Dashboard]].\n\n";
    writeFileSync(destinazione, banner + testo, "utf8");
  } else {
    copyFileSync(origine, destinazione);
  }
  copiati += 1;
}

const report = join(ROOT, "graphify-out", "GRAPH_REPORT.md");
if (existsSync(report)) {
  copyFileSync(report, join(DESTINAZIONE, "GRAPH_REPORT.md"));
  copiati += 1;
}

const generato = [
  "---",
  "title: Grafo del codice",
  "aliases: []",
  "tags:",
  "  - auto",
  "  - grafo",
  "---",
  "",
  "# Grafo del codice",
  "",
  "> [!info] Sezione generata automaticamente",
  "> Fonte: `graphify-out/` (ignorato da git). Comandi: `npm run docs:grafo`.",
  "> La wiki (`docs/_grafo/*.md`) è rigenerabile e non è versionata: resta",
  "> disponibile in Obsidian dopo ogni `npm run docs:grafo`.",
  "",
  "- [[index]] — indice delle community del codice",
  "- `GRAPH_REPORT.md` — report di estrazione (nodi, archi, community, freschezza)",
  "",
  "Il grafo e' uno strumento di navigazione: per il *perche'* delle scelte usa",
  "[[Architettura/Stack e struttura|Stack e struttura]] e le note delle aree.",
  "",
].join("\n");
writeFileSync(join(DESTINAZIONE, "_generato.md"), generato, "utf8");

console.log(`Wiki copiata in docs/_grafo (${copiati} file).`);
