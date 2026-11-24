"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookIcon, LoaderIcon, SearchIcon } from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import {
  RAPPORTINO_STATO_CLASSE,
  RAPPORTINO_STATO_LABEL,
  dataBreve,
  formatMinuti,
} from "@/components/rapportini/formato";
import type { Rapportino } from "@/lib/types";

const STATI = ["", "bozza", "confermato", "esportato", "errore"] as const;

export default function RapportiniPage() {
  const [rapportini, setRapportini] = useState<Rapportino[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [stato, setStato] = useState("");
  const [q, setQ] = useState("");
  const [cerca, setCerca] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stato) params.set("stato", stato);
      if (cerca.trim()) params.set("q", cerca.trim());
      const res = await fetch(`/api/rapportini?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rapportini?: Rapportino[] };
      setRapportini(data.rapportini ?? []);
      setErrore(null);
    } catch {
      setErrore("Impossibile caricare i rapportini.");
    } finally {
      setLoading(false);
    }
  }, [stato, cerca]);

  useEffect(() => {
    void carica();
  }, [carica]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Rapportini"
          sottotitolo="Documenti generati alla chiusura dei ticket: ore lavorate, note e dati cliente. L'invio ad Arca è predisposto ma non ancora configurato."
          conteggio={rapportini.length}
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
                placeholder="Numero, cliente, ticket…"
                className="w-56 rounded-control border border-crema-contorno bg-white py-1.5 pl-8 pr-3 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
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
            value={stato}
            onChange={(e) => setStato(e.target.value)}
            aria-label="Filtra per stato"
            className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            {STATI.map((s) => (
              <option key={s || "tutti"} value={s}>
                {s ? RAPPORTINO_STATO_LABEL[s] ?? s : "Tutti gli stati"}
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
          <SectionBar titolo="Elenco" icona={BookIcon} conteggio={rapportini.length} />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : rapportini.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-caldo-testo">
              Nessun rapportino. Si genera automaticamente quando un ticket
              viene chiuso.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-crema-bordo bg-crema-scuro">
                    <th className="px-5 py-3 font-medium text-caldo-testo">Rapportino</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Cliente</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Ticket</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Data</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Ore</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Stato</th>
                    <th className="px-5 py-3 text-right font-medium text-caldo-testo">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {rapportini.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-crema-bordo transition-colors duration-200 last:border-0 hover:bg-crema-scuro"
                    >
                      <td className="px-5 py-3">
                        <span className="tabular font-mono text-xs font-semibold text-inchiostro">
                          {r.numero}
                        </span>
                        {r.attivita && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-caldo-testo">
                            {r.attivita}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-caldo-testo">
                        {r.cliente_ragione_sociale}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/tickets/${r.ticket_id}`}
                          className="tabular font-mono text-xs text-inchiostro underline-offset-2 hover:underline"
                        >
                          {r.ticket_numero}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-xs text-caldo-testo">
                        {dataBreve(r.data_creazione)}
                      </td>
                      <td className="px-5 py-3 tabular text-xs font-semibold text-inchiostro">
                        {formatMinuti(r.minuti_totali)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            RAPPORTINO_STATO_CLASSE[r.stato] ??
                            RAPPORTINO_STATO_CLASSE.bozza
                          }`}
                        >
                          {RAPPORTINO_STATO_LABEL[r.stato] ?? r.stato}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/rapportini/${r.id}`}
                          className="inline-flex cursor-pointer items-center rounded-control border border-crema-contorno px-2.5 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-white hover:text-inchiostro"
                        >
                          Apri
                        </Link>
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
