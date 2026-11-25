import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, normalize, relative, sep } from "node:path";

// ===========================================================================
// Genera `docs/Stato documentazione.md`: fotografia di HEAD, grafo, note curate
// e link rotti. E' il controllo di salute del vault Obsidian.
//
// Esce con codice 1 se trova link rotti: cosi' `npm run docs` fallisce prima
// di lasciare in giro una documentazione che punta a note inesistenti.
// ===========================================================================

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const OGGI = new Date().toISOString().slice(0, 10);

function git(args: string[]): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const HEAD = git(["rev-parse", "--short", "HEAD"]) || "sconosciuto";
const COMMIT =
  git([
    "log",
    "-1",
    "--format=%h",
    "--",
    "app",
    "components",
    "lib",
    "middleware.ts",
    "next.config.mjs",
    "tailwind.config.ts",
  ]) || HEAD;

function relativo(assoluto: string): string {
  return relative(ROOT, assoluto).split(sep).join("/");
}

function cammina(dir: string, filtro: (assoluto: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome.startsWith(".")) continue;
    const pieno = join(dir, nome);
    const stat = statSync(pieno);
    if (stat.isDirectory()) out.push(...cammina(pieno, filtro));
    else if (filtro(pieno)) out.push(pieno);
  }
  return out.sort();
}

function leggi(assoluto: string): string {
  return existsSync(assoluto) ? readFileSync(assoluto, "utf8") : "";
}

function testata(titolo: string, tags: string[]): string {
  return [
    "---",
    `title: ${titolo}`,
    "aliases: []",
    "tags:",
    ...tags.map((t) => `  - ${t}`),
    `aggiornato: ${OGGI}`,
    `commit: ${COMMIT}`,
    "---",
    "",
  ].join("\n") + "\n";
}

// Note generate: non entrano nel controllo dei link (il wiki di graphify ha
// nomi con parentesi quadre che Obsidian non risolve sempre).
const CARTELLE_GENERATE = ["_grafo", "Riferimenti"];
const FILE_GENERATI = ["Modello dati/Tabelle.md", "Stato documentazione.md"];

