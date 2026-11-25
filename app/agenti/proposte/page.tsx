"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import SectionBar from "@/components/SectionBar";
import { EditIcon, LoaderIcon, RefreshIcon, SparklesIcon } from "@/components/icons";
import type { AgenteProposta, StatoProposta } from "@/lib/types";

const STATO_LABEL: Record<StatoProposta, string> = {
  in_attesa: "In attesa",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
};

const STATO_CLASSE: Record<StatoProposta, string> = {
  in_attesa: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  approvata: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  rifiutata: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
};

function dataBreve(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PropostePage() {
  const { operatore, caricamento } = useOperatore();
  const [proposte, setProposte] = useState<AgenteProposta[]>([]);
  const [stato, setStato] = useState<"" | StatoProposta>("");
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      const params = new URLSearchParams();
      if (stato) params.set("stato", stato);
      const res = await fetch(`/api/agenti/proposte?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        proposte?: AgenteProposta[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Errore nel caricamento.");
      setProposte(data.proposte ?? []);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [stato]);

  useEffect(() => {
    if (operatore) void carica();
  }, [operatore, carica]);

  if (caricamento) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Link
          href="/login?redirect=/agenti/proposte"
          className="rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white"
        >
          Vai al login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Proposte agenti"
          sottotitolo="Progetti e attività preparati dagli agenti: nulla viene creato finché non approvi."
          conteggio={proposte.length}
          azioni={
            <button
              type="button"
              onClick={() => void carica()}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno bg-white px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshIcon className="h-4 w-4" />
              )}
              Aggiorna
            </button>
          }
        />

        <AreaTabs areaId="ai" />

        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-full border border-crema-contorno bg-white p-1">
          {(
            [
              { id: "", label: "Tutte" },
              { id: "in_attesa", label: "In attesa" },
              { id: "approvata", label: "Approvate" },
              { id: "rifiutata", label: "Rifiutate" },
            ] as Array<{ id: "" | StatoProposta; label: string }>
          ).map((f) => (
            <button
              key={f.id || "tutte"}
              type="button"
              onClick={() => setStato(f.id)}
              aria-pressed={stato === f.id}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                stato === f.id
                  ? "bg-inchiostro text-white"
                  : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {errore && (
          <p
            role="alert"
            className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
          >
            {errore}
          </p>
        )}

        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar
            titolo="Proposte"
            icona={SparklesIcon}
            conteggio={proposte.length}
          />
          {loading ? (
            <div className="flex justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : proposte.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-caldo-testo">
              Nessuna proposta. Chiedi all&apos;agente di creare un progetto con
              le richieste di un ticket.
            </p>
          ) : (
            <ul className="divide-y divide-crema-bordo">
              {proposte.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-inchiostro">
                        {p.payload.progetto.nome || "Proposta senza nome"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-caldo-testo">
                        {p.payload.progetto.cliente_nome ||
                          p.payload.progetto.cliente_id ||
                          "Cliente da selezionare"}{" "}
                        ·{" "}
                        {p.payload.attivita.length} attività ·{" "}
                        {p.agente_nome ?? "Agente"} · {p.operatore_nome ?? "Operatore"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-caldo-testo">
                        {dataBreve(p.data_creazione)}
                        {p.errore ? ` · ${p.errore}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATO_CLASSE[p.stato]}`}
                      >
                        {STATO_LABEL[p.stato]}
                      </span>
                      {p.stato === "approvata" && p.progetto_id && (
                        <Link
                          href={`/progetti/${p.progetto_id}`}
                          className="text-[11px] font-medium text-inchiostro underline underline-offset-2"
                        >
                          Progetto
                        </Link>
                      )}
                      <Link
                        href={`/agenti/proposte/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-control border border-crema-contorno px-2.5 py-1.5 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                        {p.stato === "in_attesa" ? "Apri e approva" : "Dettaglio"}
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
