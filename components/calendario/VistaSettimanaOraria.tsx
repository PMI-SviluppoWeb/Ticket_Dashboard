"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EventoCalendario } from "@/lib/types";
import {
  ORIGINE_STYLES,
  chiaveGiorno,
  origineEvento,
  pad,
} from "@/lib/calendario";
import {
  ORA_SCROLL_INIZIALE,
  PX_PER_ORA,
  altezzaPx,
  diffMinuti,
  etichettaGmt,
  eventiPerGiorno,
  impacchetta,
  minutiDelGiorno,
  topPx,
  type EventoPosizionato,
  type SegmentoGiorno,
} from "@/lib/calendario-griglia";
import ColonnaGiorno, { type FantasmaDrag } from "./ColonnaGiorno";
import { useTrascinamentoEvento, type ModoDrag } from "./useTrascinamentoEvento";


const ORE = Array.from({ length: 24 }, (_, i) => i);

function ora(naive: string): string {
  return naive.slice(11, 16);
}

interface ColonnaCalcolata {
  chiave: string;
  giorno: Date;
  posizionati: EventoPosizionato[];
  tuttoIlGiorno: SegmentoGiorno[];
}

export interface VistaSettimanaOrariaProps {
  giorni: Date[];
  oggiChiave: string;
  eventi: EventoCalendario[];
  pxPerOra?: number;
  onSlotClick: (
    chiave: string,
    minuti: number,
    ancora: { x: number; y: number }
  ) => void;
  onEventoClick: (evento: EventoCalendario, ancora: { x: number; y: number }) => void;
  onSpostaEvento?: (evento: EventoCalendario, inizio: string, fine: string) => void;
  onRidimensionaEvento?: (evento: EventoCalendario, fine: string) => void;
  onNudge?: (
    evento: EventoCalendario,
    deltaMinuti: number,
    deltaGiorni: number,
    ridimensiona: boolean
  ) => void;
  onSelezionaGiorno?: (chiave: string) => void;
}