function eGenerata(rel: string): boolean {
  return (
    CARTELLE_GENERATE.some((c) => rel.startsWith(`docs/${c}/`)) ||
    FILE_GENERATI.includes(rel.replace(/^docs\//, ""))
  );
}

interface Nota {
  assoluto: string;
  rel: string;
  senzaEstensione: string;
  nome: string;
  testo: string;
}

function leggiNote(): Nota[] {
  return cammina(DOCS, (p) => p.endsWith(".md")).map((assoluto) => {
    const rel = relativo(assoluto);
    return {
      assoluto,
      rel,
      senzaEstensione: rel.replace(/^docs\//, "").replace(/\.md$/i, ""),
      nome: basename(assoluto, ".md"),
      testo: leggi(assoluto),
    };
  });
}

// ---------------------------------------------------------------------------
// Link rotti
// ---------------------------------------------------------------------------
interface LinkRotto {
  nota: string;
  link: string;
}

function risolveWikilink(
  link: string,
  nota: Nota,
  perNome: Map<string, Nota[]>
): boolean {
  // Nelle tabelle Markdown il separatore dell'alias va scritto `\|`:
  // Obsidian lo interpreta come `|`, quindi il controllo deve fare lo stesso.
  let target = link.replace(/\\\|/g, "|").split("|")[0].split("#")[0].trim();
  if (!target) return true;
  target = target.replace(/^\/+/, "");
  const senzaMd = target.replace(/\.md$/i, "");

  if (senzaMd.includes("/")) {
    const daRadice = join(DOCS, senzaMd + ".md");
    if (existsSync(daRadice)) return true;
    const daCartella = normalize(join(dirname(nota.assoluto), senzaMd + ".md"));
    return existsSync(daCartella);
  }

  return (perNome.get(senzaMd.toLowerCase()) ?? []).length > 0;
}

function risolveMarkdown(link: string, nota: Nota): boolean {
  if (/^(https?:|mailto:|obsidian:|file:)/i.test(link)) return true;
  let target = link.split("#")[0].trim();
  if (!target) return true;
  try {
    target = decodeURIComponent(target);
  } catch {
    // Link gia' decodificato: si prova cosi' com'e'.
  }
  const assoluto = target.startsWith("/")
    ? join(DOCS, target.replace(/^\/+/, ""))
    : normalize(join(dirname(nota.assoluto), target));
  return existsSync(assoluto);
}

function linkRotti(note: Nota[]): LinkRotto[] {
  const perNome = new Map<string, Nota[]>();
  for (const nota of note) {
    const lista = perNome.get(nota.nome.toLowerCase()) ?? [];
    lista.push(nota);
    perNome.set(nota.nome.toLowerCase(), lista);
  }

  const rotti: LinkRotto[] = [];
  for (const nota of note) {
    if (eGenerata(nota.rel)) continue;
    for (const m of Array.from(nota.testo.matchAll(/\[\[([^\]]+)\]\]/g))) {
      if (!risolveWikilink(m[1], nota, perNome)) {
        rotti.push({ nota: nota.senzaEstensione, link: `[[${m[1]}]]` });
      }
    }
    for (const m of Array.from(
      nota.testo.matchAll(/\[[^\]]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)
    )) {
      if (!risolveMarkdown(m[1], nota)) {
        rotti.push({ nota: nota.senzaEstensione, link: m[1] });
      }
    }
  }
  return rotti;
}

// ---------------------------------------------------------------------------
// Note curate e anzianita' rispetto al commit verificato
// ---------------------------------------------------------------------------
interface NotaCurata {
  nota: Nota;
  verificato: string | null;
  commitDaAllora: number | null;
}

const cacheDistanza = new Map<string, number>();

function distanzaCommit(sha: string): number {
  if (cacheDistanza.has(sha)) return cacheDistanza.get(sha) ?? 0;
  // Conta solo i commit che toccano il CODICE: aggiornare la documentazione
  // non deve far sembrare vecchie le note.
  const out = git([
    "rev-list",
    "--count",
    `${sha}..HEAD`,
    "--",
    "app",
    "components",
    "lib",
    "middleware.ts",
    "next.config.mjs",
    "tailwind.config.ts",
  ]);
  const n = Number.parseInt(out || "0", 10);
  const valore = Number.isNaN(n) ? 0 : n;
  cacheDistanza.set(sha, valore);
  return valore;
}

function noteCurate(note: Nota[]): NotaCurata[] {
  return note
    .filter((n) => !eGenerata(n.rel))
    .map((nota) => {
      const fm = nota.testo.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const verificato =
        fm?.[1].match(/verificato_al_commit:\s*([0-9a-f]+)/i)?.[1] ?? null;
      return {
        nota,
        verificato,
        commitDaAllora: verificato ? distanzaCommit(verificato) : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Grafo
// ---------------------------------------------------------------------------
function infoGrafo(): {
  commit: string;
  data: string;
  nodi: string;
  archi: string;
  community: string;
  wiki: number;
} {
  const report = leggi(join(ROOT, "graphify-out", "GRAPH_REPORT.md"));
  const commit =
    report.match(/Built from commit:\s*`([0-9a-f]+)`/i)?.[1] ?? "assente";
  const data =
    report.match(/# Graph Report - .*?\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? "—";
  const riepilogo = report.match(
    /(\d+)\s+nodes[\s\S]{0,40}?(\d+)\s+edges[\s\S]{0,40}?(\d+)\s+communities/i
  );
  const wikiDir = join(DOCS, "_grafo");
  const wiki = existsSync(wikiDir)
    ? readdirSync(wikiDir).filter((n) => n.endsWith(".md")).length
    : 0;
  return {
    commit,
    data,
    nodi: riepilogo?.[1] ?? "—",
    archi: riepilogo?.[2] ?? "—",
    community: riepilogo?.[3] ?? "—",
    wiki,
  };
}

// ---------------------------------------------------------------------------
const note = leggiNote();
const rotti = linkRotti(note);
const curate = noteCurate(note);
const grafo = infoGrafo();

const righeCurate = curate
  .filter((c) => c.verificato)
  .sort((a, b) => (b.commitDaAllora ?? 0) - (a.commitDaAllora ?? 0))
  .map((c) => {
    const stato =
      c.commitDaAllora === 0
        ? "allineata"
        : `ferma da ${c.commitDaAllora} commit`;
    return [
      `[[${c.nota.senzaEstensione}|${c.nota.nome}]]`,
      `\`${c.verificato}\``,
      stato,
    ];
  });

const senzafrontmatter = curate
  .filter((c) => !c.verificato)
  .map((c) => `- [[${c.nota.senzaEstensione}|${c.nota.nome}]]`);

const righeRotte = rotti.map((r) => [
  `[[${r.nota}|${basename(r.nota)}]]`,
  `\`${r.link}\``,
]);

const contenuto = [
  testata("Stato documentazione", ["auto", "stato"]),
  "> [!info] Nota generata automaticamente\n" +
    "> Prodotta da `npm run docs:stato`. Dice a che commit e' la documentazione " +
    "e quali note curate sono rimaste indietro.\n",
  "## Riferimenti e grafo\n",
  [
    "| Voce | Valore |",
    "| --- | --- |",
    `| Ultimo commit di codice | \`${COMMIT}\` |`,
    `| HEAD al momento della generazione | \`${HEAD}\` |`,
    `| Data generazione | ${OGGI} |`,
    `| Grafo costruito al commit | \`${grafo.commit}\` (${grafo.data}) |`,
    `| Grafo | ${grafo.nodi} nodi · ${grafo.archi} archi · ${grafo.community} community |`,
    `| Articoli wiki in \`_grafo/\` | ${grafo.wiki} |`,
    `| Note curate | ${curate.length} |`,
    `| Link rotti | ${rotti.length} |`,
  ].join("\n"),
  "",
  "## Note curate e anzianita'\n",
  righeCurate.length > 0
    ? "| Nota | Verificata al commit | Stato |\n| --- | --- | --- |\n" +
      righeCurate.map((r) => `| ${r.join(" | ")} |`).join("\n")
    : "Nessuna nota curata con `verificato_al_commit`.",
  "",
  senzafrontmatter.length > 0
    ? "### Note senza `verificato_al_commit`\n\n" + senzafrontmatter.join("\n")
    : "",
  "",
  "## Link rotti\n",
  rotti.length === 0
    ? "> [!success] Nessun link rotto\n> Tutti i wikilink e i link `.md` delle note curate risolvono."
    : "| Nota | Link |\n| --- | --- |\n" +
      righeRotte.map((r) => `| ${r[0]} | ${r[1]} |`).join("\n"),
  "",
  rotti.length > 0
    ? "\n> [!warning] Correggere prima del commit\n" +
      "> `npm run docs` esce con errore finche' restano link rotti."
    : "",
  "",
].join("\n");

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, "Stato documentazione.md"), contenuto, "utf8");
console.log(`Scritto docs/Stato documentazione.md (${rotti.length} link rotti).`);

if (rotti.length > 0) {
  process.exitCode = 1;
}
