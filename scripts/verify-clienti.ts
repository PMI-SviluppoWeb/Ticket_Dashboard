import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { createClient } = await import("@libsql/client");

  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    console.error("TURSO_DATABASE_URL mancante in .env.local");
    process.exit(1);
  }

  const client = createClient({ url, authToken: token || undefined });

  const tot = await client.execute("SELECT COUNT(*) AS cnt FROM clienti");
  console.log("Clienti totali in Turso:", (tot.rows[0] as any).cnt);

  const conTel = await client.execute(
    "SELECT COUNT(*) AS cnt FROM clienti WHERE telefono IS NOT NULL AND telefono != ''"
  );
  console.log("Clienti con telefono:", (conTel.rows[0] as any).cnt);

  const conEmail = await client.execute(
    "SELECT COUNT(*) AS cnt FROM clienti WHERE email IS NOT NULL AND email != ''"
  );
  console.log("Clienti con email:", (conEmail.rows[0] as any).cnt);

  const campione = await client.execute(
    "SELECT id, ragione_sociale, nome_contatto, telefono, email, citta, provincia FROM clienti WHERE telefono IS NOT NULL AND telefono != '' LIMIT 5"
  );
  console.log("\nCampione clienti con telefono:");
  for (const row of campione.rows) {
    console.log(
      `  [${row.id}] ${row.ragione_sociale} | tel=${row.telefono} | email=${row.email} | ${row.nome_contatto}`
    );
  }

  // Test lookup stile MCP: ricerca per numero (anche parziale/digitale)
  const testNum = String(campione.rows[0]?.telefono || "");
  if (testNum) {
    const digits = testNum.replace(/\D/g, "");
    const lookup = await client.execute({
      sql: "SELECT id, ragione_sociale, telefono FROM clienti WHERE REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '.', ''), '/', '') LIKE :pat LIMIT 5",
      args: { pat: `%${digits}%` },
    });
    console.log(`\nLookup telefono "${testNum}" (normalizzato ${digits}): ${lookup.rows.length} risultati`);
    for (const row of lookup.rows) {
      console.log(`  -> [${row.id}] ${row.ragione_sociale} (${row.telefono})`);
    }
  }
}

main().catch((e) => {
  console.error("ERRORE:", e);
  process.exit(1);
});
