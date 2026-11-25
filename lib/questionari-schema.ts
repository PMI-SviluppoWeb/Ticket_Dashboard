import { emailValida } from "./contatti";
import type { RisposteQuestionario, SoftwareInventario } from "./types";

// Schema FISSO del questionario cliente (Fase 1). Le domande vivono qui, cosi'
// il form pubblico e la validazione server usano la stessa definizione.
// In una fase successiva questi elenchi potranno diventare template salvati.

export const MODULI_ARCA = [
  "Contabilità",
  "Fatturazione",
  "Magazzino",
  "Produzione",
  "CRM",
  "HR",
  "Altro",
] as const;

export interface Opzione {
  valore: string;
  label: string;
}

export const OPZIONI_SI_NO: Opzione[] = [
  { valore: "si", label: "Sì" },
  { valore: "no", label: "No" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_BACKUP: Opzione[] = [
  { valore: "nessuno", label: "Nessun backup" },
  { valore: "locale", label: "Backup locale" },
  { valore: "cloud", label: "Backup cloud" },
  { valore: "misto", label: "Locale + cloud" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_ANTIVIRUS: Opzione[] = [
  { valore: "nessuno", label: "Nessuno" },
  { valore: "free", label: "Antivirus gratuito" },
  { valore: "commerciale", label: "Antivirus commerciale" },
  { valore: "gestito", label: "Antivirus gestito dal fornitore" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_CLOUD: Opzione[] = [
  { valore: "nessuno", label: "Nessun servizio cloud" },
  { valore: "email", label: "Solo email" },
  { valore: "files", label: "File e documenti" },
  { valore: "gestionale", label: "Gestionale in cloud" },
  { valore: "altro", label: "Altro" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_VPN: Opzione[] = [
  { valore: "si", label: "Sì" },
  { valore: "no", label: "No" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_SICUREZZA: Opzione[] = [
  { valore: "base", label: "Base" },
  { valore: "media", label: "Media" },
  { valore: "avanzata", label: "Avanzata" },
  { valore: "non_so", label: "Non so" },
];

export const OPZIONI_ESIGENZE: Opzione[] = [
  { valore: "crescita", label: "Crescita e nuovi clienti" },
  { valore: "efficienza", label: "Efficienza e automazione" },
  { valore: "sicurezza", label: "Sicurezza e continuità" },
  { valore: "costi", label: "Riduzione dei costi" },
  { valore: "altro", label: "Altro" },
];

export function risposteVuote(): RisposteQuestionario {
  return {
    azienda: { referente: "", ruolo: "", email: "", telefono: "" },
    parco_pc: { computer: 0, server: 0, postazioni: 0, anni_medi: null, note: "" },
    software: [],
    arca: {
      versione: "",
      licenze: 0,
      moduli: [],
      ultimo_aggiornamento: "",
      assistenza: "non_so",
    },
    infrastruttura: {
      backup: "non_so",
      antivirus: "non_so",
      cloud: "non_so",
      vpn: "non_so",
      sicurezza: "non_so",
    },
    esigenze: { criticita: "", obiettivi: "", priorita: "efficienza" },
    soddisfazione: { nps: null, commenti: "" },
    consenso_privacy: false,
  };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function int(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function scelta(
  v: unknown,
  opzioni: Opzione[],
  fallback: string
): string {
  const s = typeof v === "string" ? v.trim() : "";
  return opzioni.some((o) => o.valore === s) ? s : fallback;
}

export type EsitoValidazioneRisposte =
  | { ok: true; risposte: RisposteQuestionario }
  | { ok: false; error: string };

// Validazione e normalizzazione delle risposte. Accetta solo i campi dello
// schema: qualunque altra chiave viene ignorata. I testi sono troncati, i
// numeri limitati, le scelte ricondotte ai valori ammessi.
export function validaRisposte(input: unknown): EsitoValidazioneRisposte {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Risposte non valide." };
  }
  const r = input as Record<string, unknown>;
  const azienda = (r.azienda ?? {}) as Record<string, unknown>;
  const parco = (r.parco_pc ?? {}) as Record<string, unknown>;
  const arca = (r.arca ?? {}) as Record<string, unknown>;
  const infra = (r.infrastruttura ?? {}) as Record<string, unknown>;
  const esigenze = (r.esigenze ?? {}) as Record<string, unknown>;
  const soddisfazione = (r.soddisfazione ?? {}) as Record<string, unknown>;

  const referente = str(azienda.referente, 200);
  if (!referente) {
    return { ok: false, error: "Indica il referente aziendale." };
  }
  const email = str(azienda.email, 200);
  if (email && !emailValida(email)) {
    return { ok: false, error: "L'email del referente non è valida." };
  }

  if (!r.consenso_privacy) {
    return {
      ok: false,
      error: "Devi accettare il trattamento dei dati per inviare il questionario.",
    };
  }

  const softwareInput = Array.isArray(r.software) ? r.software : [];
  const software: SoftwareInventario[] = [];
  for (const raw of softwareInput.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const nome = str(s.nome, 120);
    if (!nome) continue;
    software.push({
      nome,
      versione: str(s.versione, 60),
      licenze: intOrNull(s.licenze, 0, 100_000),
      fornitore: str(s.fornitore, 120),
      scadenza: str(s.scadenza, 20),
      note: str(s.note, 500),
    });
  }

  const moduliRaw = Array.isArray(arca.moduli) ? arca.moduli : [];
  const moduli = Array.from(
    new Set(
      moduliRaw.filter(
        (m): m is string =>
          typeof m === "string" && (MODULI_ARCA as readonly string[]).includes(m)
      )
    )
  );

  const risposte: RisposteQuestionario = {
    azienda: {
      referente,
      ruolo: str(azienda.ruolo, 120),
      email,
      telefono: str(azienda.telefono, 60),
    },
    parco_pc: {
      computer: int(parco.computer, 0, 100_000),
      server: int(parco.server, 0, 100_000),
      postazioni: int(parco.postazioni, 0, 100_000),
      anni_medi: intOrNull(parco.anni_medi, 0, 60),
      note: str(parco.note, 2000),
    },
    software,
    arca: {
      versione: str(arca.versione, 60),
      licenze: int(arca.licenze, 0, 100_000),
      moduli,
      ultimo_aggiornamento: str(arca.ultimo_aggiornamento, 20),
      assistenza: scelta(arca.assistenza, OPZIONI_SI_NO, "non_so"),
    },
    infrastruttura: {
      backup: scelta(infra.backup, OPZIONI_BACKUP, "non_so"),
      antivirus: scelta(infra.antivirus, OPZIONI_ANTIVIRUS, "non_so"),
      cloud: scelta(infra.cloud, OPZIONI_CLOUD, "non_so"),
      vpn: scelta(infra.vpn, OPZIONI_VPN, "non_so"),
      sicurezza: scelta(infra.sicurezza, OPZIONI_SICUREZZA, "non_so"),
    },
    esigenze: {
      criticita: str(esigenze.criticita, 3000),
      obiettivi: str(esigenze.obiettivi, 3000),
      priorita: scelta(esigenze.priorita, OPZIONI_ESIGENZE, "efficienza"),
    },
    soddisfazione: {
      nps: intOrNull(soddisfazione.nps, 0, 10),
      commenti: str(soddisfazione.commenti, 2000),
    },
    consenso_privacy: true,
  };

  return { ok: true, risposte };
}
