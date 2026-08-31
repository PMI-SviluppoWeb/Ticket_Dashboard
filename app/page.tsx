"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Stats, TicketRow } from "@/lib/types";
import StatsCards from "@/components/StatsCards";
import FiltersBar, { DEFAULT_FILTERS, type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";
import QuickActions from "@/components/QuickActions";
import {
  BellIcon,
  ChevronDownIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
} from "@/components/icons";

const PAGE_SIZE = 25;

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [moduli, setModuli] = useState<string[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
        setLastUpdate(new Date());
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

  const refresh = useCallback(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => handleFiltersChange({ q: e.target.value })}
            placeholder="Cerca ticket, ID o clienti…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Notifiche"
          >
            <BellIcon className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
          <Link
            href="/knowledge"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Knowledge Base
            <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Aggiorna
          </button>
          <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <UserIcon className="h-4 w-4" />
          </span>
        </div>
      </header>

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">Panoramica del Sistema</h1>
          <p className="text-sm text-slate-400">
            Metriche in tempo reale e attività recente del workspace.
          </p>
        </div>

        {stats && <StatsCards stats={stats} />}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Elenco ticket */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <SparklesIcon className="h-4 w-4 text-blue-600" />
                Ticket Recenti
              </h2>
              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPagina(1);
                }}
                className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
              >
                Vedi tutti
              </button>
            </div>

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

          {/* Colonna destra */}
          <QuickActions
            lastUpdate={lastUpdate}
            onRefresh={refresh}
            onFilterUrgenti={() => handleFiltersChange({ stato: "TUTTI", priorita: "ALTA" })}
            onResetFilters={() => {
              setFilters(DEFAULT_FILTERS);
              setPagina(1);
            }}
          />
        </div>
      </main>
    </div>
  );
}
