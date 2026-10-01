import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const baseUrl = process.env.ARCA_API_BASE_URL || "http://srv2022/PMISOFTWARE/api";
const apiKey = process.env.ARCA_API_KEY || "";

async function fetchOData(endpoint: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status}`);
  const data = await res.json();
  if (data && Array.isArray(data.value)) return data.value;
  if (Array.isArray(data)) return data;
  throw new Error(`Formato non riconosciuto per ${endpoint}`);
}

async function main() {
  const contatti = await fetchOData("/dbo_CFContatto");
  console.log("Totale contatti:", contatti.length);

  const conCell = contatti.filter((c) => c.cellulare && String(c.cellulare).trim());
  const conCell2 = contatti.filter((c) => c.cellulare2 && String(c.cellulare2).trim());
  const conEmail = contatti.filter((c) => c.email && String(c.email).trim());
  const cfUnici = new Set(contatti.map((c) => c.cd_cf).filter(Boolean));
  const cfConCell = new Set(conCell.map((c) => c.cd_cf).filter(Boolean));

  console.log("Contatti con cellulare:", conCell.length);
  console.log("Contatti con cellulare2:", conCell2.length);
  console.log("Contatti con email:", conEmail.length);
  console.log("Clienti (cd_cf) unici nei contatti:", cfUnici.size);
  console.log("Clienti con almeno un cellulare:", cfConCell.size);

  console.log("\nEsempi contatti con cellulare:");
  conCell.slice(0, 5).forEach((c) => {
    console.log(
      `  cd_cf=${c.cd_cf} nome=${c.nome} ${c.cognome} cellulare=${c.cellulare} email=${c.email} tipo=${c.descrizione}`
    );
  });

  // Formati telefono
  const formats = conCell.slice(0, 200).map((c) => String(c.cellulare));
  console.log("\nEsempi numeri:", formats.slice(0, 10).join(" | "));

  const clienti = await fetchOData("/dbo_CF");
  console.log("\nTotale anagrafiche (dbo_CF):", clienti.length);
  const soloClienti = clienti.filter((c) => c.cliente === true);
  const soloFornitori = clienti.filter((c) => c.fornitore === true);
  console.log("  flag cliente=true:", soloClienti.length);
  console.log("  flag fornitore=true:", soloFornitori.length);
}

main().catch((e) => {
  console.error("ERRORE:", e.message);
  process.exit(1);
});
