import assert from "node:assert/strict";
import test from "node:test";
import { cellaCsv } from "../csv";

// Il CSV viene aperto in Excel: una cella che inizia con = + - @ e' una
// formula, non testo. Questi test fissano la neutralizzazione (CSV injection).

test("una cella normale resta invariata", () => {
  assert.equal(cellaCsv("Rossi & Figli"), "Rossi & Figli");
});

test("le formule vengono neutralizzate con l'apostrofo", () => {
  assert.equal(cellaCsv("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(cellaCsv("+39 02 1234"), "'+39 02 1234");

  // Con virgolette o ";" la cella viene anche racchiusa e le virgolette
  // raddoppiate, secondo le regole CSV.
  const link = '"' + "'=HYPERLINK(\"\"http://x\"\")" + '"';
  assert.equal(cellaCsv('=HYPERLINK("http://x")'), link);

  const drop = '"' + "'-1;DROP TABLE" + '"';
  assert.equal(cellaCsv("-1;DROP TABLE"), drop);
});

test("i numeri negativi restano numeri", () => {
  assert.equal(cellaCsv(-42), "-42");
});

test("virgolette e separatore vengono racchiusi", () => {
  assert.equal(cellaCsv('via "Roma"; 10'), '"via ""Roma""; 10"');
});
