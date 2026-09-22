import { syncConfig } from "../config";

export interface ClienteFromApi {
  [key: string]: unknown;
}

/**
 * Recupera tutti i clienti dall'API Arca.
 *
 * TODO: Implementare quando la documentazione API sarà disponibile.
 * Attualmente lancia un errore se chiamato.
 */
export async function fetchClientiFromApi(): Promise<ClienteFromApi[]> {
  if (!syncConfig.api.enabled) {
    throw new Error(
      "API source non ancora implementata. Imposta 'api.enabled' su true e implementa questa funzione."
    );
  }

  const { baseUrl, endpoint } = syncConfig.api;
  const apiKey = process.env.ARCA_API_KEY || "";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // TODO: Adattare il parsing in base al formato di risposta dell'API Arca
  // Assumiamo che la risposta sia un array di clienti o contenga un campo 'data'
  if (Array.isArray(data)) {
    return data as ClienteFromApi[];
  }

  if (data && typeof data === "object" && "data" in data) {
    return (data as { data: ClienteFromApi[] }).data;
  }

  throw new Error("Formato risposta API non riconosciuto");
}
