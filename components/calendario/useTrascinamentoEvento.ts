"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { EventoCalendario } from "@/lib/types";
import {
  calcolaRidimensionamento,
  calcolaSpostamento,
  inizioFineEvento,
  indiceGiornoDaX,
  limitiDaGiorni,
  snapDeltaPx,
  type LimitiGiorni,
} from "@/lib/calendario-griglia";

// ===========================================================================
// State machine del trascinamento sulla griglia oraria.
//
// Regole:
// - il PATCH parte SOLO al pointerup, mai durante il move: una richiesta per
//   gesto, e annullare (Escape, pointercancel, blur) non scrive nulla;
// - la soglia di 4px distingue il click dal drag: senza soglia ogni tap
//   sposterebbe l'evento di zero minuti e sopprimerebbe l'apertura del
//   popover;
// - i rettangoli delle colonne sono fotografati al pointerdown: cambiarli a
//   ogni move costringerebbe a riflowmare il layout dentro il gesto;
// - il chip ha touch-action: none, quindi il browser non prova a scorrere la
//   pagina mentre si trascina un evento. La griglia resta scorrevole negli
//   spazi vuoti e nella gutter.
// ===========================================================================

export type ModoDrag = "sposta" | "ridimensiona";

export interface DragAttivo {
  eventoId: string;
  modo: ModoDrag;
  /** Colonna da cui e' partito il gesto. */
  indicePartenza: number;
  /** Colonna di destinazione (assoluta nell'array giorni). */
  indiceGiorno: number;
  inizio: string;
  fine: string;
}

interface DragInterno {
  evento: EventoCalendario;
  modo: ModoDrag;
  inizio0: string;
  fine0: string;
  startX: number;
  startY: number;
  pointerId: number;
  target: HTMLElement;
  indicePartenza: number;
  rects: { left: number; right: number }[];
  limiti: LimitiGiorni;
  armato: boolean;
}

interface Opzioni {
  contenitoreRef: RefObject<HTMLElement | null>;
  giorni: Date[];
  pxPerOra: number;
  onCommit: (
    evento: EventoCalendario,
    inizio: string,
    fine: string,
    modo: ModoDrag
  ) => void;
}

const SOGLIA_PX = 4;
const SOGLIA_CLICK_MS = 250;

