"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { chiaveGiorno, grigliaMese } from "@/lib/calendario";

const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];

export interface MiniMeseProps {
  riferimento: Date;
  oggiChiave: string;
  giorniConEventi: Set<string>;
  onSeleziona: (giorno: Date) => void;
}

// Mini-calendario del pannello: stessa griglia a 42 celle della vista Mese,
// così i due non possono divergere sulle settimane a cavallo di due mesi.
export default function MiniMese({
  riferimento,
  oggiChiave,
  giorniConEventi,
  onSeleziona,
}: MiniMeseProps) {
  const celle = grigliaMese(riferimento);
  const mese = riferimento.getMonth();
  const selezionato = chiaveGiorno(riferimento);

  const meseLabel = riferimento.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const cambiaMese = (passo: number) => {
    onSeleziona(
      new Date(riferimento.getFullYear(), riferimento.getMonth() + passo, 1)
    );
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold capitalize text-inchiostro">
          {meseLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => cambiaMese(-1)}
            aria-label="Mese precedente"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <ChevronLeftIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => cambiaMese(1)}
            aria-label="Mese successivo"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <ChevronRightIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {GIORNI.map((g, i) => (
          <span
            key={`${g}-${i}`}
            className="flex h-5 items-center justify-center text-[9px] font-semibold uppercase text-caldo-testo"
            aria-hidden="true"
          >
            {g}
          </span>
        ))}
        {celle.map((cella) => {
          const chiave = chiaveGiorno(cella);
          const fuoriMese = cella.getMonth() !== mese;
          const oggi = chiave === oggiChiave;
          const attivo = chiave === selezionato;
          const conEventi = giorniConEventi.has(chiave);

          return (
            <button
              key={chiave}
              type="button"
              onClick={() => onSeleziona(cella)}
              aria-label={cella.toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              aria-pressed={attivo}
              className={`relative mx-auto flex h-7 w-7 cursor-pointer flex-col items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro ${
                attivo
                  ? "bg-inchiostro text-white"
                  : oggi
                    ? "bg-lime text-lime-testo"
                    : fuoriMese
                      ? "text-caldo-testo/50 hover:bg-crema-scuro"
                      : "text-inchiostro hover:bg-crema-scuro"
              }`}
            >
              {cella.getDate()}
              {conEventi && (
                <span
                  className={`absolute bottom-[2px] h-1 w-1 rounded-full ${
                    attivo ? "bg-white/70" : "bg-inchiostro/40"
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
