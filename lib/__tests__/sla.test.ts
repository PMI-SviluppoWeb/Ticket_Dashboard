import assert from "node:assert/strict";
import test from "node:test";
import {
  aggiungiMinutiLavorativi,
  CONFIG_SLA_DEFAULT,
  minutiLavorativiTra,
  valutaSla,
  type ConfigSla,
} from "../sla";

// Orario di prova: lun-ven 09:00-18:00 con pausa 13:00-14:00 = 8 ore/giorno.
const CFG: ConfigSla = {
  ...CONFIG_SLA_DEFAULT,
  festivi: ["2026-12-25"],
};

// Costruisce una data LOCALE (niente "Z"), cosi' il test non dipende dal
// fuso della macchina.
function d(anno: number, mese: number, giorno: number, h: number, min = 0): number {
  return new Date(anno, mese - 1, giorno, h, min).getTime();
}

test("un intervallo dentro la stessa giornata conta solo le ore lavorative", () => {
  // 10:00 -> 12:00 = 120 minuti.
  assert.equal(minutiLavorativiTra(d(2026, 11, 18, 10), d(2026, 11, 18, 12), CFG), 120);
});

test("la pausa pranzo non viene contata", () => {
  // 12:30 -> 14:30 = 30 minuti prima della pausa + 30 dopo = 60.
  assert.equal(minutiLavorativiTra(d(2026, 11, 18, 12, 30), d(2026, 11, 18, 14, 30), CFG), 60);
});

test("fuori orario e nel weekend valgono zero", () => {
  assert.equal(minutiLavorativiTra(d(2026, 11, 18, 19), d(2026, 11, 18, 23), CFG), 0);
  // sabato 21/11/2026
  assert.equal(minutiLavorativiTra(d(2026, 11, 21, 10), d(2026, 11, 21, 12), CFG), 0);
});

test("un festivo e' escluso", () => {
  // 25/12/2026 e' venerdi'.
  assert.equal(minutiLavorativiTra(d(2026, 12, 25, 10), d(2026, 12, 25, 12), CFG), 0);
});

test("gli intervalli tra giorni si sommano", () => {
  // venerdi 18/12 17:00 -> lunedi 21/12 10:00: 60 min ven + 60 min lun = 120.
  assert.equal(minutiLavorativiTra(d(2026, 12, 18, 17), d(2026, 12, 21, 10), CFG), 120);
});

test("aggiungiMinutiLavorativi scavalca la notte", () => {
  // Da venerdi 17:30 + 120 min -> lunedi 10:30 (30 ven + 90 lun... 09:00-10:30).
  const scadenza = aggiungiMinutiLavorativi(d(2026, 12, 18, 17, 30), 120, CFG);
  assert.equal(scadenza, d(2026, 12, 21, 10, 30));
});

test("valutaSla distingue presa in tempo e presa scaduta", () => {
  const creato = new Date(d(2026, 11, 18, 9)).toISOString();
  const presoOk = new Date(d(2026, 11, 18, 9, 30)).toISOString();
  const presoKo = new Date(d(2026, 11, 19, 12)).toISOString();

  const ok = valutaSla(
    { id: "1", priorita: "ALTA", stato: "IN_CORSO", creatoIl: creato, presoIl: presoOk, chiusoIl: null },
    CFG,
    d(2026, 11, 18, 10)
  );
  assert.equal(ok?.presaEntro, true);
  assert.equal(ok?.presaMinuti, 30);

  const ko = valutaSla(
    { id: "2", priorita: "ALTA", stato: "IN_CORSO", creatoIl: creato, presoIl: presoKo, chiusoIl: null },
    CFG,
    d(2026, 11, 19, 13)
  );
  assert.equal(ko?.presaEntro, false);
});

test("un ticket ancora aperto oltre la scadenza risulta scaduto", () => {
  const creato = new Date(d(2026, 11, 18, 9)).toISOString();
  const esito = valutaSla(
    { id: "3", priorita: "ALTA", stato: "NUOVO", creatoIl: creato, presoIl: null, chiusoIl: null },
    CFG,
    d(2026, 11, 18, 12)
  );
  assert.equal(esito?.presaScaduta, true);
  assert.equal(esito?.presaEntro, null);
});
