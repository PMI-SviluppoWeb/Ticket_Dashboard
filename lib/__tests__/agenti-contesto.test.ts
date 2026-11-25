import assert from "node:assert/strict";
import test from "node:test";
import {
  componiStoricoConversazione,
  formattaContestoCliente,
  formattaContestoTicket,
  formattaContestoProgetto,
} from "../agenti-contesto";
import type { Cliente, Ticket } from "../types";

function esc(input: string, output: string | null, errore: string | null = null) {
  return { input_utente: input, output, errore, stato: output ? "completata" : "errore" };
}

test("storico: vuoto senza esecuzioni", () => {
  assert.deepEqual(componiStoricoConversazione([]), []);
});

test("storico: coppie utente/assistente in ordine cronologico", () => {
  const storico = componiStoricoConversazione([
    esc("prima domanda", "prima risposta"),
    esc("seconda domanda", "seconda risposta"),
  ]);
  assert.deepEqual(storico, [
    { role: "user", content: "prima domanda" },
    { role: "assistant", content: "prima risposta" },
    { role: "user", content: "seconda domanda" },
    { role: "assistant", content: "seconda risposta" },
  ]);
});

test("storico: un errore diventa un messaggio assistente leggibile", () => {
  const storico = componiStoricoConversazione([
    esc("domanda fallita", null, "timeout"),
  ]);
  assert.equal(storico.length, 2);
  assert.equal(storico[1].role, "assistant");
  assert.match(storico[1].content, /timeout/);
});

test("storico: con testi lunghi resta il turno più recente", () => {
  const lungo = "x".repeat(4000);
  const esecuzioni = Array.from({ length: 10 }, (_, i) =>
    esc(`${i}-${lungo}`, `${i}-${lungo}`)
  );
  const storico = componiStoricoConversazione(esecuzioni);
  assert.equal(storico.length, 2);
  assert.ok(storico[0].content.startsWith("9-"));
  assert.ok(!storico.some((m) => m.content.startsWith("0-")));
});

test("contesto ticket: contiene numero, cliente e messaggi", () => {
  const ticket = {
    numero: "TICK-953983",
    cliente: "A FOR A S.R.L.",
    contatto: "Attilio Gambardella",
    email: "amministrazione@afora.it",
    stato: "IN_CORSO",
    priorita: "MEDIA",
    modulo_software: "Altro",
    sommario_problema: "Richiesta di modifiche su Arca Web",
    descrizione_dettagliata: "Dettaglio della richiesta",
    messaggi: [
      {
        ruolo: "user",
        contenuto: "Email ricevuta da amministrazione@afora.it",
      },
    ],
    note_tecniche: [],
  } as unknown as Ticket;

  const testo = formattaContestoTicket(ticket);
  assert.match(testo, /TICK-953983/);
  assert.match(testo, /A FOR A S\.R\.L\./);
  assert.match(testo, /Email ricevuta/);
  assert.match(testo, /NON chiedere informazioni già presenti/);
});

test("contesto cliente: contiene ragione sociale e recapiti", () => {
  const cliente = {
    ragione_sociale: "ACME S.r.l.",
    nome_contatto: "Mario Rossi",
    email: "mario@acme.it",
    telefono: "3331234567",
    indirizzo: "Via Roma 1",
    citta: "Roma",
    provincia: "RM",
    cap: "00100",
    partita_iva: "12345678901",
    note: null,
  } as unknown as Cliente;

  const testo = formattaContestoCliente(cliente);
  assert.match(testo, /ACME S\.r\.l\./);
  assert.match(testo, /mario@acme\.it/);
});

test("contesto progetto: riporta l'id", () => {
  assert.match(formattaContestoProgetto("prog-1"), /prog-1/);
});
