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

const PAGE_SIZE = 5;

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
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Separate state for closed tickets
  const [chiusiTickets, setChiusiTickets] = useState<TicketRow[]>([]);
  const [chiusiTotali, setChiusiTotali] = useState(0);

  const requestSeq = useRef(0);
  const chiusiRequestSeq = useRef(0);

  const loadOperator = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(data.operator?.ruolo === "admin");
      }
    } catch {
      // Ignore
    }
  }, []);

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
      // Always show ALL tickets on the main dashboard
      operatore: "TUTTI",
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

  // Load closed tickets separately for the dedicated section
  const loadChiusi = useCallback(async () => {
    const seq = ++chiusiRequestSeq.current;
    const params = new URLSearchParams({
      stato: "CHIUSO",
      priorita: "TUTTE",
      q: "",
      modulo: "",
      ordina: "data_desc",
      pagina: "1",
      paginaSize: "5",
      // Always pass TUTTI to see all closed tickets
      operatore: "TUTTI",
    });
    try {
      const res = await fetch(`/api/tickets?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === chiusiRequestSeq.current) {
        setChiusiTickets(data.tickets as TicketRow[]);
        setChiusiTotali(data.totale as number);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadOperator();
  }, [loadOperator]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadChiusi();
  }, [loadChiusi]);

  useEffect(() => {
    const id = setInterval(() => {
      loadList();
      loadStats();
      loadChiusi();
    }, 30000);
    return () => clearInterval(id);
  }, [loadList, loadStats, loadChiusi]);

  const handleFiltersChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagina(1);
  }, []);

  const refresh = useCallback(() => {
    loadList();
    loadStats();
    loadChiusi();
  }, [loadList, loadStats, loadChiusi]);

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
            onFilterChiusi={() => handleFiltersChange({ stato: "CHIUSO" })}
            onResetFilters={() => {
              setFilters(DEFAULT_FILTERS);
              setPagina(1);
            }}
          />
        </div>

        {/* Ticket Chiusi - Caricamento indipendente */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">
                ✓
              </span>
              Ticket Chiusi
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {chiusiTotali}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => handleFiltersChange({ stato: "CHIUSO" })}
              className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Vedi tutti
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {chiusiTickets.length > 0 ? (
              chiusiTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">{t.numero}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-600">{t.cliente}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {t.sommario_problema}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Chiuso
                    </span>
                    <p className="mt-0.5 text-[10px] text-slate-400">{t.data_chiusura}</p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-slate-400">
                Nessun ticket chiuso al momento.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}