// ===========================================================================
// Griglia oraria: intestazione giorni fissa, gutter di 56px con le ore,
// colonne giorno e blocchi posizionati in assoluto.
//
// Intestazione e corpo stanno dentro lo STESSO contenitore scorrevole: così
// lo scorrimento orizzontale del telefono non disallinea le due parti, e
// `sticky` tiene l'intestazione in cima durante lo scroll verticale.
// ===========================================================================
export default function VistaSettimanaOraria({
  giorni,
  oggiChiave,
  eventi,
  pxPerOra = PX_PER_ORA,
  onSlotClick,
  onEventoClick,
  onSpostaEvento,
  onRidimensionaEvento,
  onNudge,
  onSelezionaGiorno,
}: VistaSettimanaOrariaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ultimaVista = useRef("");

  const perGiorno = useMemo(
    () => eventiPerGiorno(eventi, giorni),
    [eventi, giorni]
  );

  const colonne = useMemo<ColonnaCalcolata[]>(
    () =>
      giorni.map((giorno) => {
        const chiave = chiaveGiorno(giorno);
        const segmenti = perGiorno.get(chiave) ?? [];
        return {
          chiave,
          giorno,
          posizionati: impacchetta(segmenti),
          tuttoIlGiorno: segmenti.filter((s) => s.tuttoIlGiorno),
        };
      }),
    [giorni, perGiorno]
  );

  const onCommit = useCallback(
    (evento: EventoCalendario, inizio: string, fine: string, modo: ModoDrag) => {
      if (modo === "sposta") onSpostaEvento?.(evento, inizio, fine);
      else onRidimensionaEvento?.(evento, fine);
    },
    [onSpostaEvento, onRidimensionaEvento]
  );

  const { drag, inizia, daIgnorareClick } = useTrascinamentoEvento({
    contenitoreRef: scrollRef,
    giorni,
    pxPerOra,
    onCommit,
  });

  const eventoInDrag = drag
    ? eventi.find((e) => e.id === drag.eventoId) ?? null
    : null;

  const haTuttoIlGiorno = colonne.some((c) => c.tuttoIlGiorno.length > 0);

  // Scroll iniziale: 7:00, o un'ora prima del primo evento se è più presto.
  // Si ripete solo quando cambia l'insieme di giorni visibile, non a ogni
  // aggiornamento della lista (es. dopo un salvataggio): altrimenti la
  // pagina salterebbe sotto le mani dell'utente.
  const chiaveVista = giorni.map(chiaveGiorno).join("|");
  const primoEvento = colonne.reduce<number | null>((min, c) => {
    for (const p of c.posizionati) {
      if (min === null || p.inizioMin < min) min = p.inizioMin;
    }
    return min;
  }, null);

  useEffect(() => {
    if (ultimaVista.current === chiaveVista) return;
    ultimaVista.current = chiaveVista;
    const el = scrollRef.current;
    if (!el) return;
    const base = ORA_SCROLL_INIZIALE * 60;
    const primo = primoEvento ?? base;
    el.scrollTop = topPx(Math.max(0, Math.min(base, primo - 60)), pxPerOra);
  }, [chiaveVista, primoEvento, pxPerOra]);

  const etichettaVista =
    giorni.length === 1
      ? "Calendario del giorno"
      : "Calendario settimanale";

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      role="region"
      aria-label={etichettaVista}
    >
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        <div className="relative">
          {/* Intestazione giorni */}
          <div className="sticky top-0 z-20 flex border-b border-crema-contorno bg-white">
            <div className="flex w-14 shrink-0 items-end justify-end border-r border-crema-bordo px-1.5 pb-1.5">
              <span className="text-[9px] font-medium tabular-nums text-caldo-testo">
                {etichettaGmt(giorni[0] ?? new Date())}
              </span>
            </div>
            {giorni.map((giorno) => {
              const chiave = chiaveGiorno(giorno);
              const oggi = chiave === oggiChiave;
              const weekend = giorno.getDay() === 0 || giorno.getDay() === 6;
              const sigla = giorno
                .toLocaleDateString("it-IT", { weekday: "long" })
                .slice(0, 3);
              const etichettaCompleta = giorno.toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              return (
                <div
                  key={chiave}
                  className={`flex min-w-[92px] flex-1 flex-col items-center gap-1 border-l border-crema-bordo py-1.5 ${
                    weekend ? "bg-crema-scuro/50" : ""
                  }`}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-caldo-testo">
                    {sigla}
                  </span>
                  {onSelezionaGiorno ? (
                    <button
                      type="button"
                      onClick={() => onSelezionaGiorno(chiave)}
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro ${
                        oggi
                          ? "bg-inchiostro text-white"
                          : "text-inchiostro hover:bg-crema-scuro"
                      }`}
                      aria-label={`Vai a ${etichettaCompleta}`}
                      aria-current={oggi ? "date" : undefined}
                    >
                      {giorno.getDate()}
                    </button>
                  ) : (
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        oggi ? "bg-inchiostro text-white" : "text-inchiostro"
                      }`}
                      aria-current={oggi ? "date" : undefined}
                    >
                      {giorno.getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Corsia tutto il giorno */}
          {haTuttoIlGiorno && (
            <div className="flex border-b border-crema-bordo bg-crema-scuro/30">
              <div className="flex w-14 shrink-0 items-start justify-end border-r border-crema-bordo px-1.5 py-1.5">
                <span className="text-[9px] font-semibold uppercase leading-tight text-caldo-testo">
                  Tutto
                </span>
              </div>
              {colonne.map((colonna) => (
                <div
                  key={colonna.chiave}
                  className="min-w-[92px] flex-1 space-y-0.5 border-l border-crema-bordo px-1 py-1"
                >
                  {colonna.tuttoIlGiorno.slice(0, 2).map((segmento) => (
                    <button
                      key={segmento.evento.id}
                      type="button"
                      onClick={(e) =>
                        onEventoClick(segmento.evento, {
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      className={`block w-full cursor-pointer truncate rounded-control border px-1.5 py-0.5 text-left text-[10px] font-medium ${
                        ORIGINE_STYLES[origineEvento(segmento.evento)]
                      }`}
                      title={segmento.evento.titolo}
                    >
                      {segmento.evento.titolo}
                    </button>
                  ))}
                  {colonna.tuttoIlGiorno.length > 2 && (
                    <span className="block text-[10px] font-medium text-caldo-testo">
                      +{colonna.tuttoIlGiorno.length - 2}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Corpo con ore e colonne */}
          <div
            className="relative flex"
            style={{ height: topPx(24 * 60, pxPerOra) }}
          >
            <div className="relative w-14 shrink-0 border-r border-crema-bordo">
              {ORE.map((h) => (
                <span
                  key={h}
                  className="absolute right-1.5 text-[10px] font-medium tabular-nums text-caldo-testo"
                  style={{ top: topPx(h * 60, pxPerOra) + 2 }}
                  aria-hidden="true"
                >
                  {pad(h)}:00
                </span>
              ))}
            </div>

            {colonne.map((colonna, indice) => {
              const fantasma: FantasmaDrag | null =
                drag && drag.indiceGiorno === indice
                  ? {
                      top: topPx(minutiDelGiorno(drag.inizio) ?? 0, pxPerOra),
                      altezza: altezzaPx(
                        diffMinuti(drag.fine, drag.inizio),
                        pxPerOra
                      ),
                      titolo: eventoInDrag?.titolo ?? "",
                      orario: `${ora(drag.inizio)}–${ora(drag.fine)}`,
                    }
                  : null;

              return (
                <ColonnaGiorno
                  key={colonna.chiave}
                  chiave={colonna.chiave}
                  indice={indice}
                  oggi={colonna.chiave === oggiChiave}
                  weekend={
                    colonna.giorno.getDay() === 0 ||
                    colonna.giorno.getDay() === 6
                  }
                  eventi={colonna.posizionati}
                  fantasma={fantasma}
                  pxPerOra={pxPerOra}
                  dragAttivoId={drag?.eventoId ?? null}
                  onSlotClick={onSlotClick}
                  onApri={onEventoClick}
                  onTrascina={inizia}
                  daIgnorareClick={daIgnorareClick}
                  onNudge={onNudge}
                />
              );
            })}

            {/* Linee delle ore e delle mezze ore, sopra le tinte delle
                colonne ma sotto i blocchi (z-10). */}
            <div
              className="pointer-events-none absolute inset-y-0 left-14 right-0 z-0"
              aria-hidden="true"
            >
              {ORE.map((h) => (
                <div
                  key={`h-${h}`}
                  className="absolute inset-x-0 border-t border-crema-bordo"
                  style={{ top: topPx(h * 60, pxPerOra) }}
                />
              ))}
              {ORE.map((h) => (
                <div
                  key={`m-${h}`}
                  className="absolute inset-x-0 border-t border-dashed border-crema-bordo/80"
                  style={{ top: topPx(h * 60 + 30, pxPerOra) }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
