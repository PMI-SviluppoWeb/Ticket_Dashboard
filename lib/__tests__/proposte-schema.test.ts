import assert from "node:assert/strict";
import test from "node:test";
import { validaPayloadProposta } from "../proposte-schema";

const base = {
  progetto: {
    nome: "Implementazioni Arca Web",
    descrizione: "Richieste del cliente",
    cliente_id: "CLI-001",
    cliente_nome: "A FOR A S.R.L.",
    priorita: "ALTA",
    responsabile: "Mirko",
    data_inizio: "2026-11-25T09:00",
    data_fine: null,
    note: "",
  },
  attivita: [
    {
      titolo: "Picking List",
      descrizione: "Quantità disponibile",
      priorita: "MEDIA",
      data_scadenza: "2026-12-01T18:00",
      assegnatario: "Mirko",
      persone: [],
    },
  ],
};

test("payload valido viene normalizzato", () => {
  const esito = validaPayloadProposta(base);
  assert.equal(esito.ok, true);
  if (!esito.ok) return;
  assert.equal(esito.payload.progetto.nome, "Implementazioni Arca Web");
  assert.equal(esito.payload.attivita.length, 1);
  assert.equal(esito.payload.attivita[0].titolo, "Picking List");
});

test("il nome progetto è obbligatorio", () => {
  const esito = validaPayloadProposta({
    progetto: { nome: "   " },
    attivita: [],
  });
  assert.equal(esito.ok, false);
});

test("alla creazione il cliente può mancare", () => {
  const esito = validaPayloadProposta({
    progetto: { nome: "Progetto senza cliente" },
    attivita: [],
  });
  assert.equal(esito.ok, true);
  if (esito.ok) assert.equal(esito.payload.progetto.cliente_id, null);
});

test("all'approvazione il cliente è obbligatorio", () => {
  const esito = validaPayloadProposta(
    { progetto: { nome: "Progetto" }, attivita: [] },
    { richiediCliente: true }
  );
  assert.equal(esito.ok, false);
  if (!esito.ok) assert.match(esito.error, /cliente/i);
});

test("date non valide vengono scartate, non bloccano", () => {
  const esito = validaPayloadProposta({
    ...base,
    progetto: { ...base.progetto, data_inizio: "domani" },
  });
  assert.equal(esito.ok, true);
  if (esito.ok) assert.equal(esito.payload.progetto.data_inizio, null);
});

test("attività senza titolo è un errore", () => {
  const esito = validaPayloadProposta({
    progetto: { nome: "Progetto" },
    attivita: [{ titolo: "" }],
  });
  assert.equal(esito.ok, false);
});

test("troppe attività sono rifiutate", () => {
  const attivita = Array.from({ length: 31 }, (_, i) => ({ titolo: `T${i}` }));
  const esito = validaPayloadProposta({ progetto: { nome: "P" }, attivita });
  assert.equal(esito.ok, false);
});

test("priorità non valida ricade su MEDIA", () => {
  const esito = validaPayloadProposta({
    progetto: { nome: "P", priorita: "URGENTE" },
    attivita: [{ titolo: "T", priorita: "boh" }],
  });
  assert.equal(esito.ok, true);
  if (esito.ok) {
    assert.equal(esito.payload.progetto.priorita, "MEDIA");
    assert.equal(esito.payload.attivita[0].priorita, "MEDIA");
  }
});
