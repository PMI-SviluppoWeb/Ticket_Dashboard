"use client";

import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { EventoCalendario, OrigineEvento } from "@/lib/types";
import { ORIGINE_STYLES, origineEvento } from "@/lib/calendario";
import {
  altezzaPx,
  topPx,
  type EventoPosizionato,
} from "@/lib/calendario-griglia";
import type { ModoDrag } from "./useTrascinamentoEvento";

// Barra verticale a sinistra del blocco: usa il TESTO della famiglia
// semantica (tinta satura), non il fondo, che su un fondo già colorato
// sparirebbe.
const BARRA: Record<OrigineEvento, string> = {
  progetto: "bg-stato-info-testo",
  cliente: "bg-stato-ok-testo",
  generico: "bg-stato-neutro-testo",
};

const GOOGLE_DOT: Record<string, string> = {
  SINCRONIZZATO: "bg-stato-ok-testo",
  ERRORE: "bg-stato-urgenza-testo",
  PENDENTE: "bg-stato-attesa-testo",
  DA_CANCELLARE: "bg-stato-attesa-testo",
};

function ora(naive: string): string {
  return naive.slice(11, 16);
}

export interface EventoGrigliaProps {
  pos: EventoPosizionato;
  indiceGiorno: number;
  pxPerOra: number;
  /** true se questo è il blocco che si sta trascinando. */
  inEvidenza: boolean;
  onApri: (evento: EventoCalendario, ancora: { x: number; y: number }) => void;
  onTrascina: (
    ev: ReactPointerEvent<HTMLElement>,
    evento: EventoCalendario,
    modo: ModoDrag,
    indiceGiorno: number
  ) => void;
  daIgnorareClick: () => boolean;
  onNudge?: (
    evento: EventoCalendario,
    deltaMinuti: number,
    deltaGiorni: number,
    ridimensiona: boolean
  ) => void;
}

// Un blocco evento posizionato sulla griglia. Fuori dal drag non cambia mai:
// il memo evita che un pointermove (che aggiorna solo il ghost) ridisegni
// tutti gli eventi della settimana.
function EventoGriglia({
  pos,
  indiceGiorno,
  pxPerOra,
  inEvidenza,
  onApri,
  onTrascina,
  daIgnorareClick,
  onNudge,
}: EventoGrigliaProps) {
  const { evento } = pos;
  const origine = origineEvento(evento);
  const etichette = evento.etichette ?? [];

  const altezza = altezzaPx(pos.fineMin - pos.inizioMin, pxPerOra);
  const compatta = altezza < 42;
  const larghezza = 100 / pos.colonne;
  const orario = `${ora(pos.inizio)}–${ora(pos.fine)}`;

  const stile = {
    top: topPx(pos.inizioMin, pxPerOra),
    height: altezza,
    left: `calc(${(pos.colonna / pos.colonne) * 100}% + 2px)`,
    width: `calc(${larghezza}% - 4px)`,
    // Il foglio globale applica `button:active { transform: scale(.97) }`;
    // durante il drag il rect cambierebbe sotto il puntatore. Lo stile inline
    // vince sulla regola d'autore.
    transform: "none",
    touchAction: "none" as const,
  };

  const classi = [
    "absolute z-10 overflow-hidden rounded-control border text-left transition-opacity",
    ORIGINE_STYLES[origine],
    inEvidenza ? "opacity-40 ring-2 ring-inchiostro" : "hover:brightness-[0.99]",
    pos.continuaPrima ? "rounded-t-none" : "",
    pos.continuaDopo ? "rounded-b-none" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const descrizione = `${evento.titolo}, ${orario}${
    evento.google_stato ? " · sincronizzato con Google" : ""
  }`;

  return (
    <button
      type="button"
      data-evento={evento.id}
      onClick={(e) => {
        if (daIgnorareClick()) {
          e.stopPropagation();
          return;
        }
        onApri(evento, { x: e.clientX, y: e.clientY });
      }}
      onPointerDown={(ev) => onTrascina(ev, evento, "sposta", indiceGiorno)}
      onKeyDown={(e) => {
        if (!e.altKey) return;
        const verticale = e.key === "ArrowUp" || e.key === "ArrowDown";
        const orizzontale = e.key === "ArrowLeft" || e.key === "ArrowRight";
        if (!verticale && !orizzontale) return;
        e.preventDefault();
        if (e.shiftKey && verticale) {
          onNudge?.(evento, e.key === "ArrowUp" ? -30 : 30, 0, true);
          return;
        }
        if (orizzontale) {
          onNudge?.(evento, 0, e.key === "ArrowLeft" ? -1 : 1, false);
          return;
        }
        onNudge?.(evento, e.key === "ArrowUp" ? -30 : 30, 0, false);
      }}
      className={classi}
      style={stile}
      title={`${evento.titolo} — ${orario}. Trascina per spostare, tira il bordo inferiore per allungare.`}
      aria-label={descrizione}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${BARRA[origine]}`}
        aria-hidden="true"
      />

      <span className="pointer-events-none block pl-2 pr-1.5 pt-0.5">
        <span className="block truncate text-[11px] font-semibold leading-tight">
          {pos.continuaPrima ? "↳ " : ""}
          {evento.titolo}
        </span>
        {!compatta && (
          <span className="mt-0.5 block truncate text-[10px] font-medium tabular-nums opacity-80">
            {orario}
          </span>
        )}
      </span>

      {evento.google_stato && GOOGLE_DOT[evento.google_stato] && (
        <span
          className={`pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
            GOOGLE_DOT[evento.google_stato]
          }`}
          aria-hidden="true"
        />
      )}

      {!compatta && etichette.length > 0 && (
        <span className="pointer-events-none absolute bottom-1 left-2 flex gap-0.5">
          {etichette.slice(0, 3).map((et) => (
            <span
              key={et.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: et.colore }}
            />
          ))}
        </span>
      )}

      {!compatta && (
        // Maniglia di ridimensionamento. Non è un controllo separato nel
        // focus: la stessa modifica si ottiene con Alt+Shift+↑/↓.
        <span
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          style={{ touchAction: "none" }}
          aria-hidden="true"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            onTrascina(ev, evento, "ridimensiona", indiceGiorno);
          }}
        />
      )}
    </button>
  );
}

export default memo(EventoGriglia);
