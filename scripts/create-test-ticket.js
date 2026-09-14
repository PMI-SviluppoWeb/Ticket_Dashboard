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
  const ticketId = crypto.randomUUID();
  const msgId1 = crypto.randomUUID();
  const msgId2 = crypto.randomUUID();
  const msgId3 = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const ts = now();

  // Create ticket
  await client.execute({
    sql: `INSERT INTO tickets (id, numero, cliente, contatto, telefono, email, modulo_software, sommario_problema, descrizione_dettagliata, priorita, stato, note, operatore, data_creazione, data_aggiornamento, data_chiusura)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ticketId,
      "TICK-" + String(Date.now()).slice(-6),
      "Beta Srl",
      "Mario Verdi",
      "333 456 7890",
      "mario.verdi@betasrl.it",
      "Fatturazione Elettronica",
      "Errore invio fatture SDI: codice errore 0001",
      "Il sistema non riesce a inviare le fatture elettroniche allo SDI. Viene mostrato l'errore 0001 'Formato non valido'. Il problema si presenta solo con le fatture che hanno aliquote IVA multiple. Le fatture con singola aliquota vengono inviate correttamente.",
      "ALTA",
      "NUOVO",
      "Cliente ha deadline fatturazione fine mese. Urgente.",
      null,
      ts,
      ts,
      null,
    ],
  });

  // Create messages
  await client.execute({
    sql: `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione) VALUES (?, ?, ?, ?, ?)`,
    args: [msgId1, ticketId, "user", "Buongiorno, ho un problema con l'invio delle fatture. Da ieri non riesco a inviare le fatture allo SDI. Mi dice errore 0001. Potete aiutarmi?", ts],
  });
  await client.execute({
    sql: `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione) VALUES (?, ?, ?, ?, ?)`,
    args: [msgId2, ticketId, "assistant", "Buongiorno Mario, grazie per averci contattato. Sto verificando il problema. Potrebbe dirmi se il problema si verifica con tutte le fatture o solo con alcune?", ts],
  });
  await client.execute({
    sql: `INSERT INTO messages (id, ticket_id, ruolo, contenuto, data_creazione) VALUES (?, ?, ?, ?, ?)`,
    args: [msgId3, ticketId, "user", "Ho provato con 3 fatture diverse. Quella con un solo prodotto va, quelle con più prodotti e aliquote diverse no.", ts],
  });

  // Create technical note with solution
  await client.execute({
    sql: `INSERT INTO technical_notes (id, ticket_id, titolo, problema, soluzione, operatore, data_creazione) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      noteId,
      ticketId,
      "Fix generazione XML fattura multi-aliquota",
      "Il file XML generato per fatture con aliquote IVA multiple non rispettava lo standard SDI FatturaPA v1.2.2. Il campo <AliquotaIVA> veniva ripetuto per ogni riga invece di essere raggruppato per aliquota.",
      "Modificato il template di generazione XML nel file lib/fattura-xml.ts. Corretto il raggruppamento delle aliquote IVA. Aggiunto test unitario per fatture multi-aliquota. Deploy della versione 2.1.3 sul server di produzione.",
      "Luca Neri",
      ts,
    ],
  });

  console.log("Ticket creato con successo!");
  console.log("ID:", ticketId);
  console.log("Numero: TICK-" + String(Date.now()).slice(-6));
}

main().catch(console.error);
