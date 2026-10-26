"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Stats, TicketRow } from "@/lib/types";
import StatsCards from "@/components/StatsCards";
import FiltersBar, { DEFAULT_FILTERS, OrdinaPill, type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";
import QuickActions from "@/components/QuickActions";
import AppHeader from "@/components/AppHeader";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import {
  ChevronDownIcon,
  RefreshIcon,
  SparklesIcon,
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
      {/* Top bar. La ricerca NON sta piu' qui: era legata allo stesso
          `filters.q` del campo dentro la card, quindi due input visibili
          nella stessa schermata che si rispecchiavano a vicenda — si
          scriveva in uno e cambiava l'altro. Resta il campo della barra
          filtri, che sta accanto all'elenco che filtra. */}
      <AppHeader
        azioni={
          <>
            <Link
              href="/knowledge"
              className="flex items-center gap-1 rounded-control px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
            >
              Knowledge Base
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon className="h-3.5 w-3.5" />
              Aggiorna
            </button>
          </>
        }
      />

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {/* Il titolo non e' piu' "Panoramica del Sistema": il workspace si
            chiama cosi' per tutti, e un nome proprio in cima a ogni schermata
            non dice a nessuno dove si trova. Il conteggio e' quello della
            collezione filtrata, lo stesso che la SectionBar mostra accanto
            alla sezione — qui da' la misura della pagina intera. */}
        <PageHeader
          eyebrow="Area di lavoro"
          titolo="Dashboard"
          conteggio={loading && totale === 0 ? undefined : totale}
          sottotitolo="Metriche in tempo reale e attività recente del workspace."
        />

        {stats && <StatsCards stats={stats} />}

        {/* L'errore usa la famiglia urgenza: e' l'unica informazione della
            pagina che richiede un'azione immediata. */}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
          >
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Elenco ticket */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white xl:col-span-2">
            <SectionBar
              titolo="Ticket Recenti"
              icona={SparklesIcon}
              conteggio={totale}
            >
              <OrdinaPill
                value={filters.ordina}
                onChange={(ordina) => handleFiltersChange({ ordina })}
              />
              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPagina(1);
                }}
                className="cursor-pointer text-xs font-semibold text-inchiostro underline-offset-2 hover:underline"
              >
                Vedi tutti
              </button>
            </SectionBar>

            <FiltersBar
              filters={filters}
              moduli={moduli}
              onChange={handleFiltersChange}
            />

            {loading && tickets.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <p className="text-sm text-caldo-testo">Caricamento ticket…</p>
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
        {/* Sezione disattivata: le classi interne sono tenute allineate al
            design system, cosi' riattivarla non reintroduce la vecchia palette. */}
        {/* <div className="mt-6 rounded-card border border-crema-contorno bg-white">
          <div className="flex items-center justify-between border-b border-crema-bordo px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-inchiostro">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo">
                <CheckCircleIcon className="h-3 w-3" />
              </span>
              Ticket Chiusi
              <span className="tabular rounded-full border border-stato-neutro-bordo bg-stato-neutro-bg px-2 py-0.5 text-[10px] font-semibold text-stato-neutro-testo">
                {chiusiTotali}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => handleFiltersChange({ stato: "CHIUSO" })}
              className="text-xs font-semibold text-inchiostro underline-offset-2 hover:underline"
            >
              Vedi tutti
            </button>
          </div>
          <div className="divide-y divide-crema-bordo">
            {chiusiTickets.length > 0 ? (
              chiusiTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 text-left transition-colors duration-200 hover:bg-crema-scuro"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="tabular text-xs font-bold text-caldo-testo">{t.numero}</span>
                      <span className="text-xs text-caldo-testo">·</span>
                      <span className="text-xs font-semibold text-inchiostro">{t.cliente}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-caldo-testo">
                      {t.sommario_problema}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <span className="inline-block rounded-full border border-stato-ok-bordo bg-stato-ok-bg px-2 py-0.5 text-[10px] font-semibold text-stato-ok-testo">
                      Chiuso
                    </span>
                    <p className="tabular mt-0.5 text-[10px] text-caldo-testo">{t.data_chiusura}</p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="p-6 text-center text-sm text-caldo-testo">
                Nessun ticket chiuso al momento.
              </p>
            )}
          </div>
        </div> */}
      </main>
    </div>
  );
}