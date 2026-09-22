import dotenv from "dotenv";
import path from "path";
import sql from "mssql";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const useWindowsAuth = process.env.SQL_WINDOWS_AUTH === "true";

const config: sql.config = {
  server: process.env.SQL_SERVER || "",
  database: process.env.SQL_DATABASE || "",
  options: {
    encrypt: process.env.SQL_ENCRYPT === "true",
    trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
    trustedConnection: useWindowsAuth,
    useUTC: true,
  },
};

async function main() {
  console.log("Server: " + process.env.SQL_SERVER);
  console.log("Database: " + process.env.SQL_DATABASE);
  console.log("Windows Auth: " + useWindowsAuth);
  console.log("Connessione a SQL Server...\n");

  try {
    const pool = await sql.connect(config);
    console.log("Connessione riuscita!\n");

    const tablesResult = await pool.request().query(
      "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME"
    );

    console.log("Tabelle trovate:");
    console.log("-".repeat(50));

    for (const row of tablesResult.recordset) {
      console.log("  " + row.TABLE_SCHEMA + "." + row.TABLE_NAME);
    }

    console.log("-".repeat(50));
    console.log("  Totale: " + tablesResult.recordset.length + " tabelle\n");

    await pool.close();
  } catch (err) {
    console.error("Errore di connessione:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();