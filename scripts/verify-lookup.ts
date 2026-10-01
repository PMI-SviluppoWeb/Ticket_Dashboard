import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  // Record sincronizzati dall'API (id numerico)
  const api = await client.execute(
    "SELECT COUNT(*) AS cnt FROM clienti WHERE id GLOB '*[0-9]*' AND id NOT LIKE 'CLI-%'"
  );
  console.log("Record da API (id numerico):", (api.rows[0] as any).cnt);

  const apiTel = await client.execute(
    `SELECT COUNT(*) AS cnt FROM clienti
     WHERE id NOT LIKE 'CLI-%' AND telefono IS NOT NULL AND telefono != ''`
  );
  console.log("Record API con telefono:", (apiTel.rows[0] as any).cnt);

  const campione = await client.execute(
    `SELECT id, ragione_sociale, nome_contatto, telefono, email, citta, provincia, partita_iva
     FROM clienti
     WHERE id NOT LIKE 'CLI-%' AND telefono IS NOT NULL AND telefono != ''
     LIMIT 8`
  );
  console.log("\nCampione API con telefono:");
  for (const row of campione.rows) {
    console.log(
      `  [${row.id}] ${row.ragione_sociale} | tel=${row.telefono} | ${row.nome_contatto || "-"} | ${row.email || "-"} | ${row.citta || "-"}`
    );
  }

  // Formati telefono memorizzati
  const formats = await client.execute(
    `SELECT telefono FROM clienti
     WHERE id NOT LIKE 'CLI-%' AND telefono IS NOT NULL AND telefono != ''
     LIMIT 30`
  );
  const esempi = formats.rows.map((r) => String(r.telefono));
  console.log("\nFormati telefono memorizzati:", esempi.slice(0, 15).join(" | "));
  const conNonDigit = esempi.filter((t) => /\D/.test(t));
  console.log(`Numeri con caratteri non-digit (su primi 30): ${conNonDigit.length}`);

  // Lookup realistico: utente chiama con numero formattato
  const target = esempi[0];
  if (target) {
    console.log(`\n--- Test lookup con numero formattato ---`);
    for (const query of [target, target.replace(/(\d{3})(\d+)/, "$1 $2"), `+39${target}`]) {
      const digits = query.replace(/\D/g, "");
      const stripped = digits.startsWith("39") && digits.length >= 11 ? digits.slice(2) : digits;
      const r = await client.execute({
        sql: `SELECT id, ragione_sociale, telefono FROM clienti
              WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '.', ''), '/', ''), '-', '') LIKE :pat
              LIMIT 5`,
        args: { pat: `%${stripped}%` },
      });
      console.log(
        `  query="${query}" -> normalizzato="${stripped}" -> ${r.rows.length} risultati` +
          (r.rows.length ? `: ${r.rows[0].ragione_sociale} (${r.rows[0].telefono})` : "")
      );
    }
  }
};

main().catch((e) => {
  console.error("ERRORE:", e);
  process.exit(1);
});
