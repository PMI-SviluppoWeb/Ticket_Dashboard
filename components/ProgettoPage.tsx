"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AttivitaRow,
  Cliente,
  Progetto,
  StatoAttivita,
  StatoProgetto,
  TicketRow,
} from "@/lib/types";
import { PriorityBadge, ProgettoStatusBadge } from "@/components/badges";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  EditIcon,
  FolderIcon,
  ListChecksIcon,
  PlusIcon,
  SearchIcon,
  TicketIcon,
  TimerIcon,
  TrashIcon,
} from "@/components/icons";
import SectionBar from "@/components/SectionBar";
import ProgettoTaskBoard from "@/components/ProgettoTaskBoard";
import ProgettoTaskDrawer from "@/components/ProgettoTaskDrawer";
import { formatData, perInputDateTime } from "@/lib/calendario";
import { formatDurata, riepilogoTempi } from "@/lib/durata";
import { iniziali, SEZIONE_INIZIALE, type ExtraTask, type Sezione } from "@/lib/task-local";
// La percentuale del dettaglio e' derivata qui dalle attivita' gia' caricate:
// getProgetto non restituisce conteggi. Stessa funzione pura della lista,
// cosi' le due schermate non possono divergere.
import {
  percentualeCompletamento,
  RIEMPIMENTO_CARD,
  TRACCIA_CARD,
} from "@/lib/progetto-card";

const STATI_PROGETTO_OPTIONS: { value: StatoProgetto; label: string }[] = [
  { value: "PIANIFICATO", label: "Pianificato" },
  { value: "IN_CORSO", label: "In corso" },
  { value: "IN_PAUSA", label: "In pausa" },
  { value: "COMPLETATO", label: "Completato" },
  { value: "ANNULLATO", label: "Annullato" },
];

const INPUT_CLASS =
  "w-full rounded-full border border-crema-contorno bg-white py-2 px-4 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
const LABEL_CLASS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo";

// Pillole locali a questa pagina, come INPUT_CLASS.
const BTN_PRIMARIO =
  "inline-flex items-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-60";
const BTN_SECONDARIO =
  "inline-flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-60";

interface ProgettoPageProps {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
}

