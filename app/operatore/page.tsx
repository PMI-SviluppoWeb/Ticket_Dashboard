"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Stats, TicketListRow } from "@/lib/types";
import StatsCards from "@/components/StatsCards";
import FiltersBar, { DEFAULT_FILTERS, OrdinaPill, type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";
import QuickActions from "@/components/QuickActions";
import AppHeader from "@/components/AppHeader";
import { useDebounce } from "@/lib/useDebounce";
import { usePolling } from "@/lib/usePolling";
import { useOperatore, resetOperatore } from "@/lib/operatore-client";
import { caricaApi, datoImmediato, svuotaCache } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import {
  ChevronDownIcon,
  RefreshIcon,
  SparklesIcon,
  UserIcon,
} from "@/components/icons";

const PAGE_SIZE = 25;

export default function OperatoreDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [moduli, setModuli] = useState<string[]>([]);
  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, stato: "IN_CORSO" });
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const requestSeq = useRef(0);

  // L'operatore viene dalla cache condivisa: la Sidebar chiede lo stesso dato,
  // quindi la richiesta è una sola per caricamento. Da qui serve solo il ruolo.
  const { operatore, caricamento: caricamentoOperatore } = useOperatore();
  const operator = operatore;

  useEffect(() => {
    // Un admin non ha "i propri ticket": questa pagina passa dal router, ma
    // solo dopo che il ruolo è noto.
    if (!caricamentoOperatore && operatore?.ruolo === "admin") router.push("/");
  }, [caricamentoOperatore, operatore, router]);

  // Il logout e' un POST: un <Link> verso /api/auth/logout fa una GET e finisce
  // in 405, l'utente pensa di uscire ma la sessione resta viva. Stesso
  // comportamento della Sidebar (reset cache + redirect).
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      resetOperatore();
      svuotaCache();
      window.location.href = "/login";
    } catch {
      // Ignore
    }
  };

  const loadStats = useCallback(async (forza = false) => {
    try {
      const data = await caricaApi<{ stats: Stats; moduli: string[] }>("/api/stats", { forza });
      setStats(data.stats);
      setModuli(data.moduli);
    } catch {
      // Ignore
    }
  }, []);

  const qDebounce = useDebounce(filters.q, 250);

  const loadList = useCallback(
    async (forza = false) => {
      const seq = ++requestSeq.current;
      const params = new URLSearchParams({
        stato: filters.stato,
        priorita: filters.priorita,
        q: qDebounce,
        modulo: filters.modulo,
        ordina: filters.ordina,
        pagina: String(pagina),
        paginaSize: String(PAGE_SIZE),
      });
      const url = `/api/tickets?${params.toString()}`;

      // Dato gia' visto: si mostra subito, la richiesta parte comunque.
      const subito = datoImmediato<{ tickets: TicketListRow[]; totale: number }>(url);
      if (subito) {
        setTickets(subito.tickets);
        setTotale(subito.totale);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await caricaApi<{ tickets: TicketListRow[]; totale: number }>(url, { forza });
        if (seq === requestSeq.current) {
          setTickets(data.tickets);
          setTotale(data.totale);
          setLastUpdate(new Date());
        }
      } catch (err) {
        if (seq === requestSeq.current) {
          setError(err instanceof Error ? err.message : "Errore di caricamento.");
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [filters.stato, filters.priorita, filters.modulo, filters.ordina, qDebounce, pagina]
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Un solo poll, fermo quando la scheda non è visibile.
  usePolling(
    useCallback(() => {
      loadList(true);
      loadStats(true);
    }, [loadList, loadStats]),
    30000
  );

  const handleFiltersChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagina(1);
  }, []);

  const refresh = useCallback(() => {
    loadList(true);
    loadStats(true);
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
      {/* Top bar. Come sulla dashboard, la ricerca non sta piu' qui: era
          legata allo stesso `filters.q` del campo dentro la card, quindi due
          input nella stessa schermata che si rispecchiavano a vicenda. */}
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
            {/* Qui il blocco identita' resta: nome e ruolo dell'operatore
                sono informazione reale che serve in pagina, non un avatar
                decorativo. E' anche l'unica via d'uscita (logout). */}
            <div className="ml-1 flex items-center gap-2 border-l border-crema-contorno pl-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-inchiostro">{operator?.nome ?? "Operatore"}</p>
                <p className="text-xs capitalize text-caldo-testo">{operator?.ruolo ?? "operatore"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-crema-scuro text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                title="Esci"
              >
                <UserIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        }
      />

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        <PageHeader
          eyebrow="Area di lavoro"
          titolo="I Miei Ticket"
          conteggio={loading && totale === 0 ? undefined : totale}
          sottotitolo={`Ticket assegnati a ${operator?.nome ?? "te"} · aggiornamento automatico ogni 30s.`}
        />

        {stats && <StatsCards stats={stats} />}

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
              titolo="Ticket in Lavorazione"
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
                  setFilters({ ...DEFAULT_FILTERS, stato: "IN_CORSO" });
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