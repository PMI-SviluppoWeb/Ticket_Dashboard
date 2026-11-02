"use client";

import type { Etichetta, OrigineEvento } from "@/lib/types";
import { ORIGINE_LABELS, ORIGINE_STYLES } from "@/lib/calendario";
import { CheckIcon, LayersIcon } from "@/components/icons";
import MiniMese from "./MiniMese";
import FiltriAvanzati, { type FiltriAvanzatiProps } from "./FiltriAvanzati";

const ORIGINI = Object.keys(ORIGINE_LABELS) as OrigineEvento[];

function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return "?";
  return parti
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export interface PannelloCalendarioProps {
  riferimento: Date;
  oggiChiave: string;
  giorniConEventi: Set<string>;
  onSelezionaGiorno: (giorno: Date) => void;

  originiAttive: Set<OrigineEvento>;
  conteggioOrigini: Record<OrigineEvento, number>;
  onToggleOrigine: (origine: OrigineEvento) => void;

  etichette: Etichetta[];
  etichetteAttive: Set<string>;
  conteggioEtichette: Map<string, number>;
  onToggleEtichetta: (id: string) => void;
  onGestisciEtichette: () => void;

  team: string[];
  personaFiltro: string;
  operatoreCorrente: string | null;
  onPersona: (nome: string) => void;

  showFiltri: boolean;
  onToggleFiltri: () => void;
  filtriAvanzati: FiltriAvanzatiProps;
}

// Pannello sinistro della reference: mini-mese, agende (origini), etichette,
// squadra e filtri rari. I tre gruppi filtrano in modo diverso:
// origini/etichette/persona sono client-side e istantanei, progetto/cliente/
// stato passano dal server e stanno nel blocco richiudibile in fondo.
export default function PannelloCalendario({
  riferimento,
  oggiChiave,
  giorniConEventi,
  onSelezionaGiorno,
  originiAttive,
  conteggioOrigini,
  onToggleOrigine,
  etichette,
  etichetteAttive,
  conteggioEtichette,
  onToggleEtichetta,
  onGestisciEtichette,
  team,
  personaFiltro,
  operatoreCorrente,
  onPersona,
  showFiltri,
  onToggleFiltri,
  filtriAvanzati,
}: PannelloCalendarioProps) {
  const soloMiei =
    Boolean(operatoreCorrente) &&
    personaFiltro.toLowerCase() === (operatoreCorrente ?? "").toLowerCase();

  return (
    <div className="flex flex-col gap-4 rounded-card border border-crema-contorno bg-white p-4">
      <MiniMese
        riferimento={riferimento}
        oggiChiave={oggiChiave}
        giorniConEventi={giorniConEventi}
        onSeleziona={onSelezionaGiorno}
      />

      <div className="border-t border-crema-bordo pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
          Agende
        </p>
        <div className="space-y-0.5">
          {ORIGINI.map((origine) => {
            const attivo = originiAttive.has(origine);
            return (
              <button
                key={origine}
                type="button"
                role="checkbox"
                aria-checked={attivo}
                onClick={() => onToggleOrigine(origine)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-control px-1.5 py-1.5 text-left transition-colors duration-200 hover:bg-crema-scuro focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                    attivo
                      ? "border-inchiostro bg-inchiostro text-white"
                      : "border-crema-contorno bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {attivo && <CheckIcon className="h-2.5 w-3.5" />}
                </span>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${ORIGINE_STYLES[origine]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-inchiostro">
                  {ORIGINE_LABELS[origine]}
                </span>
                <span className="text-[10px] font-medium tabular-nums text-caldo-testo">
                  {conteggioOrigini[origine] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-crema-bordo pt-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
            Etichette
          </span>
          <button
            type="button"
            onClick={onGestisciEtichette}
            className="flex cursor-pointer items-center gap-1 text-[10px] font-semibold text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            <LayersIcon className="h-3 w-3" />
            Gestisci
          </button>
        </div>

        {etichette.length === 0 ? (
          <p className="py-1 text-[11px] text-caldo-testo">
            Nessuna etichetta creata.
          </p>
        ) : (
          <div className="max-h-44 space-y-0.5 overflow-y-auto pr-1">
            {etichette.map((et) => {
              const attiva = etichetteAttive.has(et.id);
              return (
                <button
                  key={et.id}
                  type="button"
                  role="checkbox"
                  aria-checked={etichetteAttive.size === 0 || etichetteAttive.has(et.id)}
                  onClick={() => onToggleEtichetta(et.id)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-200 hover:bg-crema-scuro focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro ${
                    etichetteAttive.size > 0 && !etichetteAttive.has(et.id)
                      ? "opacity-45"
                      : ""
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      etichetteAttive.size === 0 || attiva
                        ? "border-inchiostro bg-inchiostro text-white"
                        : "border-crema-contorno bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {(etichetteAttive.size === 0 || attiva) && (
                      <CheckIcon className="h-2.5 w-3.5" />
                    )}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: et.colore }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-inchiostro">
                    {et.nome}
                  </span>
                  <span className="text-[10px] font-medium tabular-nums text-caldo-testo">
                    {conteggioEtichette.get(et.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-crema-bordo pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
          Team
        </p>
        {team.length === 0 ? (
          <p className="text-[11px] text-caldo-testo">
            Nessun assegnatario nel periodo.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {team.slice(0, 8).map((nome) => {
                const attivo =
                  personaFiltro.toLowerCase() === nome.toLowerCase();
                return (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => onPersona(nome)}
                    aria-pressed={attivo}
                    title={nome}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border text-[10px] font-bold uppercase transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro ${
                      attivo
                        ? "border-inchiostro bg-inchiostro text-white"
                        : "border-crema-contorno bg-crema-scuro text-inchiostro hover:border-inchiostro/30"
                    }`}
                  >
                    {iniziali(nome)}
                  </button>
                );
              })}
            </div>
            {operatoreCorrente && (
              <button
                type="button"
                onClick={() => onPersona(operatoreCorrente)}
                aria-pressed={soloMiei}
                className={`mt-2 w-full cursor-pointer rounded-control border px-2 py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
                  soloMiei
                    ? "border-inchiostro bg-inchiostro text-white"
                    : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                }`}
              >
                Solo i miei eventi
              </button>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleFiltri}
        aria-expanded={showFiltri}
        className="flex cursor-pointer items-center justify-between rounded-control border border-crema-contorno bg-white px-2 py-1.5 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
      >
        Filtri avanzati
        <span className="text-[10px]">{showFiltri ? "−" : "+"}</span>
      </button>
      {showFiltri && <FiltriAvanzati {...filtriAvanzati} />}
    </div>
  );
}