export default function ProgettoPage({ id, onBack, onDeleted }: ProgettoPageProps) {
  const [progetto, setProgetto] = useState<Progetto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [operatori, setOperatori] = useState<{ id: string; nome: string }[]>([]);

  // Modifica progetto
  const [editProgetto, setEditProgetto] = useState(false);
  const [formProgetto, setFormProgetto] = useState({
    nome: "",
    descrizione: "",
    cliente_id: "",
    stato: "PIANIFICATO" as StatoProgetto,
    priorita: "MEDIA" as "BASSA" | "MEDIA" | "ALTA",
    responsabile: "",
    data_inizio: "",
    data_fine: "",
    note: "",
  });
  const [savingProgetto, setSavingProgetto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Task
  const [selezionataId, setSelezionataId] = useState<string | null>(null);
  const [confirmDeleteAttivita, setConfirmDeleteAttivita] = useState<string | null>(null);

  // Stato LOCALE della board (vedi lib/task-local.ts): sopravvive al
  // ricaricamento dei dati del progetto, che riscrive solo `progetto`.
  const [sezioni, setSezioni] = useState<Sezione[]>([SEZIONE_INIZIALE]);
  const [extra, setExtra] = useState<Record<string, ExtraTask>>({});

  // Ticket collegati
  const [showTicketSearch, setShowTicketSearch] = useState(false);
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketRisultati, setTicketRisultati] = useState<TicketRow[]>([]);
  const [cercandoTicket, setCercandoTicket] = useState(false);

  const requestSeq = useRef(0);
  const ticketSeq = useRef(0);

  const loadProgetto = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}`);
      if (res.status === 404) throw new Error("Progetto non trovato.");
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = (await res.json()) as Progetto;
      if (seq === requestSeq.current) setProgetto(data);
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProgetto();
  }, [loadProgetto]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clienti");
        if (res.ok) {
          const data = await res.json();
          setClienti((data.clienti ?? []) as Cliente[]);
        }
      } catch {
        // Ignora
      }
    })();
  }, []);

  useEffect(() => {
    fetch("/api/operatori")
      .then((res) => (res.ok ? res.json() : { operatori: [] }))
      .then((data) => setOperatori((data.operatori ?? []) as { id: string; nome: string }[]))
      .catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Progetto
  // -------------------------------------------------------------------------
  const apriModificaProgetto = () => {
    if (!progetto) return;
    setFormProgetto({
      nome: progetto.nome,
      descrizione: progetto.descrizione ?? "",
      cliente_id: progetto.cliente_id,
      stato: progetto.stato,
      priorita: progetto.priorita,
      responsabile: progetto.responsabile ?? "",
      data_inizio: perInputDateTime(progetto.data_inizio),
      data_fine: perInputDateTime(progetto.data_fine),
      note: progetto.note ?? "",
    });
    setEditProgetto(true);
  };

  const salvaProgetto = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSavingProgetto(true);
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formProgetto.nome,
          descrizione: formProgetto.descrizione || null,
          cliente_id: formProgetto.cliente_id,
          stato: formProgetto.stato,
          priorita: formProgetto.priorita,
          responsabile: formProgetto.responsabile || null,
          data_inizio: formProgetto.data_inizio || null,
          data_fine: formProgetto.data_fine || null,
          note: formProgetto.note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setEditProgetto(false);
      loadProgetto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSavingProgetto(false);
    }
  };

  const eliminaProgetto = async () => {
    try {
      const res = await fetch(`/api/progetti/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Errore ${res.status}`);
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di cancellazione.");
      setConfirmDelete(false);
    }
  };

  // -------------------------------------------------------------------------
  // Task: le scritture passano TUTTE da /api/attivita/[id]: il modulo
  // lib/attivita.ts e' il punto di aggancio della sincronizzazione Google e
  // una PATCH diretta altrove la salterebbe.
  // -------------------------------------------------------------------------
  const aggiornaAttivita = async (attivitaId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/attivita/${attivitaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
    // Aggiornamento locale immediato: il drawer calcola "sporco" confrontando
    // la bozza con l'attivita' ricevuta, quindi senza questa scrittura
    // resterebbe "Modifiche non salvate" fino alla risposta di loadProgetto.
    const aggiornata = data as AttivitaRow;
    setProgetto((p) =>
      p
        ? {
            ...p,
            attivita: p.attivita.map((a) =>
              a.id === aggiornata.id ? { ...a, ...aggiornata } : a
            ),
          }
        : p
    );
  };

  const cambiaExtra = (attivitaId: string, patch: Partial<ExtraTask>) => {
    setExtra((prev) => ({
      ...prev,
      [attivitaId]: { ...(prev[attivitaId] ?? {}), ...patch },
    }));
  };

  const creaTask = async (sezioneId: string, titolo: string) => {
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}/attivita`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titolo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      const creata = data as AttivitaRow;
      // La sezione scelta e' uno stato locale: la fissiamo PRIMA del reload,
      // cosi' la nuova riga non fa in tempo a comparire nella prima sezione.
      // Va fatto anche per la prima sezione: "assente" significa "non ancora
      // assegnata", non "prima sezione", e una futura riorganizzazione delle
      // sezioni non deve trascinare la task altrove.
      cambiaExtra(creata.id, { sezione: sezioneId });
      await loadProgetto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di creazione.");
      // Rilanciamo: la board svuota il campo solo quando la creazione riesce,
      // altrimenti il titolo appena scritto sparirebbe insieme all'errore.
      throw err;
    }
  };

  const completaTask = async (a: AttivitaRow, completata: boolean) => {
    setError("");
    try {
      await aggiornaAttivita(a.id, {
        stato: (completata ? "COMPLETATA" : "DA_FARE") as StatoAttivita,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di aggiornamento.");
    }
  };

  // Restituisce l'esito: il drawer chiude solo dopo un'eliminazione riuscita,
  // altrimenti sparirebbe la task dallo schermo restando viva sul server.
  const eliminaAttivita = async (attivitaId: string): Promise<boolean> => {
    setError("");
    try {
      const res = await fetch(`/api/attivita/${attivitaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Errore ${res.status}`);
      }
      // Lo stato locale della task non serve piu': tenerlo farebbe ricomparire
      // sezioni e commenti se l'id venisse riusato da un'altra attivita'.
      setExtra((prev) => {
        if (!(attivitaId in prev)) return prev;
        const next = { ...prev };
        delete next[attivitaId];
        return next;
      });
      setConfirmDeleteAttivita(null);
      setSelezionataId((cur) => (cur === attivitaId ? null : cur));
      await loadProgetto();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di cancellazione.");
      setConfirmDeleteAttivita(null);
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Ticket
  // -------------------------------------------------------------------------
  const cercaTicket = useCallback(async (query: string) => {
    const seq = ++ticketSeq.current;
    setCercandoTicket(true);
    try {
      const params = new URLSearchParams({
        q: query,
        stato: "TUTTI",
        priorita: "TUTTE",
        operatore: "TUTTI",
        pagina: "1",
        paginaSize: "10",
      });
      const res = await fetch(`/api/tickets?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (seq === ticketSeq.current) {
          setTicketRisultati((data.tickets ?? []) as TicketRow[]);
        }
      }
    } catch {
      // Ignora
    } finally {
      if (seq === ticketSeq.current) setCercandoTicket(false);
    }
  }, []);

  useEffect(() => {
    if (!showTicketSearch) return;
    const t = setTimeout(() => cercaTicket(ticketQuery), 250);
    return () => clearTimeout(t);
  }, [showTicketSearch, ticketQuery, cercaTicket]);

  const collegaTicket = async (ticketId: string) => {
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      loadProgetto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di collegamento.");
    }
  };

  const scollegaTicket = async (ticketId: string) => {
    setError("");
    try {
      const res = await fetch(
        `/api/progetti/${id}/tickets?ticket_id=${encodeURIComponent(ticketId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Errore ${res.status}`);
      }
      loadProgetto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di scollegamento.");
    }
  };

  // -------------------------------------------------------------------------
  // Derivazioni
  // -------------------------------------------------------------------------
  const tempi = useMemo(() => riepilogoTempi(progetto?.tickets ?? []), [progetto]);

  const attivitaSelezionata = useMemo(
    () => progetto?.attivita.find((a) => a.id === selezionataId) ?? null,
    [progetto, selezionataId]
  );

  // Se la task selezionata non c'e' piu' (cancellata altrove o ricaricamento
  // andato a vuoto) la selezione va azzerata: senza, `attivitaSelezionata`
  // resta null e il drawer semplicemente non compare, ma la selezionataId
  // vecchia farebbe riapparire il drawer se un altro reload la ritrovasse.
  useEffect(() => {
    if (selezionataId && progetto && !attivitaSelezionata) setSelezionataId(null);
  }, [selezionataId, progetto, attivitaSelezionata]);

  if (loading && !progetto) {
    return (
      <div className="flex h-full items-center justify-center bg-crema">
        <p className="text-sm text-caldo-testo">Caricamento progetto…</p>
      </div>
    );
  }

  if (!progetto) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-crema">
        <p className="text-sm text-caldo-testo">{error || "Progetto non trovato."}</p>
        <button type="button" onClick={onBack} className={BTN_SECONDARIO}>
          Torna ai progetti
        </button>
      </div>
    );
  }

  const collegatiIds = new Set(progetto.tickets.map((t) => t.id));
  const completate = progetto.attivita.filter((a) => a.stato === "COMPLETATA").length;
  const percentuale = percentualeCompletamento(progetto.attivita.length, completate);

  // Ticket in corso / risolti: due numeri che il dettaglio del tempo non da'.
  const ticketAperti = progetto.tickets.filter(
    (t) => t.stato === "NUOVO" || t.stato === "IN_CORSO"
  ).length;

  return (
    <div className="flex h-full flex-col bg-crema text-inchiostro">
      <header className="flex flex-wrap items-center gap-2.5 bg-crema px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Progetti
        </button>
        <span className="truncate text-lg font-bold tracking-tight text-inchiostro">
          {progetto.nome}
        </span>
        <span className="text-xs font-bold text-caldo-testo">{progetto.codice}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={apriModificaProgetto} className={BTN_SECONDARIO}>
            <EditIcon className="h-3.5 w-3.5" />
            Modifica
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={eliminaProgetto}
                className="inline-flex items-center gap-1.5 rounded-full bg-pericolo px-4 py-2 text-sm font-semibold text-white transition hover:bg-pericolo-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pericolo focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
              >
                Conferma eliminazione
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={BTN_SECONDARIO}>
                Annulla
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-caldo-testo transition hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
              title="Elimina progetto"
              aria-label="Elimina progetto"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-8 pt-2">
        {error && (
          <p className="mb-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
            {error}
          </p>
        )}

        {/* ================================================================== */}
        {/* Riga alta: dettagli + tempi                                        */}
        {/* ================================================================== */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Dettagli progetto --------------------------------------------- */}
          <div className="lg:col-span-7 xl:col-span-8">
            {editProgetto ? (
              <form onSubmit={salvaProgetto} className="h-full rounded-card bg-white p-6">
                <h2 className="mb-4 font-display text-lg font-semibold text-inchiostro">
                  Modifica progetto
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="lg:col-span-2">
                    <label className={LABEL_CLASS}>Nome *</label>
                    <input
                      value={formProgetto.nome}
                      onChange={(e) => setFormProgetto({ ...formProgetto, nome: e.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Cliente *</label>
                    <select
                      value={formProgetto.cliente_id}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, cliente_id: e.target.value })
                      }
                      className={INPUT_CLASS}
                      required
                    >
                      <option value="">Seleziona un cliente…</option>
                      {clienti.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.ragione_sociale}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Responsabile</label>
                    <input
                      value={formProgetto.responsabile}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, responsabile: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Stato</label>
                    <select
                      value={formProgetto.stato}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, stato: e.target.value as StatoProgetto })
                      }
                      className={INPUT_CLASS}
                    >
                      {STATI_PROGETTO_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Priorità</label>
                    <select
                      value={formProgetto.priorita}
                      onChange={(e) =>
                        setFormProgetto({
                          ...formProgetto,
                          priorita: e.target.value as "BASSA" | "MEDIA" | "ALTA",
                        })
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="BASSA">Bassa</option>
                      <option value="MEDIA">Media</option>
                      <option value="ALTA">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Data inizio</label>
                    <input
                      type="datetime-local"
                      value={formProgetto.data_inizio}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, data_inizio: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Data fine</label>
                    <input
                      type="datetime-local"
                      value={formProgetto.data_fine}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, data_fine: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className={LABEL_CLASS}>Descrizione</label>
                    <textarea
                      value={formProgetto.descrizione}
                      onChange={(e) =>
                        setFormProgetto({ ...formProgetto, descrizione: e.target.value })
                      }
                      rows={2}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className={LABEL_CLASS}>Note</label>
                    <textarea
                      value={formProgetto.note}
                      onChange={(e) => setFormProgetto({ ...formProgetto, note: e.target.value })}
                      rows={2}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button type="submit" disabled={savingProgetto} className={BTN_PRIMARIO}>
                    {savingProgetto ? "Salvataggio…" : "Salva"}
                  </button>
                  <button type="button" onClick={() => setEditProgetto(false)} className={BTN_SECONDARIO}>
                    Annulla
                  </button>
                </div>
              </form>
            ) : (
              <section
                aria-labelledby="dettagli-progetto"
                className="h-full rounded-card bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-peach text-inchiostro">
                      <FolderIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caldo-testo">
                        Dettagli progetto
                      </p>
                      <h1
                        id="dettagli-progetto"
                        className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-inchiostro"
                      >
                        {progetto.nome}
                      </h1>
                      <p className="mt-0.5 text-sm text-caldo-testo">
                        {progetto.cliente_ragione_sociale}
                        {progetto.responsabile ? ` · ${progetto.responsabile}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PriorityBadge priorita={progetto.priorita} />
                    <ProgettoStatusBadge stato={progetto.stato} />
                  </div>
                </div>

                {progetto.descrizione && (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-caldo-testo">
                    {progetto.descrizione}
                  </p>
                )}

                {/* Avanzamento: vedi la nota storica in ProgettoLista/card.
                    Zero attivita' non e' "0% fatto". */}
                <div className="mt-5 border-t border-crema-bordo pt-4">
                  {percentuale === null ? (
                    <p className="text-sm text-caldo-testo">Nessuna attività</p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-caldo-testo">
                          {completate} / {progetto.attivita.length} attività completate
                        </span>
                        <span className="tabular text-sm font-bold text-inchiostro">
                          {percentuale}%
                        </span>
                      </div>
                      <div
                        className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${TRACCIA_CARD}`}
                        role="progressbar"
                        aria-valuenow={percentuale}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Avanzamento del progetto"
                      >
                        <div
                          className={`h-full rounded-full ${RIEMPIMENTO_CARD}`}
                          style={{ width: `${percentuale}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-crema-bordo pt-4 sm:grid-cols-4">
                  <div>
                    <p className={LABEL_CLASS}>Inizio</p>
                    <p className="text-sm text-inchiostro">{formatData(progetto.data_inizio)}</p>
                  </div>
                  <div>
                    <p className={LABEL_CLASS}>Fine</p>
                    <p className="text-sm text-inchiostro">{formatData(progetto.data_fine)}</p>
                  </div>
                  <div>
                    <p className={LABEL_CLASS}>Task</p>
                    <p className="tabular text-sm text-inchiostro">{progetto.attivita.length}</p>
                  </div>
                  <div>
                    <p className={LABEL_CLASS}>Ticket aperti</p>
                    <p className="tabular text-sm text-inchiostro">
                      {ticketAperti}
                      <span className="text-caldo-testo"> / {progetto.tickets.length}</span>
                    </p>
                  </div>
                </div>

                {progetto.note && (
                  <div className="mt-5 border-t border-crema-bordo pt-4">
                    <p className={LABEL_CLASS}>Note</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-caldo-testo">
                      {progetto.note}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Tempi --------------------------------------------------------- */}
          <div className="lg:col-span-5 xl:col-span-4">
            <section
              aria-labelledby="titolo-tempi"
              className="flex h-full flex-col rounded-card bg-white"
            >
              <div className="flex items-center gap-2 border-b border-crema-bordo px-5 py-3.5">
                <TimerIcon className="h-4 w-4 shrink-0 text-caldo-testo" />
                <h2
                  id="titolo-tempi"
                  className="font-display text-lg font-semibold text-inchiostro"
                >
                  Tempi
                </h2>
                <span className="ml-auto text-[11px] font-medium text-caldo-testo">
                  da ticket collegati
                </span>
              </div>

              <div className="p-5">
                {/* Totale: il numero che si cerca, in scala grande. */}
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className={LABEL_CLASS}>Registrato</p>
                    <p className="font-display text-3xl font-semibold tracking-tight text-inchiostro">
                      {formatDurata(tempi.totale)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={LABEL_CLASS}>Stimato</p>
                    <p className="tabular text-sm font-semibold text-caldo-testo">
                      {formatDurata(tempi.stimato)}
                    </p>
                  </div>
                </div>

                {/* Barra stimato vs registrato: solo se c'e' una stima. Una
                    barra senza metro direbbe "sei in ritardo" senza sapere
                    rispetto a cosa. Il riempimento oltre il 100% si clampa. */}
                {tempi.stimato > 0 ? (
                  <div className="mt-3">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-inchiostro/10"
                      role="progressbar"
                      aria-valuenow={Math.min(100, Math.round((tempi.totale / tempi.stimato) * 100))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Tempo registrato rispetto allo stimato: ${formatDurata(tempi.totale)} su ${formatDurata(tempi.stimato)}`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          tempi.totale > tempi.stimato ? "bg-stato-urgenza-testo" : "bg-avanzamento"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((tempi.totale / tempi.stimato) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-caldo-testo">
                      {Math.round((tempi.totale / tempi.stimato) * 100)}% dello stimato
                      {tempi.totale > tempi.stimato && " · oltre la stima"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-caldo-testo">
                    Nessuna stima inserita sui ticket: la barra compare quando c&apos;è.
                  </p>
                )}

                {/* Per operatore ------------------------------------------- */}
                <div className="mt-5 border-t border-crema-bordo pt-4">
                  <p className={LABEL_CLASS}>Per operatore</p>

                  {tempi.perOperatore.length === 0 ? (
                    <div className="mt-1 rounded-control bg-crema-scuro px-4 py-3">
                      <p className="text-sm text-caldo-testo">
                        Nessun tempo registrato sui ticket collegati.
                      </p>
                      <p className="mt-1 text-[11px] text-caldo-testo/80">
                        I tempi si inseriscono dal dettaglio del ticket.
                      </p>
                    </div>
                  ) : (
                    <ul className="mt-1 space-y-3">
                      {tempi.perOperatore.map((o) => {
                        // Larghezza relativa al maggiore: la barra confronta le
                        // persone fra loro, non con il totale (che include anche
                        // chi non compare qui).
                        const max = tempi.perOperatore[0]?.minuti || 1;
                        return (
                          <li key={o.nome} className="flex items-center gap-2.5">
                            <span
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-[10px] font-semibold text-lime-testo"
                              aria-hidden="true"
                            >
                              {iniziali(o.nome)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-medium text-inchiostro">
                                  {o.nome}
                                </span>
                                <span className="tabular shrink-0 text-xs font-semibold text-inchiostro">
                                  {formatDurata(o.minuti)}
                                </span>
                              </div>
                              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-inchiostro/10">
                                <div
                                  className="h-full rounded-full bg-inchiostro/60"
                                  style={{ width: `${Math.max(4, (o.minuti / max) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Piede: da dove vengono i numeri. Senza questa riga il totale
                  sembrerebbe "il tempo del progetto", che oggi non esiste. */}
              <div className="mt-auto border-t border-crema-bordo px-5 py-3">
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-caldo-testo">
                  <AlertCircleIcon className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    Tempi derivati da {tempi.ticketConTempo} di {tempi.ticketTotale} ticket
                    collegati. Il tempo delle singole task non è ancora tracciato.
                  </span>
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* ================================================================== */}
        {/* Riga bassa: task                                                   */}
        {/* ================================================================== */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="overflow-hidden rounded-card bg-white">
              <SectionBar
                titolo="Task"
                icona={ListChecksIcon}
                conteggio={progetto.attivita.length}
              >
                <span className="text-[11px] font-medium text-caldo-testo">
                  {completate} completate
                </span>
              </SectionBar>

              <ProgettoTaskBoard
                attivita={progetto.attivita}
                operatori={operatori}
                sezioni={sezioni}
                extra={extra}
                selezionataId={selezionataId}
                confermaEliminaId={confirmDeleteAttivita}
                onSeleziona={(aid) => {
                  setSelezionataId(aid);
                  setConfirmDeleteAttivita(null);
                }}
                onCambiaExtra={cambiaExtra}
                onCambiaSezioni={setSezioni}
                onCreaTask={creaTask}
                onCompleta={completaTask}
                onElimina={(a) => {
                  if (confirmDeleteAttivita === a.id) eliminaAttivita(a.id);
                  else setConfirmDeleteAttivita(a.id);
                }}
                onAnnullaElimina={() => setConfirmDeleteAttivita(null)}
              />
            </div>
          </div>

          {/* Ticket collegati --------------------------------------------- */}
          <div className="lg:col-span-4">
            <div className="overflow-hidden rounded-card bg-white">
              <SectionBar
                titolo="Ticket collegati"
                icona={TicketIcon}
                conteggio={progetto.tickets.length}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowTicketSearch((v) => !v);
                    setTicketQuery("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-semibold text-inchiostro transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Collega
                </button>
              </SectionBar>

              {showTicketSearch && (
                <div className="border-b border-crema-bordo bg-crema-scuro p-5">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
                    <input
                      value={ticketQuery}
                      onChange={(e) => setTicketQuery(e.target.value)}
                      placeholder="Cerca ticket…"
                      className="w-full rounded-full border border-crema-contorno bg-white py-1.5 pl-10 pr-4 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    />
                  </div>
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    {cercandoTicket ? (
                      <p className="p-3 text-center text-xs text-caldo-testo">Ricerca…</p>
                    ) : ticketRisultati.length === 0 ? (
                      <p className="p-3 text-center text-xs text-caldo-testo">
                        Nessun ticket trovato.
                      </p>
                    ) : (
                      ticketRisultati.map((t) => {
                        const gia = collegatiIds.has(t.id);
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 border-b border-crema-bordo py-2 last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-inchiostro">
                                {t.numero} · {t.cliente}
                              </p>
                              <p className="truncate text-[11px] text-caldo-testo">
                                {t.sommario_problema}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={gia}
                              onClick={() => collegaTicket(t.id)}
                              className="shrink-0 rounded-full bg-inchiostro px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema-scuro disabled:opacity-40"
                            >
                              {gia ? "Collegato" : "Collega"}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {progetto.tickets.length === 0 ? (
                <p className="p-8 text-center text-sm text-caldo-testo">
                  Nessun ticket collegato.
                </p>
              ) : (
                <ul>
                  {progetto.tickets.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 border-b border-crema-bordo px-5 py-3 last:border-0"
                    >
                      <Link
                        href={`/tickets/${t.id}`}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-peach text-inchiostro">
                          <TicketIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-inchiostro">
                            {t.numero}
                          </p>
                          <p className="truncate text-[11px] text-caldo-testo">
                            {t.sommario_problema}
                          </p>
                        </div>
                        {t.tempo_effettivo_minuti ? (
                          <span className="tabular shrink-0 text-[11px] font-semibold text-caldo-testo">
                            {formatDurata(t.tempo_effettivo_minuti)}
                          </span>
                        ) : null}
                      </Link>
                      <button
                        type="button"
                        onClick={() => scollegaTicket(t.id)}
                        className="shrink-0 rounded-full border border-crema-contorno bg-white px-3 py-1 text-[11px] font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      >
                        Scollega
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ==================================================================== */}
      {/* Drawer della task                                                    */}
      {/* ==================================================================== */}
      {attivitaSelezionata && (
        <ProgettoTaskDrawer
          // La key reseziona il componente: senza, cambiando task resterebbero
          // i campi della precedente.
          key={attivitaSelezionata.id}
          progetto={progetto}
          attivita={attivitaSelezionata}
          operatori={operatori}
          extra={extra[attivitaSelezionata.id] ?? {}}
          onChangeExtra={(patch) => cambiaExtra(attivitaSelezionata.id, patch)}
          onSave={(patch) => aggiornaAttivita(attivitaSelezionata.id, patch)}
          // Chiude solo se la DELETE e' andata a buon fine: su errore il
          // drawer resta aperto (con il messaggio) invece di far credere che
          // la task sia sparita.
          onDelete={() => eliminaAttivita(attivitaSelezionata.id)}
          onClose={() => setSelezionataId(null)}
        />
      )}
    </div>
  );
}
