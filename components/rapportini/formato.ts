// Formattazione e tinte condivise dei rapportini (client-safe: nessun import
// server). Usate dal ticket, dall'elenco e dal dettaglio.

export function formatMinuti(minuti: number): string {
  const ore = Math.floor(minuti / 60);
  const min = minuti % 60;
  if (ore === 0) return `${min}m`;
  return `${ore}h ${String(min).padStart(2, "0")}m`;
}

export const RAPPORTINO_STATO_LABEL: Record<string, string> = {
  bozza: "Bozza",
  confermato: "Confermato",
  esportato: "Esportato",
  errore: "Errore",
};

export const RAPPORTINO_STATO_CLASSE: Record<string, string> = {
  bozza: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  confermato: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  esportato: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  errore: "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo",
};

export function dataBreve(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
