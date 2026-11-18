import { db } from "./db";

// Registro unico delle mutazioni. Ogni scrittura "di business" (ticket, note,
// ore, agenti, API macchina) lascia una riga: chi, cosa, su quale entita'.
//
// Regola: il registro non deve MAI far fallire l'operazione principale. Se la
// scrittura del registro fallisce (DB lento, colonna mancante) si logga
// l'errore e si prosegue: perdere una riga di audit e' meno grave che perdere
// il ticket che l'utente stava salvando.

export type OrigineAttivita = "utente" | "agente" | "api" | "sistema";

export interface VoceRegistro {
  operatoreId?: string | null;
  origine?: OrigineAttivita;
  azione: string;
  entita?: string | null;
  entitaId?: string | null;
  dettagli?: Record<string, unknown> | null;
}

export async function registra(voce: VoceRegistro): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO registro_attivita (id, operatore_id, origine, azione, entita, entita_id, dettagli, data)
         VALUES (@id, @operatore_id, @origine, @azione, @entita, @entita_id, @dettagli, @data)`
      )
      .run({
        id: crypto.randomUUID(),
        operatore_id: voce.operatoreId ?? null,
        origine: voce.origine ?? "utente",
        azione: voce.azione,
        entita: voce.entita ?? null,
        entita_id: voce.entitaId ?? null,
        dettagli: voce.dettagli ? JSON.stringify(voce.dettagli) : null,
        data: new Date().toISOString(),
      });
  } catch (err) {
    console.error("Registro attivita non scritto:", voce.azione, err);
  }
}
