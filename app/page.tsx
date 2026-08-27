"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Stats, TicketRow } from "@/lib/types";
import StatsCards from "@/components/StatsCards";
import FiltersBar, { type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";

const PAGE_SIZE = 25;

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [moduli, setModuli] = useState<string[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    stato: "TUTTI",
    priorita: "TUTTE",
    q: "",
    modulo: "",
    ordina: "data_desc",
  });
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestSeq = useRef(0);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = (await res.json()) as { stats: Stats; moduli: string[] };
        setStats(data.stats);
        setModuli(data.moduli);
      }
    } catch {
      // Ignora, verrà ritentato al prossimo refresh.
    }
  }, []);

  const loadList = useCallback(async () => {
    const seq = ++requestSeq.current;
    const params = new URLSearchParams({
      stato: filters.stato,
      priorita: filters.priorita,
      q: filters.q,
      modulo: filters.modulo,
      ordina: filters.ordina,
      pagina: String(pagina),
      paginaSize: String(PAGE_SIZE),
    });
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === requestSeq.current) {
        setTickets(data.tickets as TicketRow[]);
        setTotale(data.totale as number);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters, pagina]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const id = setInterval(() => {
      loadList();
      loadStats();
    }, 30000);
    return () => clearInterval(id);
  }, [loadList, loadStats]);

  const handleFiltersChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagina(1);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard Ticket</h1>
          <p className="text-xs text-slate-500">
            Monitoraggio dei ticket di supporto · aggiornamento automatico ogni 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/knowledge"
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Knowledge Base
          </Link>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
          <button
            type="button"
            onClick={() => {
              loadList();
              loadStats();
            }}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Aggiorna
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {stats && <StatsCards stats={stats} />}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <FiltersBar
            filters={filters}
            moduli={moduli}
            visibili={tickets.length}
            totale={totale}
            onChange={handleFiltersChange}
          />
          {loading && tickets.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-sm text-slate-400">Caricamento ticket…</p>
            </div>
          ) : (
            <TicketTable
              tickets={tickets}
              pagina={pagina}
              totale={totale}
              paginaSize={PAGE_SIZE}
              onPageChange={setPagina}
            />
          )}
        </div>
      </main>
    </div>
  );
}
