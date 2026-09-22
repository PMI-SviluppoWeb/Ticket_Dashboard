import dotenv from "dotenv";
import path from "path";
import sql from "mssql";
import dgram from "dgram";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testUDP(): Promise<void> {
  return new Promise((resolve) => {
    const client = dgram.createSocket("udp4");
    const msg = Buffer.from([0x02]); // SQL Browser probe
    const server = (process.env.SQL_SERVER || "").split("\\")[0];

    client.send(msg, 0, msg.length, 1434, server, (err) => {
      if (err) {
        console.log("  UDP 1434 -> FALLITO: " + err.message);
        client.close();
        resolve();
        return;
      }
    });

    client.on("message", (msg) => {
      console.log("  UDP 1434 -> OK (SQL Browser attivo)");
      const data = msg.toString();
      const sqlexpressMatch = data.match(/SQLEXPRESS[^\x00]*/i);
      if (sqlexpressMatch) {
        console.log("  Istanza SQLEXPRESS trovata!");
        // Try to find the port
        const portMatch = data.match(/tcp:(\d+)/);
        if (portMatch) {
          console.log("  Porta dinamica: " + portMatch[1]);
        }
      }
      client.close();
      resolve();
    });

    client.on("error", (err) => {
      console.log("  UDP 1434 -> FALLITO: " + err.message);
      client.close();
      resolve();
    });

    setTimeout(() => {
      console.log("  UDP 1434 -> TIMEOUT (SQL Browser non risponde)");
      client.close();
      resolve();
    }, 5000);
  });
}

async function main() {
  const server = (process.env.SQL_SERVER || "").split("\\")[0];

  console.log("=== DIAGNOSTICA SQL SERVER ===\n");
  console.log("Server: " + process.env.SQL_SERVER);
  console.log("Host: " + server);
  console.log("Database: " + process.env.SQL_DATABASE);
  console.log("Utente Windows: " + process.env.USERDOMAIN + "\\" + process.env.USERNAME);
  console.log("");

  // Test UDP
  console.log("Test SQL Browser Service (UDP 1434)...");
  await testUDP();
  console.log("");

  // Test 1: trustedConnection
  console.log("Test 1: trustedConnection...");
  try {
    const pool = await sql.connect({
      server: server,
      database: process.env.SQL_DATABASE || "",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true,
        connectTimeout: 10000,
      },
    });
    const result = await pool.request().query("SELECT @@SERVERNAME AS s, USER_NAME() AS u");
    console.log("  OK -> " + result.recordset[0].s + " / " + result.recordset[0].u);
    await pool.close();
  } catch (err) {
    console.log("  FALLITO: " + (err instanceof Error ? err.message : err));
  }
  console.log("");

  // Test 2: trustedConnection + instance name
  console.log("Test 2: trustedConnection con nome istanza...");
  try {
    const pool = await sql.connect({
      server: process.env.SQL_SERVER || "",
      database: process.env.SQL_DATABASE || "",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true,
        connectTimeout: 10000,
      },
    });
    const result = await pool.request().query("SELECT @@SERVERNAME AS s, USER_NAME() AS u");
    console.log("  OK -> " + result.recordset[0].s + " / " + result.recordset[0].u);
    await pool.close();
  } catch (err) {
    console.log("  FALLITO: " + (err instanceof Error ? err.message : err));
  }
  console.log("");

  // Test 3: trustedConnection + dynamic port
  console.log("Test 3: trustedConnection + porta esplicita...");
  try {
    const pool = await sql.connect({
      server: server + ",1433",
      database: process.env.SQL_DATABASE || "",
      options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true,
        connectTimeout: 10000,
      },
    });
    const result = await pool.request().query("SELECT @@SERVERNAME AS s, USER_NAME() AS u");
    console.log("  OK -> " + result.recordset[0].s + " / " + result.recordset[0].u);
    await pool.close();
  } catch (err) {
    console.log("  FALLITO: " + (err instanceof Error ? err.message : err));
  }
}

main();