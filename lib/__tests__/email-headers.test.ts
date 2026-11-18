import assert from "node:assert/strict";
import test from "node:test";
import {
  estraiRiferimenti,
  normalizzaMessageId,
  oggettoConToken,
} from "../email-headers";

// Header di threading: un errore qui aggancia la risposta al ticket sbagliato
// oppure crea un ticket doppio.

test("normalizzaMessageId aggiunge le parentesi angolari", () => {
  assert.equal(normalizzaMessageId("abc@x.it"), "<abc@x.it>");
  assert.equal(normalizzaMessageId(" <abc@x.it> "), "<abc@x.it>");
  assert.equal(normalizzaMessageId(""), null);
  assert.equal(normalizzaMessageId(null), null);
});

test("estraiRiferimenti legge piu' id dallo stesso header e deduplica", () => {
  const refs = estraiRiferimenti(
    "<a@x.it> <b@x.it>",
    "<a@x.it>",
    "c@x.it"
  );
  assert.deepEqual(refs, ["<a@x.it>", "<b@x.it>", "<c@x.it>"]);
});

test("oggettoConToken non duplica il token", () => {
  assert.equal(
    oggettoConToken("Re: problema stampa", "TICK-000042"),
    "[TICK-000042] Re: problema stampa"
  );
  assert.equal(
    oggettoConToken("[TICK-000042] Re: problema stampa", "TICK-000042"),
    "[TICK-000042] Re: problema stampa"
  );
  assert.equal(oggettoConToken("Re: x", null), "Re: x");
});
