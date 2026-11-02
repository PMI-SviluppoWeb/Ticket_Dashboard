"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/lib/useDebounce";
import { usePolling } from "@/lib/usePolling";
import { caricaApi, datoImmediato } from "@/lib/api-cache";
import Link from "next/link";
import type { DashboardData, TicketListRow } from "@/lib/types";
import FiltersBar, { DEFAULT_FILTERS, OrdinaPill, type Filters } from "@/components/FiltersBar";
import TicketTable from "@/components/TicketTable";
import AppHeader from "@/components/AppHeader";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import BarraSintesi from "@/components/BarraSintesi";
import BloccoAgenda from "@/components/BloccoAgenda";
import BloccoTaskScadenze from "@/components/BloccoTaskScadenze";
import BloccoTempo from "@/components/BloccoTempo";
import BloccoProgettiAttivi from "@/components/BloccoProgettiAttivi";
import NuovoTicketModal from "@/components/NuovoTicketModal";
import {
  ChevronDownIcon,
  PlusIcon,
  RefreshIcon,
  TicketIcon,
} from "@/components/icons";

const PAGE_SIZE = 5;

export default function Dashboard() {
  // Tutto cio' che sta sopra la tabella arriva da una sola risposta: la sintesi
  // e i tre blocchi non hanno stati separati perche' non hanno caricamenti
  // separati. Se il batch della dashboard fallisce, la tabella ticket resta
  // comunque utilizzabile: sono due richieste indipendenti e due errori.
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [erroreDashboard, setErroreDashboard] = useState("");
  const [moduli, setModuli] = useState<string[]>([]);

  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNuovoTicket, setShowNuovoTicket] = useState(false);

  // La ricerca parte solo quando l'utente smette di scrivere: ogni carattere
  // era una richiesta HTTP e quindi due scansioni LIKE sul DB remoto.
  const qDebounce = useDebounce(filters.q, 250);

  const requestSeq = useRef(0);
  const seqDashboard = useRef(0);

  const loadDashboard = useCallback(async (forza = false) => {
    const seq = ++seqDashboard.current;

    // Ritorno sulla home: la fascia riecheggia l'ultimo dato noto mentre la
    // richiesta e' in volo. Non e' un errore, verra' confermato subito dopo.
    const subito = datoImmediato<{ dashboard: DashboardData; moduli: string[] }>(
      "/api/dashboard"
    );
    if (subito) {
      setDashboard(subito.dashboard);
      setModuli(subito.moduli);
    }

    try {
      const data = await caricaApi<{ dashboard: DashboardData; moduli: string[] }>(
        "/api/dashboard",
        { forza }
      );
      if (seq !== seqDashboard.current) return;
      setDashboard(data.dashboard);
      setModuli(data.moduli);
      setErroreDashboard("");
    } catch (err) {
      if (seq !== seqDashboard.current) return;
      setErroreDashboard(
        err instanceof Error ? err.message : "Errore di caricamento della sintesi."
      );
    }
  }, []);

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
        // Always show ALL tickets on the main dashboard
        operatore: "TUTTI",
      });
      const url = `/api/tickets?${params.toString()}`;

      // Cio' che si e' gia' visto si mostra subito: tornare su una pagina o
      // cambiare filtro all'indietro deve essere immediato, senza attendere il
      // viaggio fino al Turso remoto. La riga sotto non e' un errore: il dato
      // verra' confermato o corretto dalla risposta che parte subito dopo.
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
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Un solo poll, e si ferma quando la scheda non è visibile. `forza`: il poll
  // esiste per andare in rete, e senza forzatura potrebbe leggere la cache
  // scritta al giro precedente senza accorgersene.
  usePolling(
    useCallback(() => {
      loadList(true);
      loadDashboard(true);
    }, [loadList, loadDashboard]),
    30000
  );

  const handleFiltersChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagina(1);
  }, []);

  const refresh = useCallback(() => {
    loadList(true);
    loadDashboard(true);
  }, [loadList, loadDashboard]);

  // `null` finche' il primo dato non arriva: la fascia e i blocchi mostrano le
  // sagome. Dopo un errore non si resta in scheletro per sempre: mostra il
  // vuoto, e il banner sopra dice perche'.
  const caricamentoSintesi = dashboard === null && erroreDashboard === "";

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
            {/* <Link
              href="/knowledge"
              className="flex items-center gap-1 rounded-control px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
            >
              Knowledge Base
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </Link> */}
            <button
              type="button"
              onClick={() => setShowNuovoTicket(true)}
              className="flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Nuovo Ticket
            </button>
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
        <PageHeader
          eyebrow="Area di lavoro"
          titolo="Dashboard"
          sottotitolo="Cosa devi fare oggi, cosa arriva nei prossimi giorni, come sta andando il workspace."
        />

        {/* Una sola superficie per le sei misure: la fascia sostituisce
            StatsCards, che raccontava solo ticket. */}
        <BarraSintesi
          sintesi={dashboard?.sintesi ?? null}
          generatoIl={dashboard?.generato_il ?? null}
          caricamento={caricamentoSintesi}
        />

        {/* Due errori separati: se cade la sintesi, la tabella ticket sotto
            continua a funzionare e viceversa. L'errore usa la famiglia
            urgenza: e' l'unica informazione della pagina che richiede
            un'azione immediata. */}
        {erroreDashboard && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
          >
            Sintesi non disponibile: {erroreDashboard}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
          >
            {error}
          </p>
        )}

        {/* Tre blocchi ad altezza fissa (320px) con scroll interno. Su mobile
            si impilano; da md in su l'agenda prende la riga intera e task e
            tempo si dividono la successiva; a xl tornano in fila. */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          <BloccoAgenda
            className="md:col-span-2 xl:col-span-5"
            eventi={dashboard?.agenda ?? []}
            caricamento={caricamentoSintesi}
          />
          <BloccoTaskScadenze
            className="xl:col-span-4"
            task={dashboard?.mie_task ?? []}
            caricamento={caricamentoSintesi}
          />
          <BloccoTempo
            className="xl:col-span-3"
            tempo={dashboard?.sintesi.tempo ?? null}
            inCorsoOra={dashboard ? (dashboard.operatore.ruolo === "admin" ? dashboard.in_corso_ora : null) : null}
            caricamento={caricamentoSintesi}
          />
        </div>

        <BloccoProgettiAttivi
          progetti={dashboard?.progetti ?? []}
          caricamento={caricamentoSintesi}
        />

        {/* La tabella non sta piu' in una colonna da 2/3: senza QuickActions
            occupa tutta la larghezza, e la barra filtri ha spazio per stare
            su una riga sola. */}
        <div className="mt-6 flex min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Ticket" icona={TicketIcon} conteggio={totale}>
            <OrdinaPill
              value={filters.ordina}
              onChange={(ordina) => handleFiltersChange({ ordina })}
            />
            {/* Il reset dei filtri esiste solo qui: chiamarlo "Vedi tutti"
                prometteva una navigazione che non faceva. */}
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPagina(1);
              }}
              className="cursor-pointer text-xs font-semibold text-inchiostro underline-offset-2 hover:underline"
            >
              Azzera filtri
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
      </main>

      <NuovoTicketModal
        aperto={showNuovoTicket}
        onChiudi={() => setShowNuovoTicket(false)}
        onCreato={refresh}
        moduli={moduli}
      />
    </div>
  );
}
