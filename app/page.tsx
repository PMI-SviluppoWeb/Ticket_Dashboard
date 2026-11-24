"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/lib/useDebounce";
import { usePolling } from "@/lib/usePolling";
import { caricaApi, datoImmediato } from "@/lib/api-cache";
import { useOperatore } from "@/lib/operatore-client";
import type { DashboardData, TicketListRow } from "@/lib/types";
import { DEFAULT_FILTERS, type Filters } from "@/components/FiltersBar";
import AppHeader from "@/components/AppHeader";
import PageHeader from "@/components/PageHeader";
import BarraSintesi from "@/components/BarraSintesi";
import NuovoTicketModal from "@/components/NuovoTicketModal";
import PannelloTicket from "@/components/dashboard/PannelloTicket";
import PannelloCalendarioDashboard from "@/components/dashboard/PannelloCalendarioDashboard";
import PannelloInbox from "@/components/dashboard/PannelloInbox";
import PannelloTask from "@/components/dashboard/PannelloTask";
import { PlusIcon, RefreshIcon } from "@/components/icons";

const PAGE_SIZE = 6;

export default function Dashboard() {
  // Tutto cio' che sta sopra i pannelli arriva da una sola risposta: la sintesi
  // e i blocchi non hanno stati separati perche' non hanno caricamenti
  // separati. Se il batch della dashboard fallisce, ticket e calendario
  // restano comunque utilizzabili: sono richieste indipendenti e errori
  // indipendenti.
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [erroreDashboard, setErroreDashboard] = useState("");
  const [moduli, setModuli] = useState<string[]>([]);
  const [operatori, setOperatori] = useState<string[]>([]);

  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNuovoTicket, setShowNuovoTicket] = useState(false);

  // Ruolo e nome arrivano dalla cache condivisa (la Sidebar chiede lo stesso
  // dato); se la dashboard risponde prima, si usa la sua copia. Servono per il
  // default "solo miei" dell'operatore e per le azioni prendi/rilascia.
  const { operatore } = useOperatore();
  const ruoloCorrente = operatore?.ruolo ?? dashboard?.operatore.ruolo;
  const currentOperator = operatore?.nome ?? dashboard?.operatore.nome ?? "";
  const currentOperatorRef = useRef(currentOperator);
  currentOperatorRef.current = currentOperator;
  const defaultFiltroApplicato = useRef(false);
  const isAdmin = ruoloCorrente === "admin";

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
      // "__ME__" e' un segnaposto del client: il server conosce l'id della
      // sessione, non il nome; la filtro qui con il nome dell'operatore. Il ref
      // evita che l'arrivo del nome faccia ripartire una fetch identica.
      const filtroOperatore =
        filters.operatore === "__ME__"
          ? currentOperatorRef.current || "TUTTI"
          : filters.operatore;
      const params = new URLSearchParams({
        stato: filters.stato,
        priorita: filters.priorita,
        q: qDebounce,
        modulo: filters.modulo,
        // "TUTTI" e' l'unico valore che il server traduce in "nessun filtro":
        // una stringa vuota verrebbe interpretata come "miei + non assegnati".
        operatore: filtroOperatore,
        ordina: filters.ordina,
        pagina: String(pagina),
        paginaSize: String(PAGE_SIZE),
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
    [filters.stato, filters.priorita, filters.modulo, filters.operatore, filters.ordina, qDebounce, pagina]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Default "solo miei" per gli operatori: l'admin vede tutti. Non si blocca
  // la lista in attesa del ruolo: i ticket partono subito con "Tutti" e, se il
  // ruolo e' operatore, il filtro passa a "I miei" appena arriva. Il ref
  // impedisce che un "Tutti" scelto a mano venga sovrascritto al poll.
  useEffect(() => {
    if (!ruoloCorrente || defaultFiltroApplicato.current) return;
    defaultFiltroApplicato.current = true;
    if (ruoloCorrente !== "admin") {
      setFilters((prev) =>
        prev.operatore === "TUTTI" ? { ...prev, operatore: "__ME__" } : prev
      );
    }
  }, [ruoloCorrente]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Elenco operatori per il filtro: cambia raramente, quindi la cache condivisa
  // evita di richiederlo a ogni montaggio della dashboard.
  useEffect(() => {
    let annullato = false;
    caricaApi<{ operatori?: { nome: string; attivo?: boolean }[] }>("/api/operatori")
      .then((data) => {
        if (annullato) return;
        setOperatori(
          (data.operatori ?? [])
            .filter((o) => o.attivo !== false)
            .map((o) => o.nome)
            .sort((a, b) => a.localeCompare(b, "it"))
        );
      })
      .catch(() => {
        // Il filtro operatore e' un di piu': senza anagrafica restano gli altri.
      });
    return () => {
      annullato = true;
    };
  }, []);

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

  const azzeraFiltri = useCallback(() => {
    // Per l'operatore "azzera" torna al default personale, non a "tutti":
    // altrimenti un click sul reset lo riporterebbe fuori dai suoi ticket.
    setFilters({ ...DEFAULT_FILTERS, operatore: isAdmin ? "TUTTI" : "__ME__" });
    setPagina(1);
  }, [isAdmin]);

  const refresh = useCallback(() => {
    loadList(true);
    loadDashboard(true);
  }, [loadList, loadDashboard]);

  // Prendi/rilascia dalla lista: la riga cambia SUBITO (stato e assegnatario)
  // e il PATCH parte in background. Al ritorno si riallinea con il server;
  // in errore si ricarica per ripristinare il dato vero.
  const aggiornaStatoTicket = useCallback(
    async (id: string, stato: "IN_CORSO" | "NUOVO") => {
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                stato,
                operatore: stato === "IN_CORSO" ? currentOperatorRef.current : null,
              }
            : t
        )
      );
      try {
        const res = await fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato }),
        });
        if (res.ok) {
          loadList(true);
          loadDashboard(true);
        } else {
          loadList(true);
        }
      } catch {
        loadList(true);
      }
    },
    [loadList, loadDashboard]
  );

  // `null` finche' il primo dato non arriva: la fascia mostra le sagome. Dopo
  // un errore non si resta in scheletro per sempre: mostra il vuoto, e il
  // banner sopra dice perche'.
  const caricamentoSintesi = dashboard === null && erroreDashboard === "";

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        azioni={
          <>
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

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        <PageHeader compatto titolo="Dashboard" />

        {/* Una sola superficie per le sei misure: la fascia sostituisce le
            vecchie card, che raccontavano solo ticket. */}
        <BarraSintesi
          sintesi={dashboard?.sintesi ?? null}
          generatoIl={dashboard?.generato_il ?? null}
          caricamento={caricamentoSintesi}
        />

        {/* Due errori separati: se cade la sintesi, i pannelli sotto
            continuano a funzionare e viceversa. L'errore usa la famiglia
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

        {/* Cruscotto 2x2: le righe sono alte quanto il contenuto, non si
            dividono piu' l'altezza residua. Ogni pannello ha un tetto massimo
            (l'altezza disponibile) e scorre internamente solo se lo supera.
            Su mobile si impilano. */}
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <PannelloTicket
            className="max-h-[68vh] lg:col-span-7 lg:row-start-1 lg:max-h-[calc(100dvh-16rem)]"
            tickets={tickets}
            totale={totale}
            pagina={pagina}
            paginaSize={PAGE_SIZE}
            loading={loading}
            error={error}
            filters={filters}
            moduli={moduli}
            operatori={operatori}
            onFiltersChange={handleFiltersChange}
            onPageChange={setPagina}
            onAzzera={azzeraFiltri}
            onTakeTicket={(id) => void aggiornaStatoTicket(id, "IN_CORSO")}
            onReleaseTicket={(id) => void aggiornaStatoTicket(id, "NUOVO")}
            currentOperator={currentOperator}
          />

          <PannelloCalendarioDashboard className="max-h-[72vh] lg:col-span-5 lg:row-start-1 lg:max-h-[calc(100dvh-16rem)]" />

          {isAdmin && (
            <PannelloInbox className="max-h-[60vh] lg:col-span-7 lg:row-start-2 lg:max-h-[calc(100dvh-16rem)]" />
          )}

          <PannelloTask
            className={`max-h-[60vh] lg:row-start-2 lg:max-h-[calc(100dvh-16rem)] ${
              isAdmin ? "lg:col-span-5" : "lg:col-span-12"
            }`}
            task={dashboard?.mie_task ?? []}
            caricamento={caricamentoSintesi}
            isAdmin={isAdmin}
          />
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
