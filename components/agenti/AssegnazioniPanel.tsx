"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderIcon, XIcon } from "@/components/icons";
import type { Agente, AgenteAssegnazione } from "@/lib/types";

interface OperatoreRiga {
  id: string;
  nome: string;
  email: string;
  ruolo: "admin" | "operatore";
  attivo: number | boolean;
}

interface Props {
  agente: Agente;
  onChiudi: () => void;
}

// Gestione delle assegnazioni di un agente di LIBRERIA: chi lo vede e chi lo
// ha nella barra rapida. Default = visibile a tutti gli operatori; una riga
// con "abilitato" spento lo nasconde a quell'operatore.
export default function AssegnazioniPanel({ agente, onChiudi }: Props) {
  const [operatori, setOperatori] = useState<OperatoreRiga[]>([]);
  const [assegnazioni, setAssegnazioni] = useState<AgenteAssegnazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inSalvataggio, setInSalvataggio] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [resOp, resAs] = await Promise.all([
        fetch("/api/operatori?all=true", { cache: "no-store" }),
        fetch(`/api/agenti/${agente.id}/assegnazioni`, { cache: "no-store" }),
      ]);
      if (resOp.ok) {
        const data = (await resOp.json()) as { operatori?: OperatoreRiga[] };
        setOperatori(data.operatori ?? []);
      }
      if (resAs.ok) {
        const data = (await resAs.json()) as {
          assegnazioni?: AgenteAssegnazione[];
        };
        setAssegnazioni(data.assegnazioni ?? []);
      }
    } catch {
      setErrore("Impossibile caricare le assegnazioni.");
    } finally {
      setLoading(false);
    }
  }, [agente.id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const perOperatore = (operatoreId: string) =>
    assegnazioni.find((a) => a.operatore_id === operatoreId) ?? null;

  const salva = async (
    operatoreId: string,
    patch: { abilitato?: boolean; pinnato?: boolean }
  ) => {
    setInSalvataggio(operatoreId);
    setErrore(null);
    try {
      const res = await fetch(`/api/agenti/${agente.id}/assegnazioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatoreId, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        assegnazione?: AgenteAssegnazione;
        error?: string;
      };
      if (!res.ok || !data.assegnazione) {
        throw new Error(data.error ?? "Errore nel salvataggio.");
      }
      const salvata = data.assegnazione;
      setAssegnazioni((prev) => {
        const altre = prev.filter((a) => a.operatore_id !== operatoreId);
        return [...altre, salvata];
      });
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setInSalvataggio(null);
    }
  };

  const rimuovi = async (operatoreId: string) => {
    setInSalvataggio(operatoreId);
    setErrore(null);
    try {
      const res = await fetch(
        `/api/agenti/${agente.id}/assegnazioni?operatoreId=${encodeURIComponent(operatoreId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Errore nella rimozione.");
      setAssegnazioni((prev) => prev.filter((a) => a.operatore_id !== operatoreId));
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nella rimozione.");
    } finally {
      setInSalvataggio(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
      <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
          Assegnazioni · {agente.nome}
        </p>
        <button
          onClick={onChiudi}
          aria-label="Chiudi il pannello assegnazioni"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-white hover:text-inchiostro"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 text-[11px] leading-relaxed text-caldo-testo">
          Gli agenti di libreria sono visibili a <strong className="text-inchiostro">tutti</strong>{" "}
          gli operatori per default. Togliendo &quot;Abilitato&quot; lo nascondi a
          quell&apos;operatore; &quot;In barra&quot; lo porta nella barra rapida del Copilot.
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
              const as = perOperatore(op.id);
              const abilitato = as ? as.abilitato : true;
              const pinnato = as ? as.pinnato : false;
              const attivo = Boolean(op.attivo);
              const occupato = inSalvataggio === op.id;
              return (
                <li
                  key={op.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-inchiostro">
                      {op.nome}
                      {!attivo && (
                        <span className="ml-2 text-[10px] font-medium text-caldo-testo">
                          (disattivato)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-caldo-testo">{op.email}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-caldo-testo">
                    <input
                      type="checkbox"
                      checked={abilitato}
                      disabled={occupato}
                      onChange={(e) => void salva(op.id, { abilitato: e.target.checked })}
                      className="h-3.5 w-3.5 cursor-pointer accent-inchiostro disabled:cursor-wait"
                    />
                    Abilitato
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-caldo-testo">
                    <input
                      type="checkbox"
                      checked={pinnato}
                      disabled={occupato || !abilitato}
                      onChange={(e) => void salva(op.id, { pinnato: e.target.checked })}
                      className="h-3.5 w-3.5 cursor-pointer accent-inchiostro disabled:cursor-wait"
                    />
                    In barra
                  </label>
                  {as && (
                    <button
                      onClick={() => void rimuovi(op.id)}
                      disabled={occupato}
                      className="cursor-pointer text-[11px] font-medium text-caldo-testo underline-offset-2 hover:text-inchiostro hover:underline disabled:cursor-wait"
                    >
                      Reset
                    </button>
                  )}
                  {occupato && (
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