export function useTrascinamentoEvento({
  contenitoreRef,
  giorni,
  pxPerOra,
  onCommit,
}: Opzioni) {
  const [drag, setDrag] = useState<DragAttivo | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const stato = useRef<DragInterno | null>(null);
  const corrente = useRef<DragAttivo | null>(null);
  const ultimoDrag = useRef(0);

  // I listener vengono montati una volta per gesto e devono leggere i valori
  // più recenti senza ri-attaccarsi a ogni render.
  const giorniRef = useRef(giorni);
  giorniRef.current = giorni;
  const pxRef = useRef(pxPerOra);
  pxRef.current = pxPerOra;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!inCorso) return;

    const concludi = () => {
      const s = stato.current;
      if (s) {
        try {
          if (s.target.hasPointerCapture(s.pointerId)) {
            s.target.releasePointerCapture(s.pointerId);
          }
        } catch {
          // Il puntatore può essere già stato rilasciato dal browser.
        }
      }
      stato.current = null;
      corrente.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      setInCorso(false);
    };

    const muovi = (e: PointerEvent) => {
      const s = stato.current;
      if (!s) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      if (!s.armato) {
        if (Math.abs(dx) < SOGLIA_PX && Math.abs(dy) < SOGLIA_PX) return;
        s.armato = true;
        // Solo dopo l'attivazione: selezionare il testo mentre si prova a
        // scorrere la pagina è fastidioso e non reversibile a gesto finito.
        document.body.style.userSelect = "none";
      }

      e.preventDefault();

      const deltaMinuti = snapDeltaPx(dy, pxRef.current);
      const indice =
        s.modo === "sposta"
          ? Math.max(
              0,
              Math.min(
                giorniRef.current.length - 1,
                indiceGiornoDaX(e.clientX, s.rects)
              )
            )
          : s.indicePartenza;

      let inizio = s.inizio0;
      let fine = s.fine0;

      if (s.modo === "sposta") {
        const range = calcolaSpostamento({
          inizio0: s.inizio0,
          fine0: s.fine0,
          deltaMinuti,
          deltaGiorni: indice - s.indicePartenza,
          limiteInizio: s.limiti.inizio,
          limiteFine: s.limiti.fine,
        });
        inizio = range.inizio;
        fine = range.fine;
      } else {
        fine = calcolaRidimensionamento({
          inizio: s.inizio0,
          fine0: s.fine0,
          deltaMinuti,
          limiteFine: s.limiti.fine,
        }).fine;
      }

      const prossimo: DragAttivo = {
        eventoId: s.evento.id,
        modo: s.modo,
        indicePartenza: s.indicePartenza,
        indiceGiorno: indice,
        inizio,
        fine,
      };
      corrente.current = prossimo;
      setDrag(prossimo);
    };

    const rilascia = () => {
      const s = stato.current;
      if (!s) return;
      const d = corrente.current;
      if (
        s.armato &&
        d &&
        (d.inizio !== s.inizio0 || d.fine !== s.fine0)
      ) {
        // Il click che il browser emette subito dopo il pointerup non deve
        // riaprire il popover: `daIgnorareClick` consulta questo timestamp.
        ultimoDrag.current = Date.now();
        onCommitRef.current(s.evento, d.inizio, d.fine, s.modo);
      }
      concludi();
    };

    const annulla = () => concludi();

    const tasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") annulla();
    };

    window.addEventListener("pointermove", muovi, { passive: false });
    window.addEventListener("pointerup", rilascia);
    window.addEventListener("pointercancel", annulla);
    window.addEventListener("keydown", tasto);
    window.addEventListener("blur", annulla);

    return () => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", rilascia);
      window.removeEventListener("pointercancel", annulla);
      window.removeEventListener("keydown", tasto);
      window.removeEventListener("blur", annulla);
      // Sicurezza per lo smontaggio a gesto in corso: senza questo, se la
      // vista cambia durante un drag il body resterebbe non selezionabile.
      document.body.style.userSelect = "";
    };
  }, [inCorso]);

  const inizia = useCallback(
    (
      ev: ReactPointerEvent<HTMLElement>,
      evento: EventoCalendario,
      modo: ModoDrag,
      indicePartenza: number
    ) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;

      const range = inizioFineEvento(evento);
      if (!range) return;

      const radice = contenitoreRef.current;
      if (!radice) return;

      const rects = Array.from(
        radice.querySelectorAll<HTMLElement>("[data-colonna]")
      ).map((nodo) => {
        const r = nodo.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      if (rects.length === 0) return;

      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch {
        // Safari può rifiutare la cattura su alcuni elementi: i listener su
        // window bastano comunque a seguire il puntatore.
      }

      stato.current = {
        evento,
        modo,
        inizio0: range.inizio,
        fine0: range.fine,
        startX: ev.clientX,
        startY: ev.clientY,
        pointerId: ev.pointerId,
        target: ev.currentTarget,
        indicePartenza,
        rects,
        limiti: limitiDaGiorni(giorniRef.current),
        armato: false,
      };
      corrente.current = null;
      setDrag(null);
      setInCorso(true);
      ev.stopPropagation();
    },
    [contenitoreRef]
  );

  // Un drag appena concluso emette anche un click: va ignorato, altrimenti
  // dopo ogni spostamento si apre l'editor.
  const daIgnorareClick = useCallback(
    () => Date.now() - ultimoDrag.current < SOGLIA_CLICK_MS,
    []
  );

  return { drag, inizia, daIgnorareClick };
}
