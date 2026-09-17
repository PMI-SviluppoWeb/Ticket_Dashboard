"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Stats, TicketRow } from "@/lib/types";
import StatsCards from "@/components/StatsCards";
import FiltersBar, { DEFAULT_FILTERS, type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";
import QuickActions from "@/components/QuickActions";
import NotificationBell from "@/components/NotificationBell";
import {
  ChevronDownIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  ArrowRightIcon,
} from "@/components/icons";

const PAGE_SIZE = 25;

export default function OperatoreDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [moduli, setModuli] = useState<string[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, stato: "IN_CORSO" });
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [operator, setOperator] = useState<{ nome: string; email: string; ruolo: string } | null>(null);

  const requestSeq = useRef(0);

  const loadOperator = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.operator?.ruolo === "admin") {
          router.push("/");
          return;
        }
        setOperator(data.operator);
      }
    } catch {
      // Ignore
    }
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = (await res.json()) as { stats: Stats; moduli: string[] };
        setStats(data.stats);
        setModuli(data.moduli);
      }
    } catch {
      // Ignore
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
    loadOperator();
  }, [loadOperator]);

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

  const handleTakeTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "IN_CORSO" }),
      });
      if (res.ok) {
        loadList();
        loadStats();
      }
    } catch {
      // Error handled by UI
    }
  };

  const handleReleaseTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "NUOVO" }),
      });
      if (res.ok) {
        loadList();
        loadStats();
      }
    } catch {
      // Error handled by UI
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => handleFiltersChange({ q: e.target.value })}
            placeholder="Cerca tra i tuoi ticket…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
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
          <div className="ml-3 flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-900">{operator?.nome ?? "Operatore"}</p>
              <p className="text-xs text-slate-500 capitalize">{operator?.ruolo ?? "operatore"}</p>
            </div>
            <Link
              href="/api/auth/logout"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
              title="Esci"
            >
              <UserIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">I Miei Ticket</h1>
          <p className="text-sm text-slate-400">
            Ticket assegnati a {operator?.nome ?? "te"} - Aggiornamento automatico ogni 30s
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
                Ticket in Lavorazione
              </h2>
              <button
                type="button"
                onClick={() => {
                  setFilters({ ...DEFAULT_FILTERS, stato: "IN_CORSO" });
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
                onTakeTicket={handleTakeTicket}
                onReleaseTicket={handleReleaseTicket}
                currentOperator={operator?.nome ?? ""}
              />
            )}
          </div>

          {/* Colonna destra - Azioni rapide */}
          <QuickActions
            lastUpdate={lastUpdate}
            onRefresh={refresh}
            onFilterUrgenti={() => handleFiltersChange({ stato: "TUTTI", priorita: "ALTA" })}
            onFilterChiusi={() => handleFiltersChange({ stato: "CHIUSO" })}
            onResetFilters={() => {
              setFilters({ ...DEFAULT_FILTERS, stato: "IN_CORSO" });
              setPagina(1);
            }}
            currentOperator={operator?.nome ?? ""}
          />
        </div>
      </main>
    </div>
  );
}