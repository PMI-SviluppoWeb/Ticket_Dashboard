"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { EventoCalendario } from "@/lib/types";
import type { EventoPosizionato } from "@/lib/calendario-griglia";
import EventoGriglia from "./EventoGriglia";
import LineaOraCorrente from "./LineaOraCorrente";
import type { ModoDrag } from "./useTrascinamentoEvento";

export interface FantasmaDrag {
  top: number;
  altezza: number;
  titolo: string;
  orario: string;
}

export interface ColonnaGiornoProps {
  chiave: string;
  indice: number;
  oggi: boolean;
  weekend: boolean;
  eventi: EventoPosizionato[];
  fantasma: FantasmaDrag | null;
  pxPerOra: number;
  dragAttivoId: string | null;
  onSlotClick: (
    chiave: string,
    minuti: number,
    ancora: { x: number; y: number }
  ) => void;
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

// Colonna di un giorno: gestisce il click su uno slot vuoto e ospita i blocchi
// posizionati. La larghezza minima tiene la settimana leggibile anche quando
// la pagina è stretta: sotto quella soglia la griglia scorre in orizzontale
// invece di comprimere i titoli a una lettera.
export default function ColonnaGiorno({
  chiave,
  indice,
  oggi,
  weekend,
  eventi,
  fantasma,
  pxPerOra,
  dragAttivoId,
  onSlotClick,
  onApri,
  onTrascina,
  daIgnorareClick,
  onNudge,
}: ColonnaGiornoProps) {
  const clickSlot = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Il click su un evento o sulla maniglia non deve creare un evento nuovo.
    if (target.closest("[data-evento]")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(0, e.clientY - rect.top);
    const minuti = Math.min(
      // 23:30 è l'ultimo slot creabile: alle 23:59 non resterebbe spazio per
      // una durata sensata dentro lo stesso giorno.
      1410,
      Math.floor((y / pxPerOra) * 60 / 30) * 30
    );

    onSlotClick(chiave, minuti, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      data-colonna={indice}
      data-giorno={chiave}
      onClick={clickSlot}
      className={`relative min-w-[92px] flex-1 cursor-pointer border-l border-crema-bordo ${
        oggi
          ? "bg-lime/[0.07]"
          : weekend
            ? "bg-crema-scuro/40"
            : ""
      }`}
    >
      {eventi.map((pos) => (
        <EventoGriglia
          key={pos.evento.id}
          pos={pos}
          indiceGiorno={indice}
          pxPerOra={pxPerOra}
          inEvidenza={dragAttivoId === pos.evento.id}
          onApri={onApri}
          onTrascina={onTrascina}
          daIgnorareClick={daIgnorareClick}
          onNudge={onNudge}
        />
      ))}

      {fantasma && (
        <div
          className="pointer-events-none absolute z-30 rounded-control border border-dashed border-inchiostro bg-inchiostro/10 px-2 py-1 text-[10px] font-semibold text-inchiostro"
          style={{
            top: fantasma.top,
            height: Math.max(24, fantasma.altezza),
            left: 2,
            right: 2,
          }}
        >
          <span className="block truncate">{fantasma.titolo || "Nuovo evento"}</span>
          <span className="block truncate font-medium tabular-nums opacity-70">
            {fantasma.orario}
          </span>
        </div>
      )}

      {oggi && <LineaOraCorrente pxPerOra={pxPerOra} />}
    </div>
  );
}
