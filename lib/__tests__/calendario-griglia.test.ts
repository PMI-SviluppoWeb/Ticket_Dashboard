import assert from "node:assert/strict";
import test from "node:test";
import type { EventoCalendario } from "../types";
import {
  calcolaRidimensionamento,
  calcolaSpostamento,
  diffMinuti,
  impacchetta,
  indiceGiornoDaX,
  inizioFineEvento,
  limitiDaGiorni,
  minutiDelGiorno,
  segmentiDelGiorno,
  spostaDataOra,
} from "../calendario-griglia";

// La griglia non tocca il DOM: qui si verificano solo i conti che decidono
// posizione, altezza e risultato di un drag. Sono i punti in cui un errore
// non si vede subito — un blocco di mezz'ora sbagliato sembra "strano" ma
// nessuno sa dire perché.

function evento(
  id: string,
  inizio: string | null,
  fine: string | null
): EventoCalendario {
  return {
    id,
    titolo: id,
    data_inizio: inizio,
    data_scadenza: fine,
  } as unknown as EventoCalendario;
}

// ---------------------------------------------------------------------------
// Aritmetica naive
// ---------------------------------------------------------------------------

test("minutiDelGiorno legge l'ora di parete", () => {
  assert.equal(minutiDelGiorno("2026-10-29T09:30"), 570);
  assert.equal(minutiDelGiorno("2026-10-29T00:00"), 0);
  assert.equal(minutiDelGiorno("non-una-data"), null);
  assert.equal(minutiDelGiorno(null), null);
});

test("spostaDataOra attraversa la mezzanotte senza fusi orari", () => {
  assert.equal(spostaDataOra("2026-10-29T23:30", 60), "2026-10-30T00:30");
  assert.equal(spostaDataOra("2026-10-29T00:15", -30), "2026-10-28T23:45");
  // Giornata di cambio ora: resta di 1440 minuti perché il conto è naive.
  assert.equal(diffMinuti("2026-03-30T00:00", "2026-03-29T00:00"), 1440);
  assert.equal(diffMinuti("2026-10-26T00:00", "2026-10-25T00:00"), 1440);
});

test("inizioFineEvento deriva un'ora quando data_inizio manca", () => {
  const range = inizioFineEvento(evento("a", null, "2026-10-29T10:00"));
  assert.deepEqual(range, {
    inizio: "2026-10-29T09:00",
    fine: "2026-10-29T10:00",
  });
});

test("inizioFineEvento ignora un inizio successivo alla fine", () => {
  const range = inizioFineEvento(
    evento("a", "2026-10-29T11:00", "2026-10-29T10:00")
  );
  assert.deepEqual(range, {
    inizio: "2026-10-29T09:00",
    fine: "2026-10-29T10:00",
  });
});

// ---------------------------------------------------------------------------
// Clipping per giorno
// ---------------------------------------------------------------------------

test("un evento iniziato il giorno prima viene tagliato alle 00:00", () => {
  const [segmento] = segmentiDelGiorno(
    [evento("a", "2026-10-28T22:00", "2026-10-29T02:00")],
    "2026-10-29"
  );
  assert.equal(segmento.inizioMin, 0);
  assert.equal(segmento.fineMin, 120);
  assert.equal(segmento.continuaPrima, true);
  assert.equal(segmento.continuaDopo, false);
});

test("un evento che finisce a mezzanotte chiude la giornata a 1440", () => {
  const [segmento] = segmentiDelGiorno(
    [evento("a", "2026-10-29T22:00", "2026-10-30T00:00")],
    "2026-10-29"
  );
  assert.equal(segmento.inizioMin, 1320);
  assert.equal(segmento.fineMin, 1440);
  // Finire esattamente a mezzanotte non significa sconfinare nel giorno dopo:
  // il segmento del 30 sarebbe di lunghezza zero e viene scartato.
  assert.equal(segmento.continuaDopo, false);
});

test("un evento oltre la mezzanotte segnala continuaDopo", () => {
  const [segmento] = segmentiDelGiorno(
    [evento("a", "2026-10-29T22:00", "2026-10-30T00:30")],
    "2026-10-29"
  );
  assert.equal(segmento.fineMin, 1440);
  assert.equal(segmento.continuaDopo, true);
});

test("un evento senza inizio occupa un'ora prima della scadenza", () => {
  const [segmento] = segmentiDelGiorno(
    [evento("a", null, "2026-10-29T15:00")],
    "2026-10-29"
  );
  assert.equal(segmento.inizioMin, 840);
  assert.equal(segmento.fineMin, 900);
});

