/**
 * Configurazione sincronizzazione anagrafiche clienti
 *
 * Modifica le mappature qui sotto in base alla struttura della tua tabella SQL Server.
 *
 * - sourceTable: nome della tabella SQL Server
 * - sourceIdField: campo chiave primaria nella tabella SQL Server
 * - fieldMap: mappatura campi SQL Server → Turso
 *   (chiave = campo Turso, valore = campo SQL Server)
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
  };
}

// ──────────────────────────────────────────────────────────────
// MODIFICA QUI I CAMPI SEGUENDO LE INDICAZIONI:
//
// 1. Imposta 'source' su "sql-server" o "api" a seconda della sorgente
// 2. In 'sqlServer.table' inserisci il nome della tua tabella
// 3. In 'sqlServer.idField' inserisci il nome del campo chiave primaria
// 4. In 'sqlServer.fieldMap' mappa ogni campo Turso al corrispondente campo SQL Server
//    - La chiave è il nome del campo nella tabella Turso 'clienti'
//    - Il valore è il nome del campo nella tua tabella SQL Server
//    - Se un campo non esiste su SQL Server, mettilo a null
//
// ESEMPIO:
//   Se la tua tabella SQL Server si chiama 'ANAGRAFICHE' e ha i campi:
//   Codice, RagioneSociale, Email, Telefono, Indirizzo, Citta, Provincia, CAP, P.IVA
//
//   Allora la mappatura sarà:
//   ragione_sociale: "RagioneSociale"
//   email: "Email"
//   telefono: "Telefono"
//   ecc.
// ──────────────────────────────────────────────────────────────

export const syncConfig: SyncConfig = {
  // Sorgente dati: "sql-server" oppure "api"
  source: "sql-server",

  sqlServer: {
    // Nome della tabella anagrafica clienti su SQL Server
    table: "ANAGRAFICHE",

    // Campo chiave primaria (ID alfanumerico)
    idField: "Codice",

    // Mappatura campi SQL Server → Turso
    // Chiave = campo Turso, Valore = campo SQL Server
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
    enabled: false,
    baseUrl: process.env.ARCA_API_BASE_URL || "http://localhost:8080/api",
    endpoint: "/clienti",
  },
};
