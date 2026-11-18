import { db } from "./db";

// Ricerca cliente per numero di telefono per l'API macchina (bot WhatsApp).
// Restituisce SOLO l'anagrafica che corrisponde a quel numero: il bot non deve
// poter enumerare i clienti.
export function normalizzaTelefono(valore: string): string {
  return valore.replace(/\D/g, "");
}

export interface ClientePerTelefono {
  id: string;
  ragione_sociale: string;
  nome_contatto: string | null;
  email: string | null;
  telefono: string | null;
}

export async function cercaClientePerTelefono(
  telefono: string
): Promise<ClientePerTelefono | null> {
  const cifre = normalizzaTelefono(telefono);
  if (cifre.length < 6) return null;
  // Confronto sugli ultimi 9 caratteri (ignora prefisso internazionale e
  // punteggiatura). Il filtro preciso si fa in JS sul numero normalizzato:
  // evita falsi positivi dati dal LIKE.
  const suffisso = cifre.slice(-9);

  const rows = await db
    .prepare(
      `SELECT id, ragione_sociale, nome_contatto, email, telefono
       FROM clienti
       WHERE attivo = 1 AND telefono IS NOT NULL AND telefono != ''
         AND REPLACE(REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '-', ''), '+', ''), '.', '') LIKE @suffisso
       LIMIT 20`
    )
    .all({ suffisso: `%${suffisso}` });

  for (const r of rows) {
    const numerico = normalizzaTelefono(String(r.telefono ?? ""));
    if (numerico.endsWith(suffisso)) {
      return {
        id: String(r.id),
        ragione_sociale: String(r.ragione_sociale),
        nome_contatto: r.nome_contatto ? String(r.nome_contatto) : null,
        email: r.email ? String(r.email) : null,
        telefono: r.telefono ? String(r.telefono) : null,
      };
    }
  }
  return null;
}
