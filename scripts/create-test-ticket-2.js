const { createClient } = require("@libsql/client");

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

function now() {
  return new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function main() {
  const ts = now();

  // Ticket 2 - IN_CORSO
  const ticketId2 = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO tickets (id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema, descrizione_dettagliata, priorita, stato, note, operatore, data_creazione, data_aggiornamento, data_chiusura)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticketId2,
      "TICK-" + String(Date.now()).slice(-6),
      "Gamma SpA",
      "Laura Bianchi",
      "347 123 4567",
      "laura.bianchi@gamma.it",
      "Magazzino",
      "Inventario non si aggiorna dopo movimenti di magazzino",
      "Dopo aver registrato dei movimenti di carico e scarico, l'inventario mostra ancora le quantità precedenti. Il problema si verifica dall'aggiornamento alla versione 3.2.1.",
      "MEDIA",
      "IN_CORSO",
      "Verificare parametri di sincronizzazione DB",
      "Luca Neri",
      ts,
      ts,
      null,
    ],
  });

  // Ticket 3 - CHIUSO
  const ticketId3 = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO tickets (id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema, descrizione_dettagliata, priorita, stato, note, operatore, data_creazione, data_aggiornamento, data_chiusura)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticketId3,
      "TICK-" + String(Date.now() - 100000).slice(-6),
      "Delta Srl",
      "Roberto Ferrari",
      "320 987 6543",
      "roberto.ferrari@delta.it",
      "Contabilità",
      "Stampa bilancio non include dati trimestrali",
      "Il report di bilancio stampa solo i dati mensili e non include il riepilogo trimestrale richiesto dalla normativa.",
      "BASSA",
      "CHIUSO",
      "Risolto con aggiornamento patch 1.0.5",
      "Mario Rossi",
      ts,
      ts,
      ts,
    ],
  });

  // Add technical note to closed ticket
  const noteId = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO technical_notes (id, ticket_id, titolo, problema, soluzione, operatore, data_creazione) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      noteId,
      ticketId3,
      "Patch report bilancio trimestrale",
      "Il report mancava della sezione riepilogo trimestrale perché nel template non era incluso il GROUP BY per trimestre.",
      "Aggiunto il raggruppamento per trimestre nel query SQL del report. Aggiornato il template HTML per includere la tabella riepilogo trimestrale. Rilasciato come patch 1.0.5.",
      "Mario Rossi",
      ts,
    ],
  });

  console.log("Tutti i ticket di test creati!");
  console.log("Ticket 2 (IN_CORSO):", ticketId2);
  console.log("Ticket 3 (CHIUSO):", ticketId3);
}

main().catch(console.error);
