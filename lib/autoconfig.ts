import "server-only";
import { resolveMx, resolveSrv } from "node:dns/promises";
import { connect as tcpConnect } from "node:net";

// ===========================================================================
// Auto-scoperta impostazioni IMAP/SMTP da un semplice indirizzo email
// (stile Outlook/Thunderbird): l'utente non inserisce mai host e porte.
//
// Pipeline a cascata, in ordine:
//   1. Tabella provider noti (hardcoded, zero rete)
//   2. ISPDB Mozilla (autoconfig.thunderbird.net) — quello che usa Thunderbird
//   3. DNS MX  → se punta a un provider noto, usa la sua config
//   4. DNS SRV → _imaps._tcp / _submission._tcp sul dominio
//   5. Indovinelli (imap./mail./smtp.<dominio>) con probe TCP per scegliere
//      il primo host che risponde davvero, + avvertimento "da verificare"
//
// Solo uso server (route /api/caselle/scopri): nessuna dipendenza esterna,
// solo fetch pubblico + DNS del sistema.
// ===========================================================================

export type FonteScoperta = "nota" | "ispdb" | "mx" | "srv" | "guess";

export interface ServerPosta {
  host: string;
  port: number;
  secure: boolean;
}

export interface ConfigScoperta {
  // true = impostazioni trovate (imap+smtp) oppure provider Gmail gestito
  // via OAuth (gmail=true, senza imap/smtp)
  trovato: boolean;
  gmail?: boolean;
  imap?: ServerPosta;
  smtp?: ServerPosta;
  fonte?: FonteScoperta;
  avvertimento?: string;
}

interface ConfigProvider {
  gmail?: boolean;
  imap?: ServerPosta;
  smtp?: ServerPosta;
  avvertimento?: string;
}

// ---------------------------------------------------------------------------
// 1. Provider noti (solo certezze: il resto lo copre l'ISPDB)
// ---------------------------------------------------------------------------
const AVV_OUTLOOK =
  "Microsoft potrebbe rifiutare la password normale per IMAP: se la verifica fallisce, usa una password speciale dell'app Microsoft.";

const PROVIDER_NOTI: Record<string, ConfigProvider> = {
  // Gmail: si usa OAuth (pulsante "Collega account Gmail"), mai IMAP/password
  "gmail.com": { gmail: true },
  "googlemail.com": { gmail: true },
  // Microsoft consumer / Microsoft 365
  "outlook.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    avvertimento: AVV_OUTLOOK,
  },
  "hotmail.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    avvertimento: AVV_OUTLOOK,
  },
  "live.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    avvertimento: AVV_OUTLOOK,
  },
  "msn.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    avvertimento: AVV_OUTLOOK,
  },
  "office365.com": {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    avvertimento: AVV_OUTLOOK,
  },
  // Yahoo
  "yahoo.com": {
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  },
  "ymail.com": {
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  },
  "rocketmail.com": {
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  },
  // Apple iCloud
  "icloud.com": {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
  },
  "me.com": {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
  },
  "mac.com": {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
  },
  // GMX / Mail.com
  "gmx.com": {
    imap: { host: "imap.gmx.net", port: 993, secure: true },
    smtp: { host: "smtp.gmx.net", port: 465, secure: true },
  },
  "gmx.net": {
    imap: { host: "imap.gmx.net", port: 993, secure: true },
    smtp: { host: "smtp.gmx.net", port: 465, secure: true },
  },
  "gmx.de": {
    imap: { host: "imap.gmx.net", port: 993, secure: true },
    smtp: { host: "smtp.gmx.net", port: 465, secure: true },
  },
  "mail.com": {
    imap: { host: "imap.mail.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.com", port: 465, secure: true },
  },
  // Posteo
  "posteo.de": {
    imap: { host: "imap.posteo.de", port: 993, secure: true },
    smtp: { host: "smtp.posteo.de", port: 587, secure: false },
  },
  // Fastmail
  "fastmail.com": {
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
  },
  "fastmail.fm": {
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
  },
  // Aruba (italiano, host documentati)
  "aruba.it": {
    imap: { host: "imap.aruba.it", port: 993, secure: true },
    smtp: { host: "smtp.aruba.it", port: 465, secure: true },
  },
};

