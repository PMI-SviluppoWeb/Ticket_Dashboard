"use client";

import type { Cliente, ProgettoListRow, StatoAttivita } from "@/lib/types";
import { INPUT_CLASS, LABEL_CLASS } from "./stili";

const STATI: { value: StatoAttivita; label: string }[] = [
  { value: "DA_FARE", label: "Da fare" },
  { value: "IN_CORSO", label: "In corso" },
  { value: "COMPLETATA", label: "Completata" },
];

export interface FiltriAvanzatiProps {
  progetti: ProgettoListRow[];
  clienti: Cliente[];
  filtroProgetto: string;
  filtroCliente: string;
  filtroStato: StatoAttivita | "TUTTE";
  onProgetto: (v: string) => void;
  onCliente: (v: string) => void;
  onStato: (v: StatoAttivita | "TUTTE") => void;
  onAzzera: () => void;
}

// Filtri che il server applica alla query (progetto, cliente, stato). Stanno
// in un blocco richiudibile del pannello e non in una barra: sono filtri
// "rari", mentre origini ed etichette si toccano di continuo.
export default function FiltriAvanzati({
  progetti,
  clienti,
  filtroProgetto,
  filtroCliente,
  filtroStato,
  onProgetto,
  onCliente,
  onStato,
  onAzzera,
}: FiltriAvanzatiProps) {
  const attivo =
    filtroProgetto || filtroCliente || filtroStato !== "TUTTE";

  return (
    <div className="space-y-2.5 border-t border-crema-bordo pt-3">
      <div className="flex items-center justify-between">
        <span className={LABEL_CLASS}>Filtri avanzati</span>
        {attivo && (
          <button
            type="button"
            onClick={onAzzera}
            className="cursor-pointer text-[10px] font-semibold text-caldo-testo underline-offset-2 transition-colors duration-200 hover:text-inchiostro hover:underline"
          >
            Azzera
          </button>
        )}
      </div>

      {/* Label che avvolge il select, senza htmlFor/id: il pannello viene
          montato due volte (colonna desktop e drawer mobile), e id duplicati
          romperebbero l'associazione etichetta-campo. */}
      <label className="block">
        <span className={LABEL_CLASS}>Progetto</span>
        <select
          value={filtroProgetto}
          onChange={(e) => onProgetto(e.target.value)}
          className={`mt-1 cursor-pointer ${INPUT_CLASS}`}
        >
          <option value="">Tutti i progetti</option>
          {progetti.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codice} · {p.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Cliente</span>
        <select
          value={filtroCliente}
          onChange={(e) => onCliente(e.target.value)}
          className={`mt-1 cursor-pointer ${INPUT_CLASS}`}
        >
          <option value="">Tutti i clienti</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ragione_sociale}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Stato</span>
        <select
          value={filtroStato}
          onChange={(e) =>
            onStato(e.target.value as StatoAttivita | "TUTTE")
          }
          className={`mt-1 cursor-pointer ${INPUT_CLASS}`}
        >
          <option value="TUTTE">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