test("un evento di 24 ore finisce nella corsia tutto-il-giorno", () => {
  const [segmento] = segmentiDelGiorno(
    [evento("a", "2026-10-29T09:00", "2026-10-30T09:00")],
    "2026-10-29"
  );
  assert.equal(segmento.tuttoIlGiorno, true);
});

test("un evento fuori dalla giornata non produce segmenti", () => {
  assert.deepEqual(
    segmentiDelGiorno(
      [evento("a", "2026-10-30T09:00", "2026-10-30T10:00")],
      "2026-10-29"
    ),
    []
  );
});

// ---------------------------------------------------------------------------
// Sovrapposizioni
// ---------------------------------------------------------------------------

test("due eventi sovrapposti occupano due colonne", () => {
  const posizionati = impacchetta(
    segmentiDelGiorno(
      [
        evento("a", "2026-10-29T09:00", "2026-10-29T10:00"),
        evento("b", "2026-10-29T09:30", "2026-10-29T10:30"),
      ],
      "2026-10-29"
    )
  );
  assert.deepEqual(
    posizionati.map((p) => [p.evento.id, p.colonna, p.colonne]),
    [
      ["a", 0, 2],
      ["b", 1, 2],
    ]
  );
});

test("due eventi consecutivi restano entrambi a larghezza piena", () => {
  const posizionati = impacchetta(
    segmentiDelGiorno(
      [
        evento("a", "2026-10-29T09:00", "2026-10-29T10:00"),
        evento("b", "2026-10-29T10:00", "2026-10-29T11:00"),
      ],
      "2026-10-29"
    )
  );
  assert.deepEqual(
    posizionati.map((p) => [p.evento.id, p.colonna, p.colonne]),
    [
      ["a", 0, 1],
      ["b", 0, 1],
    ]
  );
});

test("tre eventi sovrapposti aprono tre colonne", () => {
  const posizionati = impacchetta(
    segmentiDelGiorno(
      [
        evento("a", "2026-10-29T09:00", "2026-10-29T12:00"),
        evento("b", "2026-10-29T09:30", "2026-10-29T11:00"),
        evento("c", "2026-10-29T10:00", "2026-10-29T10:30"),
      ],
      "2026-10-29"
    )
  );
  assert.equal(Math.max(...posizionati.map((p) => p.colonne)), 3);
  assert.equal(new Set(posizionati.map((p) => p.colonna)).size, 3);
});

// ---------------------------------------------------------------------------
// Drag e resize
// ---------------------------------------------------------------------------

const limiti = limitiDaGiorni([
  new Date(2026, 9, 26),
  new Date(2026, 10, 1),
]);

test("lo spostamento conserva la durata e cambia giorno", () => {
  const spostato = calcolaSpostamento({
    inizio0: "2026-10-29T09:00",
    fine0: "2026-10-29T10:30",
    deltaMinuti: 30,
    deltaGiorni: 1,
    limiteInizio: limiti.inizio,
    limiteFine: limiti.fine,
  });
  assert.deepEqual(spostato, {
    inizio: "2026-10-30T09:30",
    fine: "2026-10-30T11:00",
  });
});

test("lo spostamento non esce dalla finestra visibile", () => {
  const spostato = calcolaSpostamento({
    inizio0: "2026-10-26T00:15",
    fine0: "2026-10-26T01:15",
    deltaMinuti: -120,
    deltaGiorni: 0,
    limiteInizio: limiti.inizio,
    limiteFine: limiti.fine,
  });
  assert.equal(spostato.inizio, limiti.inizio);
  assert.equal(diffMinuti(spostato.fine, spostato.inizio), 60);
});

test("il ridimensionamento rispetta il minimo di 15 minuti", () => {
  const ridotto = calcolaRidimensionamento({
    inizio: "2026-10-29T09:00",
    fine0: "2026-10-29T10:00",
    deltaMinuti: -120,
    limiteFine: limiti.fine,
  });
  assert.equal(ridotto.fine, "2026-10-29T09:15");
});

test("il ridimensionamento si ferma a fine finestra", () => {
  const esteso = calcolaRidimensionamento({
    inizio: "2026-11-01T22:00",
    fine0: "2026-11-01T23:00",
    deltaMinuti: 180,
    limiteFine: limiti.fine,
  });
  assert.equal(esteso.fine, limiti.fine);
});

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

test("indiceGiornoDaX sceglie la colonna sotto il pointer", () => {
  const colonne = [
    { left: 0, right: 100 },
    { left: 100, right: 200 },
    { left: 200, right: 300 },
  ];
  assert.equal(indiceGiornoDaX(-10, colonne), 0);
  assert.equal(indiceGiornoDaX(150, colonne), 1);
  assert.equal(indiceGiornoDaX(999, colonne), 2);
  assert.equal(indiceGiornoDaX(50, []), 0);
});