// MX che indicano un provider noto (Google Workspace, Microsoft365, ...):
// serve a riconoscere Gmail/OAuth anche da dominio aziendale proprio.
const MX_NOTI: Array<{ match: RegExp; config: ConfigProvider }> = [
  { match: /(^|\.)googlemail\.com$|(^|\.)google\.com$|(^|\.)googlemail\.net$/, config: { gmail: true } },
  {
    match:
      /(^|\.)outlook\.com$|(^|\.)hotmail\.com$|(^|\.)live\.com$|(^|\.)microsoft\.com$|(^|\.)office365\.com$|(^|\.)olc\.office\.com$|(^|\.)protection\.outlook\.com$/,
    config: PROVIDER_NOTI["outlook.com"],
  },
  {
    match: /(^|\.)yahoo\.[a-z.]+$|(^|\.)yahoodns\.net$/,
    config: PROVIDER_NOTI["yahoo.com"],
  },
];

// ---------------------------------------------------------------------------
// Cache per dominio (l'ISPDB è un servizio pubblico: non si martella)
// ---------------------------------------------------------------------------
const TTL_CACHE_MS = 60 * 60 * 1000; // 1 ora
const cache = new Map<string, { valore: ConfigScoperta; scadenza: number }>();

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dominioDi(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!RE_EMAIL.test(e)) return null;
  return e.split("@")[1] ?? null;
}

async function conTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Probe TCP: vero e proprio "quel server risponde?" — rende affidabili gli
// indovinelli finale (Thunderbird non lo fa, ma qui il costo è basso e
// l'utente non deve poi capire quale host era giusto).
function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let fatto = false;
    const finisci = (ok: boolean) => {
      if (fatto) return;
      fatto = true;
      try {
        sock.destroy();
      } catch {
        /* ignora */
      }
      resolve(ok);
    };
    const sock = tcpConnect({ host, port });
    sock.setTimeout(timeoutMs, () => finisci(false));
    sock.once("connect", () => finisci(true));
    sock.once("error", () => finisci(false));
  });
}

// ---------------------------------------------------------------------------
// 2. ISPDB Mozilla
// ---------------------------------------------------------------------------
const ISPDB_URL = "https://autoconfig.thunderbird.net/v1.1";

// L'ISPDB restituisce XML: non c'è un parser nel progetto e non serve una
// dipendenza per questo — si estraggono i campi che interessano con regex
// mirate sui blocchi incomingServer/outgoingServer.
function parseIspdb(xml: string): { imap?: ServerPosta; smtp?: ServerPosta } {
  const estrai = (tipo: "imap" | "smtp"): ServerPosta | undefined => {
    const bloccoRe =
      tipo === "imap"
        ? /<incomingServer type="imap">([\s\S]*?)<\/incomingServer>/g
        : /<outgoingServer type="smtp">([\s\S]*?)<\/outgoingServer>/g;
    const candidati: ServerPosta[] = [];
    let m: RegExpExecArray | null;
    while ((m = bloccoRe.exec(xml)) !== null) {
      const blocco = m[1];
      const host = /<hostname>([^<]+)<\/hostname>/.exec(blocco)?.[1]?.trim();
      const porta = parseInt(/<port>(\d+)<\/port>/.exec(blocco)?.[1] ?? "", 10);
      const socket = /<socketType>([^<]+)<\/socketType>/.exec(blocco)?.[1]?.trim() ?? "";
      if (!host || !Number.isFinite(porta)) continue;
      if (socket.toUpperCase() === "PLAIN" || socket.toUpperCase() === "NONE") continue; // mai cleartext
      candidati.push({
        host,
        port: porta,
        secure: socket.toUpperCase() === "SSL" || socket.toUpperCase() === "TLS",
      });
    }
    // Preferenza: SSL/TLS (porta implicita) su STARTTLS.
    return candidati.find((c) => c.secure) ?? candidati[0];
  };
  return { imap: estrai("imap"), smtp: estrai("smtp") };
}

