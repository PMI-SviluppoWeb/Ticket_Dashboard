import sql from "mssql";
import { syncConfig } from "../config";

export interface ClienteRaw {
  [key: string]: unknown;
}

const useWindowsAuth = process.env.SQL_WINDOWS_AUTH === "true";

const config: sql.config = useWindowsAuth
  ? {
      server: process.env.SQL_SERVER || "",
      database: process.env.SQL_DATABASE || "",
      options: {
        encrypt: process.env.SQL_ENCRYPT === "true",
        trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
        trustedConnection: true,
      },
    }
  : {
      server: process.env.SQL_SERVER || "",
      database: process.env.SQL_DATABASE || "",
      user: process.env.SQL_USER || "",
      password: process.env.SQL_PASS || "",
      options: {
        encrypt: process.env.SQL_ENCRYPT === "true",
        trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
      },
    };

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

/**
 * Recupera tutti i clienti dalla tabella SQL Server
 * e li restituisce come array di oggetti grezzi.
 */
export async function fetchClientiFromSqlServer(): Promise<ClienteRaw[]> {
  const { table, idField, fieldMap } = syncConfig.sqlServer;

  // Costruisce la lista campi da selectare
  const sqlFields = [idField, ...Object.values(fieldMap)]
    .filter((f): f is string => f !== null)
    .map((f) => "[" + f + "]")
    .join(", ");

  const query = "SELECT " + sqlFields + " FROM [" + table + "]";

  const pool = await getPool();
  const result = await pool.request().query(query);

  return result.recordset as ClienteRaw[];
}

/**
 * Chiude il pool di connessione.
 */
export async function closeSqlServer(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}