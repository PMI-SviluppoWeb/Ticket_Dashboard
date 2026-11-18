import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { getTursoClient } = await import("../lib/turso-client");
  const db = getTursoClient();

  const caselle = await db.execute(
    "SELECT id, etichetta, indirizzo, tipo, abilitata, predefinita FROM caselle_email ORDER BY indirizzo"
  );
  console.log("=== CASELLE EMAIL NEL DB ===");
  console.log(caselle.rows.length === 0 ? "(nessuna)" : caselle.rows);

  const inbox = await db.execute(
    `SELECT from_email, subject, casella_id, stato, stato_triage, esito_ai, data_creazione
     FROM email_inbox ORDER BY data_creazione DESC LIMIT 15`
  );
  console.log("\n=== ULTIME 15 EMAIL IN ARRIVO ===");
  for (const r of inbox.rows) console.log(r);

  const ticket = await db.execute(
    `SELECT numero, cliente, email, canale, creato_il, data_creazione, sommario_problema
     FROM tickets WHERE canale = 'email' ORDER BY data_creazione DESC LIMIT 15`
  );
  console.log("\n=== ULTIMI 15 TICKET DA EMAIL ===");
  for (const r of ticket.rows) console.log(r);
}

main().catch((err) => {
  console.error("Errore diagnostica:", err);
  process.exit(1);
});
