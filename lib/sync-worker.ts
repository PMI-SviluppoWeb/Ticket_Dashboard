import { syncClienti } from "./sync/sync-clienti";

// Sync periodica delle anagrafiche clienti dall'ERP (Arca). Gira nello stesso
// processo dei worker email: nessun nuovo container, un loop in piu'.
//
// Se la sorgente non e' configurata, il primo tentativo fallisce e viene
// loggato: il worker email non deve fermarsi per questo.
export async function startSyncClientiWorker(): Promise<void> {
  const intervallo = parseInt(
    process.env.SYNC_CLIENTI_INTERVAL_MS ?? String(6 * 60 * 60 * 1000),
    10
  );
  const ogniMs = Number.isFinite(intervallo) && intervallo >= 60_000 ? intervallo : 6 * 60 * 60 * 1000;

  const esegui = async () => {
    try {
      const esito = await syncClienti();
      console.log(
        `[sync-clienti] ${esito.total} letti, ${esito.inserted} inseriti, ` +
          `${esito.updated} aggiornati, ${esito.skipped} invariati, ${esito.errors.length} errori.`
      );
      for (const e of esito.errors.slice(0, 5)) console.error("[sync-clienti]", e);
    } catch (err) {
      console.error("[sync-clienti] Sincronizzazione non riuscita (riprovo al prossimo ciclo):", err);
    }
  };

  await esegui();
  console.log(`[sync-clienti] Prossima sincronizzazione tra ${Math.round(ogniMs / 60000)} minuti.`);
  setInterval(() => {
    void esegui();
  }, ogniMs);
}