async function scopriIspdb(dominio: string): Promise<{ imap?: ServerPosta; smtp?: ServerPosta } | null> {
  try {
    const res = await conTimeout(
      fetch(`${ISPDB_URL}/${encodeURIComponent(dominio)}`, { cache: "no-store" }),
      6000,
      null
    );
    if (!res || !res.ok) return null; //404 = dominio sconosciuto all'ISPDB
    const xml = await res.text();
    if (!xml.includes("<clientConfig")) return null;
    const cfg = parseIspdb(xml);
    return cfg.imap && cfg.smtp ? cfg : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. DNS MX
// ---------------------------------------------------------------------------
async function scopriMx(dominio: string): Promise<ConfigProvider | null> {
  try {
    const mx = await conTimeout(resolveMx(dominio), 3000, []);
    for (const record of mx) {
      const host = record.exchange.toLowerCase().replace(/\.$/, "");
      for (const { match, config } of MX_NOTI) {
        if (match.test(host)) return config;
      }
    }
  } catch {
    // Nessun record MX o DNS non disponibile: si continua con la cascata.
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. DNS SRV
// ---------------------------------------------------------------------------
async function scopriSrv(dominio: string): Promise<{ imap?: ServerPosta; smtp?: ServerPosta } | null> {
  try {
    const [imaps, submission] = await Promise.all([
      conTimeout(resolveSrv(`_imaps._tcp.${dominio}`), 3000, []),
      conTimeout(resolveSrv(`_submission._tcp.${dominio}`), 3000, []),
    ]);
    const out: { imap?: ServerPosta; smtp?: ServerPosta } = {};
    const primo = imaps[0];
    if (primo?.name && primo.port) {
      out.imap = { host: primo.name.replace(/\.$/, ""), port: primo.port, secure: true };
    }
    const sub = submission[0];
    if (sub?.name && sub.port) {
      //465 = TLS implicito,587 = STARTTLS
      out.smtp = { host: sub.name.replace(/\.$/, ""), port: sub.port, secure: sub.port === 465 };
    }
    return out.imap && out.smtp ? out : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. Indovinelli + probe TCP
// ---------------------------------------------------------------------------
const AVV_GUESS =
  "Impostazioni stimate per questo dominio: verifica con «Verifica connessione» prima di affidartene.";

async function scopriGuess(dominio: string): Promise<{ imap?: ServerPosta; smtp?: ServerPosta; avvertimento?: string }> {
  // Candidati in ordine di priorità (standard hosting cPanel/Plesk/dovecot)
  const imapCandidati: ServerPosta[] = [
    { host: `imap.${dominio}`, port: 993, secure: true },
    { host: `mail.${dominio}`, port: 993, secure: true },
  ];
  const smtpCandidati: ServerPosta[] = [
    { host: `smtp.${dominio}`, port: 465, secure: true },
    { host: `smtp.${dominio}`, port: 587, secure: false },
    { host: `mail.${dominio}`, port: 465, secure: true },
  ];

  const scegli = async (candidati: ServerPosta[]): Promise<ServerPosta> => {
    const risultati = await Promise.all(candidati.map((c) => probeTcp(c.host, c.port)));
    const idx = risultati.findIndex(Boolean);
    return idx >= 0 ? candidati[idx] : candidati[0];
  };

  const [imap, smtp] = await Promise.all([scegli(imapCandidati), scegli(smtpCandidati)]);
  return { imap, smtp, avvertimento: AVV_GUESS };
}

// ---------------------------------------------------------------------------
// Pipeline pubblica
// ---------------------------------------------------------------------------
export async function scopriConfigurazione(email: string): Promise<ConfigScoperta> {
  const dominio = dominioDi(email);
  if (!dominio) return { trovato: false, avvertimento: "Indirizzo email non valido." };

  // Cache: colpisce tutti gli step (una scoperta per dominio basta)
  const cached = cache.get(dominio);
  if (cached && cached.scadenza > Date.now()) return cached.valore;

  const memorizza = (v: ConfigScoperta): ConfigScoperta => {
    cache.set(dominio, { valore: v, scadenza: Date.now() + TTL_CACHE_MS });
    return v;
  };

  // 1. Provider noti
  const noto = PROVIDER_NOTI[dominio];
  if (noto) {
    if (noto.gmail) return memorizza({ trovato: true, gmail: true, fonte: "nota" });
    if (noto.imap && noto.smtp) {
      return memorizza({
        trovato: true,
        imap: noto.imap,
        smtp: noto.smtp,
        fonte: "nota",
        avvertimento: noto.avvertimento,
      });
    }
  }

  // 2. ISPDB Mozilla
  const ispdb = await scopriIspdb(dominio);
  if (ispdb) {
    return memorizza({ trovato: true, imap: ispdb.imap, smtp: ispdb.smtp, fonte: "ispdb" });
  }

  // 3. DNS MX → provider noto (es. Google Workspace = OAuth Gmail)
  const mx = await scopriMx(dominio);
  if (mx) {
    if (mx.gmail) return memorizza({ trovato: true, gmail: true, fonte: "mx" });
    if (mx.imap && mx.smtp) {
      return memorizza({
        trovato: true,
        imap: mx.imap,
        smtp: mx.smtp,
        fonte: "mx",
        avvertimento: mx.avvertimento,
      });
    }
  }

  // 4. DNS SRV
  const srv = await scopriSrv(dominio);
  if (srv) {
    return memorizza({ trovato: true, imap: srv.imap, smtp: srv.smtp, fonte: "srv" });
  }

  // 5. Indovinelli con probe TCP
  const guess = await scopriGuess(dominio);
  return memorizza({
    trovato: true,
    imap: guess.imap,
    smtp: guess.smtp,
    fonte: "guess",
    avvertimento: guess.avvertimento,
  });
}
