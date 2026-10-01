/**
 * Configurazione sincronizzazione anagrafiche clienti
 *
 * Modifica le mappature qui sotto in base alla struttura dei dati della tua sorgente.
 *
 * - source: "sql-server" oppure "api"
 * - sqlServer.table: nome tabella SQL Server
 * - sqlServer.idField: campo chiave primaria SQL Server
 * - sqlServer.fieldMap: mappatura campi SQL Server → Turso
 * - api.enabled: true per usare l'API Arca
 * - api.baseUrl: base URL dell'API
 * - api.endpoint: endpoint specifico per le anagrafiche
 * - api.idField: campo ID nella risposta API
 * - api.fieldMap: mappatura campi API → Turso
 *   (chiave = campo Turso, valore = campo API)
 */

export type SyncSource = "sql-server" | "api";

export interface SyncConfig {
  source: SyncSource;
  sqlServer: {
    table: string;
    idField: string;
    fieldMap: Record<string, string>;
  };
  api: {
    enabled: boolean;
    baseUrl: string;
    endpoint: string;
    contattiEndpoint: string; // Endpoint contatti (cellulare, email)
    idField: string; // Campo ID nella risposta API (es. "id_cf")
    fieldMap: Record<string, string | null>; // Chiave = Turso, Valore = API (null = non presente)
  };
}

// ──────────────────────────────────────────────────────────────
// MODIFICA QUI I CAMPI SEGUENTI:
// ──────────────────────────────────────────────────────────────

export const syncConfig: SyncConfig = {
  // Sorgente dati: "sql-server" oppure "api"
  source: "api",

  sqlServer: {
    table: "ANAGRAFICHE",
    idField: "Codice",
    fieldMap: {
      ragione_sociale: "RagioneSociale",
      nome_contatto: "NomeContatto",
      email: "Email",
      telefono: "Telefono",
      indirizzo: "Indirizzo",
      citta: "Citta",
      provincia: "Provincia",
      cap: "CAP",
      partita_iva: "PartitaIva",
      note: "Note",
    },
  },

  api: {
    enabled: true,
    baseUrl: process.env.ARCA_API_BASE_URL || "http://srv2022/PMISOFTWARE/api",
    endpoint: "/dbo_CF",
    contattiEndpoint: "/dbo_CFContatto",
    idField: "id_cf", // Campo ID nella risposta API
    fieldMap: {
      // Chiave = campo Turso, Valore = campo API Arca
      // (telefono/email/nome_contatto arrivano già arricchiti da dbo_CFContatto)
      ragione_sociale: "descrizione",
      nome_contatto: "nome_contatto",
      email: "email",
      telefono: "telefono",
      indirizzo: "indirizzo",
      citta: "localita",
      provincia: "provincia",
      cap: "cap",
      partita_iva: "partitaiva",
      note: "note_cf",
    },
  },
};