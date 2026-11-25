import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

// ===========================================================================
// Genera le note di RIFERIMENTO della documentazione Obsidian.
//
// Fonte di verita' e' sempre il codice: pagine, route API, moduli lib,
// script/worker, tabelle del DB e variabili d'ambiente vengono riletti qui.
// Le note prodotte hanno `commit` e `aggiornato` in testa e non vanno editate
// a mano: vengono riscritte a ogni `npm run docs:riferimenti`.
// ===========================================================================

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const OGGI = new Date().toISOString().slice(0, 10);

function commitCorrente(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "sconosciuto";
  }
}

// L'ultimo commit che ha toccato il CODICE. Un commit di sola documentazione
// non deve far sembrare vecchi i riferimenti.
function commitCodice(): string {
  try {
    const out = execSync(
      "git log -1 --format=%h -- app components lib middleware.ts next.config.mjs tailwind.config.ts",
      { cwd: ROOT, encoding: "utf8" }
    ).trim();
    return out || commitCorrente();
  } catch {
    return commitCorrente();
  }
}

const COMMIT = commitCodice();

function percorsoSicuro(rel: string): string {
  return join(ROOT, rel.split("/").join(sep));
}

function leggi(rel: string): string {
  const p = percorsoSicuro(rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

function scrivi(rel: string, contenuto: string): void {
  const p = percorsoSicuro(rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, contenuto, "utf8");
  console.log(`  scritto ${rel}`);
}

function relativo(assoluto: string): string {
  return relative(ROOT, assoluto).split(sep).join("/");
}

function cammina(
  dir: string,
  filtro: (assoluto: string) => boolean
): string[] {
  const base = percorsoSicuro(dir);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  for (const nome of readdirSync(base)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const pieno = join(base, nome);
    const stat = statSync(pieno);
    if (stat.isDirectory()) out.push(...cammina(relativo(pieno), filtro));
    else if (filtro(pieno)) out.push(relativo(pieno));
  }
  return out.sort();
}

function testata(titolo: string, tags: string[]): string {
  const righe = ["---", `title: ${titolo}`, "aliases: []", "tags:"];
  for (const tag of tags) righe.push(`  - ${tag}`);
  righe.push(`aggiornato: ${OGGI}`, `commit: ${COMMIT}`, "---", "");
  return righe.join("\n") + "\n";
}

function avvisoAuto(): string {
  return (
    "> [!info] Nota generata automaticamente\n" +
    "> Fonte: codice del repository. Non modificare a mano: viene riscritta da " +
    "`npm run docs:riferimenti`.\n\n"
  );
}

function tabella(intestazioni: string[], righe: string[][]): string {
  const esc = (s: string) =>
    s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const out = [
    `| ${intestazioni.join(" | ")} |`,
    `| ${intestazioni.map(() => "---").join(" | ")} |`,
  ];
  for (const riga of righe) out.push(`| ${riga.map(esc).join(" | ")} |`);
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Descrizione breve: primo blocco di commenti `//` del file.
// ---------------------------------------------------------------------------
function descrizioneBreve(testo: string): string {
  const righe = testo.split(/\r?\n/).slice(0, 90);
  let i = 0;
  while (i < righe.length && !righe[i].trim().startsWith("//")) i++;
  if (i >= righe.length) return "";
  const parti: string[] = [];
  for (; i < righe.length; i++) {
    const t = righe[i].trim();
    if (t.startsWith("//")) {
      parti.push(t.replace(/^\/\/\s?/, ""));
    } else if (t === "") {
      if (parti.length > 0) break;
    } else {
      break;
    }
  }
  let s = parti.join(" ").trim();
  if (s.length > 260) s = s.slice(0, 257).replace(/\s+\S*$/, "") + "…";
  return s;
}

// ---------------------------------------------------------------------------
// Pagine App Router
// ---------------------------------------------------------------------------
function routeDaPercorso(rel: string, prefisso: "page" | "route"): string {
  const senzaApp = rel.replace(/^app\//, "");
  const senzaFile = senzaApp.replace(
    new RegExp(`/?${prefisso}\\.tsx?$`),
    ""
  );
  const senzaGruppi = senzaFile.replace(/\([^)]*\)/g, "");
  const pulito = senzaGruppi.replace(/\/+$/, "");
  return "/" + pulito;
}

function generaPagine(): void {
  const files = cammina("app", (p) => p.endsWith(`${sep}page.tsx`));
  const righe = files
    .map((f) => [routeDaPercorso(f, "page"), `\`${f}\``])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const contenuto = [
    testata("Pagine", ["auto", "riferimento", "pagine"]),
    avvisoAuto(),
    `Elenco delle pagine App Router (${righe.length}). Ogni pagina e' protetta dal ` +
      "middleware di sessione salvo quelle pubbliche elencate in " +
      "[Autenticazione e ruoli](../Architettura/Autenticazione%20e%20ruoli.md).\n",
    tabella(["Route", "File"], righe),
    "",
  ].join("\n");
  scrivi("docs/Riferimenti/Pagine.md", contenuto);
}

// ---------------------------------------------------------------------------
// Route API
// ---------------------------------------------------------------------------
const METODI = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"];

function metodiRoute(testo: string): string[] {
  const trovati = new Set<string>();
  for (const m of Array.from(
    testo.matchAll(
      /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g
    )
  )) {
    trovati.add(m[1]);
  }
  for (const m of Array.from(
    testo.matchAll(
      /export\s+const\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g
    )
  )) {
    trovati.add(m[1]);
  }
  return METODI.filter((m) => trovati.has(m));
}

function generaApi(): void {
  const files = cammina("app/api", (p) => p.endsWith(`${sep}route.ts`));
  const righe = files
    .map((f) => {
      const metodi = metodiRoute(leggi(f));
      return [routeDaPercorso(f, "route"), metodi.join(", ") || "—", `\`${f}\``];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
  const contenuto = [
    testata("API", ["auto", "riferimento", "api"]),
    avvisoAuto(),
    `Route HTTP dell'app (${righe.length}). Salvo le eccezioni pubbliche ` +
      "(login, questionario, webhook email, callback Gmail, `/api/esterni/*`), " +
      "richiedono la sessione operatore; le route admin richiedono ruolo `admin`.\n",
    tabella(["Route", "Metodi", "File"], righe),
    "",
    "## Route pubbliche\n",
    "- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/register`",
    "- `/api/questionario` (token del questionario pubblico)",
    "- `/api/hooks/email` (webhook worker, protetto da `x-webhook-secret`)",
    "- `/api/gmail/callback` (OAuth Gmail)",
    "- `/api/esterni/v1/*` (chiave API `Authorization: Bearer`)",
    "",
  ].join("\n");
  scrivi("docs/Riferimenti/API.md", contenuto);
}

// ---------------------------------------------------------------------------
// Moduli lib
// ---------------------------------------------------------------------------
function generaModuli(): void {
  const files = cammina(
    "lib",
    (p) => p.endsWith(".ts") && !p.includes(`${sep}__tests__${sep}`)
  );
  const righe = files.map((f) => [
    `\`${f}\``,
    descrizioneBreve(leggi(f)) || "—",
  ]);
  const contenuto = [
    testata("Moduli lib", ["auto", "riferimento", "moduli"]),
    avvisoAuto(),
    `Moduli server/client di \`lib/\` (${righe.length}). La descrizione e' il ` +
      "primo commento del file, non una sintesi redazionale.\n",
    tabella(["File", "Descrizione dal codice"], righe),
    "",
  ].join("\n");
  scrivi("docs/Riferimenti/Moduli lib.md", contenuto);
}

// ---------------------------------------------------------------------------
// Script e worker
// ---------------------------------------------------------------------------
const WORKER = [
  "lib/imap-worker.ts",
  "lib/gmail-worker.ts",
  "lib/sync-worker.ts",
  "lib/caselle-worker.ts",
  "scripts/start-worker.ts",
  "scripts/start-worker-docker.ts",
  "scripts/start-services.sh",
];

function generaScript(): void {
  const files = cammina("scripts", () => true);
  const righeScript = files.map((f) => {
    const testo = /\.(ts|js|cjs|mjs)$/.test(f) ? leggi(f) : "";
    return [`\`${f}\``, descrizioneBreve(testo) || "—"];
  });
  const righeWorker = WORKER.filter((f) => existsSync(percorsoSicuro(f))).map(
    (f) => [
      `\`${f}\``,
      descrizioneBreve(leggi(f)) || "—",
    ]
  );
  const contenuto = [
    testata("Script e worker", ["auto", "riferimento", "runtime"]),
    avvisoAuto(),
    "## Script operativi\n",
    tabella(["File", "Descrizione dal codice"], righeScript),
    "",
    "## Worker e processi in background\n",
    "Avviati da `scripts/start-worker.ts` (locale) o da `scripts/start-services.sh` " +
      "(Docker) insieme al server Next.\n",
    tabella(["File", "Descrizione dal codice"], righeWorker),
    "",
  ].join("\n");
  scrivi("docs/Riferimenti/Script e worker.md", contenuto);
}

// ---------------------------------------------------------------------------
// Variabili d'ambiente (solo nomi, mai valori)
// ---------------------------------------------------------------------------
const RE_ENV = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/gm;

function chiaviEnv(rel: string): string[] {
  const testo = leggi(rel);
  return Array.from(testo.matchAll(RE_ENV)).map((m) => m[1]);
}

function generaEnv(): void {
  const esempi = [".env.example", ".env.docker.example"];
  const inEsempi = new Map<string, string[]>();
  for (const file of esempi) {
    for (const chiave of chiaviEnv(file)) {
      const lista = inEsempi.get(chiave) ?? [];
      if (!lista.includes(file)) lista.push(file);
      inEsempi.set(chiave, lista);
    }
  }

  const usate = new Set<string>();
  for (const dir of ["app", "lib", "scripts", "middleware.ts", "next.config.mjs"]) {
    const files =
      dir.endsWith(".ts") || dir.endsWith(".mjs")
        ? [dir]
        : cammina(dir, (p) => /\.(ts|tsx|js|cjs|mjs)$/.test(p));
    for (const file of files) {
      for (const m of Array.from(
        leggi(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)
      )) {
        usate.add(m[1]);
      }
    }
  }

  const tutte = Array.from(
    new Set([...Array.from(inEsempi.keys()), ...Array.from(usate)])
  ).sort();
  const righe = tutte.map((chiave) => [
    `\`${chiave}\``,
    (inEsempi.get(chiave) ?? []).map((f) => `\`${f}\``).join(", ") || "—",
    usate.has(chiave) ? "sì" : "—",
  ]);
  const contenuto = [
    testata("Variabili ambiente", ["auto", "riferimento", "ambiente"]),
    avvisoAuto(),
    "Solo NOMI delle variabili: i valori reali stanno in `.env` / `.env.local` " +
      "e non vanno mai versionati.\n",
    tabella(["Variabile", "Presente negli esempi", "Letta dal codice"], righe),
    "",
    "## Note\n",
    "- `JWT_SECRET` e `WEBHOOK_SECRET` sono obbligatori in produzione.",
    "- `ENCRYPTION_KEY` serve per cifrare le credenziali delle caselle email: " +
      "cambiarla rende illeggibili le password gia' salvate.",
    "- `OPENROUTER_API_KEY` / `HERMES_*` abilitano gli agenti AI; senza chiavi " +
      "le funzioni AI restano spente o degradano.",
    "",
  ].join("\n");
  scrivi("docs/Riferimenti/Variabili ambiente.md", contenuto);
}

// ---------------------------------------------------------------------------
// Tabelle del database
// ---------------------------------------------------------------------------
interface TabellaDb {
  nome: string;
  colonne: [string, string][];
}

function tabelleDb(): TabellaDb[] {
  const schema = leggi("lib/db.ts");
  const out: TabellaDb[] = [];
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const m of Array.from(schema.matchAll(re))) {
    const colonne: [string, string][] = [];
    for (const rigaGrezza of m[2].split(/\r?\n/)) {
      const riga = rigaGrezza.replace(/--.*$/, "").trim();
      if (!riga) continue;
      if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(riga)) continue;
      const col = riga.match(/^([a-z_][a-z0-9_]*)\s+(.+?),?$/i);
      if (col) colonne.push([col[1], col[2].replace(/,$/, "").trim()]);
    }
    out.push({ nome: m[1], colonne });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

function generaTabelle(): void {
  const tabelle = tabelleDb();
  const righe = [
    testata("Tabelle", ["auto", "riferimento", "database"]),
    avvisoAuto(),
    `Tabelle definite in \`lib/db.ts\` (${tabelle.length}). ` +
      "Lo schema e' creato in modo lazy al primo accesso e aggiornato con " +
      "`ALTER TABLE` additivi; non c'e' un ORM.\n",
    "Indice rapido:\n",
    tabelle.map((t) => `- \`${t.nome}\``).join("\n"),
    "",
  ];
  for (const t of tabelle) {
    righe.push(`## ${t.nome}`, "");
    righe.push(
      tabella(
        ["Colonna", "Definizione"],
        t.colonne.map(([nome, def]) => [`\`${nome}\``, def])
      ),
      ""
    );
  }
  scrivi("docs/Modello dati/Tabelle.md", righe.join("\n"));
}

// ---------------------------------------------------------------------------
console.log("Generazione riferimenti...");
mkdirSync(join(DOCS, "Riferimenti"), { recursive: true });
mkdirSync(join(DOCS, "Modello dati"), { recursive: true });
generaPagine();
generaApi();
generaModuli();
generaScript();
generaEnv();
generaTabelle();
console.log("Riferimenti aggiornati.");
