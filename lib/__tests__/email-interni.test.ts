import assert from "node:assert/strict";
import test from "node:test";
import {
  eMittenteInterno,
  normalizzaEmail,
  parseRegoleInterne,
} from "../email-interni";

// Regola: le email inviate dalle nostre caselle non devono creare ticket.
// Un errore qui o crea ticket falsi o scarta richieste vere.

test("normalizzaEmail rende minuscolo, toglie spazi e +tag", () => {
  assert.equal(normalizzaEmail("  Assistenza+Support@PMISoftware.it "), "assistenza@pmisoftware.it");
  assert.equal(normalizzaEmail("Mario.Rossi@Example.com"), "mario.rossi@example.com");
});

test("match esatto dell'indirizzo interno", () => {
  const regole = { indirizzi: ["assistenza@pmisoftware.it"], domini: [] };
  assert.equal(eMittenteInterno("assistenza@pmisoftware.it", regole), true);
  assert.equal(eMittenteInterno("ASSISTENZA+tag@pmisoftware.it", regole), true);
  assert.equal(eMittenteInterno("cvcristal@cvcristal.it", regole), false);
});

test("match per dominio interno", () => {
  const regole = { indirizzi: [], domini: ["pmisoftware.it"] };
  assert.equal(eMittenteInterno("mario@pmisoftware.it", regole), true);
  assert.equal(eMittenteInterno("mario@example.com", regole), false);
});

test("senza regole nessun mittente e' interno", () => {
  assert.equal(eMittenteInterno("assistenza@pmisoftware.it", { indirizzi: [], domini: [] }), false);
});

test("parseRegoleInterne separa indirizzi e domini e ignora righe non valide", () => {
  const regole = parseRegoleInterne([
    "assistenza@pmisoftware.it",
    "  Info@PMISoftware.it  ",
    "@pmisoftware.it",
    "",
    "nonvalido",
    "@non valido",
  ]);
  assert.deepEqual(regole.indirizzi.sort(), [
    "assistenza@pmisoftware.it",
    "info@pmisoftware.it",
  ]);
  assert.deepEqual(regole.domini, ["pmisoftware.it"]);
});
