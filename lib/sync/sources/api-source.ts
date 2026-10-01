import { syncConfig } from "../config";

export interface ClienteFromApi {
  [key: string]: unknown;
}

/**
 * Estrae l'array di record da una risposta OData o standard.
 * Formati supportati:
 * - OData: { "@odata.context": ..., "value": [...] }
 * - Array diretto: [...]
 * - Oggetto con proprietà "data": { data: [...] }
 */
function extractRecords(data: unknown): ClienteFromApi[] {
  if (Array.isArray(data)) {
    return data as ClienteFromApi[];
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    // Formato OData standard
    if (Array.isArray(obj.value)) {
      return obj.value as ClienteFromApi[];
    }

    // Formato con proprietà "data"
    if (Array.isArray(obj.data)) {
      return obj.data as ClienteFromApi[];
    }

    // Qualsiasi altra proprietà che contenga un array
    const arrayKeys = Object.keys(obj).filter((k) => Array.isArray(obj[k]));
    if (arrayKeys.length > 0) {
      return obj[arrayKeys[0]] as ClienteFromApi[];
    }
  }

  throw new Error("Formato risposta API non riconosciuto");
}

async function fetchOData(endpoint: string, apiKey: string): Promise<ClienteFromApi[]> {
  const baseUrl = process.env.ARCA_API_BASE_URL || "http://srv2022/PMISOFTWARE/api";
  const url = `${baseUrl}${endpoint}`;

  console.log("🔗 URL chiamata API:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const text = await response.text();
  console.log("📡 Risposta status:", response.status);

  if (!response.ok) {
    throw new Error(`API error su ${endpoint}: ${response.status} ${response.statusText}`);
  }

  return extractRecords(JSON.parse(text));
}

/** Normalizza un telefono: rimuove tutto tranne cifre (gestisce . / spazi). */
function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

/**
 * Recupera tutti i clienti dall'API Arca e unisce i dati contatto.
 *
 * Endpoint utilizzati:
 * - GET {base}/dbo_CF (anagrafiche clienti/fornitori)
 * - GET {base}/dbo_CFContatto (contatti: cellulare, email, nome/cognome)
 *
 * Autenticazione: Header x-api-key
 */
export async function fetchClientiFromApi(): Promise<ClienteFromApi[]> {
  const apiKey = process.env.ARCA_API_KEY || "";

  if (!apiKey) {
    throw new Error("ARCA_API_KEY mancante in .env.local");
  }

  const [anagrafiche, contatti] = await Promise.all([
    fetchOData(syncConfig.api.endpoint, apiKey),
    fetchOData(syncConfig.api.contattiEndpoint, apiKey),
  ]);

  console.log(`   Anagrafiche: ${anagrafiche.length}, contatti: ${contatti.length}`);

  // Raggruppa contatti per cd_cf
  const contattiByCf = new Map<string, Record<string, unknown>[]>();
  for (const c of contatti) {
    const cf = c.cd_cf;
    if (!cf) continue;
    const key = String(cf);
    if (!contattiByCf.has(key)) contattiByCf.set(key, []);
    contattiByCf.get(key)!.push(c);
  }

  // Unisci: priorità al contatto con cellulare, poi con email, poi al primo
  return anagrafiche.map((cf) => {
    // La join avviene sul codice anagrafica (cd_cf, es. "C000070"), non su id_cf
    const key = cf.cd_cf !== undefined && cf.cd_cf !== null ? String(cf.cd_cf) : null;
    const lista = key ? contattiByCf.get(key) || [] : [];

    const conCell = lista.find((c) => normalizePhone(c.cellulare));
    const conCell2 = !conCell ? lista.find((c) => normalizePhone(c.cellulare2)) : undefined;
    const conEmail = lista.find((c) => c.email && String(c.email).trim());
    const preferred = conCell || conCell2 || conEmail || lista[0];

    const cellulare = conCell
      ? normalizePhone(conCell.cellulare)
      : conCell2
        ? normalizePhone(conCell2.cellulare2)
        : null;

    const email = preferred?.email && String(preferred.email).trim()
      ? String(preferred.email).trim()
      : null;

    let nomeContatto: string | null = null;
    if (preferred) {
      const nome = preferred.nome ? String(preferred.nome).trim() : "";
      const cognome = preferred.cognome ? String(preferred.cognome).trim() : "";
      const full = `${nome} ${cognome}`.trim();
      nomeContatto = full || null;
    }

    return {
      ...cf,
      // Campi arricchiti dalla join contatti (sovrascrivono quelli assenti in dbo_CF)
      telefono: cellulare,
      email: email ?? (cf.email && String(cf.email).trim() ? String(cf.email).trim() : null),
      nome_contatto: nomeContatto,
    };
  });
}
