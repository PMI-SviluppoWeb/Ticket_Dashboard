"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderIcon, XIcon } from "@/components/icons";
import type { AccessoCasellaOperatore, CasellaEmail } from "@/lib/types";

interface Props {
  casella: CasellaEmail;
  onChiudi: () => void;
}

// Accesso degli operatori a una singola casella. Gli admin vedono sempre tutte
// le caselle: qui si decide solo quali operatori possono vedere le email di
// questa. Nessuna credenziale viene mostrata.
export default function AccessiCasellaPanel({ casella, onChiudi }: Props) {
  const [operatori, setOperatori] = useState<AccessoCasellaOperatore[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/caselle/${casella.id}/accessi`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        operatori?: AccessoCasellaOperatore[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Errore nel caricamento.");
      }
      setOperatori(data.operatori ?? []);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [casella.id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const imposta = async (op: AccessoCasellaOperatore, abilitato: boolean) => {
    setOccupato(op.operatore_id);
    setErrore(null);
    // Ottimistico: la checkbox risponde subito, in errore si ripristina.
    setOperatori((prev) =>
      prev.map((x) =>
        x.operatore_id === op.operatore_id ? { ...x, abilitato } : x
      )
    );
    try {
      const res = await fetch(`/api/caselle/${casella.id}/accessi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatoreId: op.operatore_id, abilitato }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Errore nel salvataggio.");
    } catch (err) {
      setOperatori((prev) =>
        prev.map((x) =>
          x.operatore_id === op.operatore_id ? { ...x, abilitato: !abilitato } : x
        )
      );
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setOccupato(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
      <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
          Accessi operatori · {casella.etichetta}
        </p>
        <button
          type="button"
          onClick={onChiudi}
          aria-label="Chiudi il pannello accessi"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-white hover:text-inchiostro"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 text-[11px] leading-relaxed text-caldo-testo">
          <strong className="text-inchiostro">{casella.indirizzo}</strong> · gli
          amministratori vedono sempre tutte le caselle. Un operatore vede le
          email di questa casella solo se abilitato qui.
        </p>

        {errore && (
          <p role="alert" className="mb-3 text-xs text-stato-urgenza-testo">
            {errore}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <LoaderIcon className="h-5 w-5 animate-spin text-inchiostro" />
          </div>
        ) : operatori.length === 0 ? (
          <p className="py-4 text-center text-xs text-caldo-testo">
            Nessun operatore trovato.
          </p>
        ) : (
          <ul className="divide-y divide-crema-bordo">
            {operatori.map((op) => {
              const occupata = occupato === op.operatore_id;
              return (
                <li
                  key={op.operatore_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-inchiostro">
                      {op.nome}
                      {!op.attivo && (
                        <span className="ml-2 text-[10px] font-medium text-caldo-testo">
                          (disattivato)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-caldo-testo">{op.email}</p>
                  </div>
                  {op.admin ? (
                    <span className="rounded-full border border-stato-info-bordo bg-stato-info-bg px-2 py-0.5 text-[10px] font-semibold text-stato-info-testo">
                      Admin · vede sempre
                    </span>
                  ) : (
                    <label className="flex items-center gap-1.5 text-xs text-caldo-testo">
                      <input
                        type="checkbox"
                        checked={op.abilitato}
                        disabled={occupata}
                        onChange={(e) => void imposta(op, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-inchiostro disabled:cursor-wait"
                      />
                      Può vedere
                    </label>
                  )}
                  {occupata && (
                    <LoaderIcon className="h-3.5 w-3.5 animate-spin text-caldo-testo" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
