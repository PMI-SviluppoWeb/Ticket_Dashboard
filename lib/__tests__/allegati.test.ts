import assert from "node:assert/strict";
import test from "node:test";
import {
  estensione,
  inlineConsentito,
  mimeDaNome,
  nomeOriginaleSicuro,
} from "../allegati";

// La regola di sicurezza: il tipo si decide dal NOME su una lista chiusa, e
// solo immagini raster e PDF possono essere mostrati inline. Un HTML non deve
// mai poter passare per immagine.

test("il MIME si deriva dall'estensione, mai dal client", () => {
  assert.equal(mimeDaNome("foto.PNG"), "image/png");
  assert.equal(mimeDaNome("manuale.pdf"), "application/pdf");
  assert.equal(mimeDaNome("archivio.final.zip"), "application/zip");
});

test("tipi pericolosi o sconosciuti non sono ammessi", () => {
  assert.equal(mimeDaNome("pagina.html"), null);
  assert.equal(mimeDaNome("script.svg"), null);
  assert.equal(mimeDaNome("senzaestensione"), null);
});

test("solo raster e PDF sono inline", () => {
  assert.equal(inlineConsentito("image/png"), true);
  assert.equal(inlineConsentito("image/jpeg"), true);
  assert.equal(inlineConsentito("application/pdf"), true);
  assert.equal(inlineConsentito("text/html"), false);
  assert.equal(inlineConsentito("image/svg+xml"), false);
  assert.equal(inlineConsentito("application/octet-stream"), false);
});

test("il nome originale non conserva percorsi ne' caratteri di controllo", () => {
  assert.equal(nomeOriginaleSicuro("../../etc/passwd"), "passwd");
  assert.equal(nomeOriginaleSicuro('relazione"\n.pdf'), "relazione.pdf");
  assert.equal(nomeOriginaleSicuro(""), "allegato");
});

test("estensione legge solo l'ultimo punto", () => {
  assert.equal(estensione("a.b.PDF"), "pdf");
  assert.equal(estensione(".gitignore"), "");
  assert.equal(estensione("senza-punto"), "");
});
