// Definizioni dei gruppi di strumenti "dati dell'app" — dati PURI, senza
// import di server: condiviso da lib/agenti-tools.ts (esecutore server) e
// dalla pagina /admin/agenti (checkbox in UI). Ogni gruppo corrisponde a uno
// o piu' tool reali in lib/agenti-tools.ts (i nomi devono combaciare).

export interface GruppoStrumentiDef {
  id: "ticket" | "clienti" | "statistiche" | "operazioni";
  label: string;
  descrizione: string;
  tools: string[];
}

export const GRUPPI_STRUMENTI: GruppoStrumentiDef[] = [
  {
    id: "ticket",
    label: "Ticket",
    descrizione: "Cerca e legge i ticket di assistenza (sola lettura).",
    tools: ["cerca_ticket", "get_ticket"],
  },
  {
    id: "clienti",
    label: "Clienti",
    descrizione: "Cerca l'anagrafica clienti (sola lettura).",
    tools: ["cerca_clienti", "get_cliente"],
  },
  {
    id: "statistiche",
    label: "Statistiche",
    descrizione: "KPI della dashboard: totali per stato e priorità.",
    tools: ["statistiche_dashboard"],
  },
  {
    id: "operazioni",
    label: "Operazioni",
    descrizione:
      "Propone la creazione di progetti e attività. Non scrive nulla: serve l'approvazione umana.",
    tools: ["proponi_progetto_con_task"],
  },
];

// Tutti i nomi tool validi (per validare i valori salvati su agenti.strumenti).
export const TUTTI_STRUMENTI: string[] = GRUPPI_STRUMENTI.flatMap((g) => g.tools);

// Da nomi tool a gruppi selezionati (per riaprire il form in modifica).
export function gruppiDaStrumenti(tools: string[]): GruppoStrumentiDef["id"][] {
  return GRUPPI_STRUMENTI.filter((g) => g.tools.some((t) => tools.includes(t))).map(
    (g) => g.id
  );
}

// Dai gruppi selezionati ai nomi tool da salvare su agenti.strumenti.
export function strumentiDaGruppi(gruppi: string[]): string[] {
  return GRUPPI_STRUMENTI.filter((g) => gruppi.includes(g.id)).flatMap((g) => g.tools);
}
