import { createClient, type Client } from "@libsql/client";

// Client Turso condiviso tra l'app Next (lib/db.ts) e l'IMAP worker.
//
// Questo modulo NON importa "server-only": il worker e' un processo Node
// separato (tsx) dove l'import lancerebbe un errore a runtime. La riga
// "server-only" vive solo in lib/db.ts, che e' la porta d'ingresso lato app.
//
// Lettura lazy delle env: durante `next build` (Docker) le variabili
// d'ambiente non esistono, quindi il client va creato solo al primo accesso
// reale, mai a livello di modulo (altrimenti il build fallisce).
let cachedClient: Client | undefined;

export function getTursoClient(): Client {
  if (!cachedClient) {
    const url = process.env.TURSO_DATABASE_URL ?? "";
    if (!url) {
      throw new Error(
        "Variabile TURSO_DATABASE_URL mancante. Configura il file .env con l'URL del database Turso."
      );
    }
    cachedClient = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
      // Next.js patcha il fetch globale e, per impostazione predefinita,
      // ne mette in cache le risposte SU DISCO (.next/cache/fetch-cache).
      // @libsql/client usa proprio il fetch globale, quindi senza questo
      // override le risposte SQL di Turso vengono congelate: la prima
      // risposta a una data query viene riusata per sempre, anche dopo un
      // riavvio, e le letture non vedono piu' le scritture successive.
      // Un database va letto sempre fresco: cache disattivata esplicitamente.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    });
  }
  return cachedClient;
}
