import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const baseUrl = process.env.ARCA_API_BASE_URL || "http://srv2022/PMISOFTWARE/api";
const apiKey = process.env.ARCA_API_KEY || "";

async function testEndpoint(name: string, path: string) {
  const url = `${baseUrl}${path}`;
  console.log(`\n=== ${name}: ${url} ===`);
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
    });
    const text = await res.text();
    console.log("status:", res.status);
    console.log("body (primi 500 char):", text.substring(0, 500));
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          console.log("record count:", data.length);
          if (data.length > 0) {
            console.log("chiavi primo record:", Object.keys(data[0]).join(", "));
          }
        } else {
          console.log("tipo:", typeof data, "chiavi:", Object.keys(data).join(", "));
        }
      } catch {
        console.log("risposta non-JSON");
      }
    }
  } catch (err) {
    console.log("ERRORE:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log("ARCA_API_KEY:", apiKey ? `impostata (${apiKey.substring(0, 8)}...)` : "MANCANTE");
  await testEndpoint("dbo_CF (clienti)", "/dbo_CF");
  await testEndpoint("dbo_CFContatto (contatti)", "/dbo_CFContatto");
}

main();
