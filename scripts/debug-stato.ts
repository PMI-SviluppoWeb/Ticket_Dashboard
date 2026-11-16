import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

async function main() {
  const { getTursoClient } = await import("../lib/turso-client");
  const db = getTursoClient();

  const r = await db.execute(
    "SELECT etichetta, indirizzo, imap_host, imap_port, abilitata, predefinita FROM caselle_email"
  );
  console.log("Caselle nel DB:");
  for (const row of r.rows) {
    console.log(
      ` - ${row.etichetta} <${row.indirizzo}> imap=${row.imap_host}:${row.imap_port} abilitata=${row.abilitata} default=${row.predefinita}`
    );
  }
  if (r.rows.length === 0) console.log(" (nessuna)");

  const inbox = await db.execute(
    "SELECT COUNT(*) AS n FROM email_inbox"
  );
  console.log("Email in email_inbox:", Number(inbox.rows[0].n));

  const tick = await db.execute(
    "SELECT numero, cliente, sommario_problema, data_creazione FROM tickets ORDER BY data_creazione DESC LIMIT 5"
  );
  console.log("Ultimi ticket:");
  for (const t of tick.rows) {
    console.log(` - ${t.numero} | ${t.cliente} | ${t.sommario_problema} | ${t.data_creazione}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATALE:", e);
    process.exit(1);
  });
