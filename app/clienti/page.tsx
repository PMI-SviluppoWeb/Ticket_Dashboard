"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import {
  LoaderIcon,
  LockClosedIcon,
  RefreshIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import type {
  ClientePanoramica,
  PrioritaCommerciale,
  StatoClienteCommerciale,
} from "@/lib/types";

const STATO_LABEL: Record<StatoClienteCommerciale, string> = {
  attivo: "Attivo",
  prospect: "Prospect",
  a_rischio: "A rischio",
  perso: "Perso",
};

const STATO_CLASSE: Record<StatoClienteCommerciale, string> = {
  attivo: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  prospect: "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo",
  a_rischio: "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo",
  perso: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
};

const PRIORITA_LABEL: Record<PrioritaCommerciale, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};

function minutiLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function dataBreve(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ClientiPage() {
  const { operatore, caricamento } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";

  const [clienti, setClienti] = useState<ClientePanoramica[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [q, setQ] = useState("");
  const [cerca, setCerca] = useState("");
  const [filtroStato, setFiltroStato] = useState<"" | StatoClienteCommerciale>("");

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      const params = new URLSearchParams();
      if (cerca.trim()) params.set("q", cerca.trim());
      const res = await fetch(`/api/clienti/panoramica?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        clienti?: ClientePanoramica[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Errore nel caricamento.");
      setClienti(data.clienti ?? []);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [cerca]);

  useEffect(() => {
    if (isAdmin) void carica();
  }, [isAdmin, carica]);

  if (caricamento) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-crema-scuro text-caldo-testo">
            <LockClosedIcon className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            La gestione clienti è accessibile solo con un account amministratore.
          </p>
          <Link
            href="/login?redirect=/clienti"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  const visibili = clienti.filter(
    (c) => !filtroStato || c.stato_cliente === filtroStato
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="w-full">
        <PageHeader
          titolo="Clienti"
          sottotitolo="Scheda commerciale, questionari e lavoro svolto. L'anagrafica resta quella sincronizzata da Arca."
          conteggio={visibili.length}
          azioni={
            <button
              type="button"
              onClick={() => void carica()}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCerca(q);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caldo-testo" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ragione sociale, referente, città…"
                className="w-64 rounded-control border border-crema-contorno bg-white py-1.5 pl-8 pr-3 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
            </div>
            <button
              type="submit"
              className="cursor-pointer rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
            >
              Cerca
            </button>
          </form>

          <select
            value={filtroStato}
            onChange={(e) =>
              setFiltroStato(e.target.value as "" | StatoClienteCommerciale)
            }
            aria-label="Filtra per stato cliente"
            className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            <option value="">Tutti gli stati</option>
            {(Object.keys(STATO_LABEL) as StatoClienteCommerciale[]).map((s) => (
              <option key={s} value={s}>
                {STATO_LABEL[s]}
              </option>
            ))}
          </select>
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
            titolo="Elenco clienti"
            icona={UserIcon}
            conteggio={visibili.length}
          />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : visibili.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-caldo-testo">
              Nessun cliente trovato.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-crema-bordo bg-crema-scuro text-[11px] uppercase tracking-wide text-caldo-testo">
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3 font-medium">Stato</th>
                    <th className="px-5 py-3 text-right font-medium">Ticket aperti</th>
                    <th className="px-5 py-3 text-right font-medium">Ore</th>
                    <th className="px-5 py-3 text-right font-medium">Questionari</th>
                    <th className="px-5 py-3 font-medium">Ultimo questionario</th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-crema-bordo transition-colors duration-200 last:border-0 hover:bg-crema-scuro"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/clienti/${c.id}`}
                          className="font-medium text-inchiostro underline-offset-2 hover:underline"
                        >
                          {c.ragione_sociale}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-caldo-testo">
                          {[c.nome_contatto, c.citta].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            STATO_CLASSE[c.stato_cliente]
                          }`}
                        >
                          {STATO_LABEL[c.stato_cliente]}
                        </span>
                        <p className="mt-1 text-[10px] text-caldo-testo">
                          Priorità {PRIORITA_LABEL[c.priorita_commerciale]}
                          {c.settore ? ` · ${c.settore}` : ""}
                        </p>
                      </td>
                      <td className="tabular px-5 py-3 text-right text-inchiostro">
                        {c.ticket_aperti}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-caldo-testo">
                        {minutiLabel(c.ore_minuti)}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-inchiostro">
                        {c.questionari_compilati}
                      </td>
                      <td className="px-5 py-3 text-xs text-caldo-testo">
                        {dataBreve(c.ultimo_questionario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
