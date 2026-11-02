"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LoaderIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  UserIcon,
  ClockIcon,
  HourglassIcon,
  MailIcon,
  RefreshIcon,
} from "@/components/icons";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import { useOperatore } from "@/lib/operatore-client";
import { usePolling } from "@/lib/usePolling";
import { caricaApi } from "@/lib/api-cache";
import type { Priorita, StatoTicket } from "@/lib/types";

interface OperatorStats {
  id: string;
  nome: string;
  email: string;
  ruolo: string;
  attivo: boolean;
  ultimo_accesso: string | null;
  ticket_in_corso: number;
  ticket_nuovi: number;
  ticket_risolti: number;
  ticket_chiusi: number;
  ticket_chiusi_settimana: number;
  ticket_totali: number;
  ticket_recenti: {
    id: string;
    numero: string;
    sommario_problema: string;
    priorita: string;
    stato: string;
    data_aggiornamento: string;
  }[];
  ticket_arretrati: {
    id: string;
    numero: string;
    sommario_problema: string;
    priorita: string;
    stato: string;
    data_aggiornamento: string;
    giorni_fermi: number;
  }[];
  ticket_arretrati_count: number;
}

function getStatusLabel(op: OperatorStats): { label: string; color: string; dot: string } {
  const activeTickets = op.ticket_in_corso + op.ticket_nuovi;
  if (!op.attivo)
    return {
      label: "Inattivo",
      color: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
      dot: "bg-stato-neutro-testo",
    };
  if (activeTickets === 0)
    return {
      label: "Disponibile",
      color: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
      dot: "bg-stato-ok-testo",
    };
  if (activeTickets <= 3)
    return {
      label: "Attivo",
      color: "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo",
      dot: "bg-stato-info-testo",
    };
  return {
    label: "Impegnato",
    color: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
    dot: "bg-stato-attesa-testo",
  };
}

function getStaleColor(giorni: number): { bg: string; text: string; border: string; label: string } {
  if (giorni >= 7)
    return {
      bg: "bg-stato-urgenza-bg",
      text: "text-stato-urgenza-testo",
      border: "border-stato-urgenza-bordo",
      label: "Critico",
    };
  if (giorni >= 5)
    return {
      bg: "bg-stato-attesa-bg",
      text: "text-stato-attesa-testo",
      border: "border-stato-attesa-bordo",
      label: "Attenzione",
    };
  return {
    bg: "bg-stato-neutro-bg",
    text: "text-stato-neutro-testo",
    border: "border-stato-neutro-bordo",
    label: "In ritardo",
  };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

// L'icona a stella e' l'unico segno grafico che qui NON significa stato: dice
// quanto e' maturata la produttivita' di un operatore. Piena va in inchiostro
// (il colore delle azioni e dei dati forti), vuota nel grigio caldo tenue.
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className={`h-4 w-4 ${filled ? "text-inchiostro" : "text-caldo-testo/40"}`} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function AdminDashboardPage() {
  // L'operatore arriva dalla cache condivisa: la richiesta e' una sola per
  // caricamento, condivisa con la Sidebar.
  const { operatore: sessione, caricamento: caricamentoSessione } = useOperatore();
  const currentOperator = sessione;
  const checking = caricamentoSessione;
  const isAdmin = sessione?.ruolo === "admin";

  const [operators, setOperators] = useState<OperatorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seqRef = useRef(0);

  const fetchOperators = useCallback(async (forza = false) => {
    const seq = ++seqRef.current;
    try {
      const data = await caricaApi<{ operatori: OperatorStats[] }>("/api/operatori/stats", { forza });
      if (seq === seqRef.current) {
        setOperators(data.operatori);
        // Funzionale: cosi' la callback non dipende da `selectedId` e non viene
        // ricreata a ogni selezione (era la causa del poll che ripartiva da zero).
        setSelectedId((prev) => prev ?? data.operatori[0]?.id ?? null);
      }
    } catch {
      if (seq === seqRef.current) setError("Impossibile caricare le statistiche operatori.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchOperators();
  }, [isAdmin, fetchOperators]);

  // Un solo poll, fermo a scheda nascosta, con ripresa immediata al ritorno.
  // Il poll va in rete per definizione: senza `forza` leggerebbe la cache.
  usePolling(
    useCallback(() => fetchOperators(true), [fetchOperators]),
    30000,
    isAdmin
  );

  const selected = operators.find((o) => o.id === selectedId) ?? null;

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!currentOperator) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-crema-scuro">
            <UserIcon className="h-6 w-6 text-caldo-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-caldo-testo">Devi effettuare il login per accedere a questa pagina.</p>
          <a href="/login?redirect=/admin/dashboard" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-caldo-testo">Questa pagina è accessibile solo con le credenziali di amministratore.</p>
        </div>
      </div>
    );
  }

  const totalInCorso = operators.reduce((s, o) => s + o.ticket_in_corso, 0);
  const totalNuovi = operators.reduce((s, o) => s + o.ticket_nuovi, 0);
  const totalChiusi = operators.reduce((s, o) => s + o.ticket_chiusi, 0);
  const operatoriImpegnati = operators.filter((o) => o.attivo && (o.ticket_in_corso + o.ticket_nuovi) > 3).length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-7xl">
        {/* Breadcrumb sopra la testata, non dentro: e' navigazione, non parte
            del titolo. Occupa il posto in cui altrove sta l'eyebrow, quindi
            qui l'eyebrow non si passa — due etichette piccole impilate
            sarebbero rumore. */}
        <nav aria-label="Percorso" className="mb-2 flex items-center gap-2 text-sm text-caldo-testo">
          <Link href="/admin" className="cursor-pointer transition-colors duration-200 hover:text-inchiostro">Operatori</Link>
          <ChevronRightIcon className="h-3 w-3" />
          <span className="font-medium text-inchiostro">Dashboard</span>
        </nav>

        <PageHeader
          titolo="Dashboard Amministratori"
          sottotitolo="Panoramica in tempo reale dello stato degli operatori e dei ticket."
          azioni={
            <button onClick={() => fetchOperators(true)} className="flex cursor-pointer items-center gap-2 self-start rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro">
              <RefreshIcon className="h-4 w-4" />
              Aggiorna
            </button>
          }
        />

        {/* Global Stats — la tinta dice quanto pesa la metrica (lavorazione
            aperta, lavoro nuovo, lavoro concluso, carico degli operatori),
            il numero resta in inchiostro: e' il dato, non un allarme. */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-panel border border-stato-malva-bordo bg-stato-malva-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stato-malva-testo">Ticket In Corso</p>
            <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{totalInCorso}</p>
          </div>
          <div className="rounded-panel border border-stato-info-bordo bg-stato-info-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stato-info-testo">Nuovi Ticket</p>
            <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{totalNuovi}</p>
          </div>
          <div className="rounded-panel border border-stato-ok-bordo bg-stato-ok-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stato-ok-testo">Ticket Chiusi</p>
            <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{totalChiusi}</p>
          </div>
          <div className="rounded-panel border border-stato-attesa-bordo bg-stato-attesa-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-stato-attesa-testo">Operatori Impegnati</p>
            <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{operatoriImpegnati} / {operators.filter(o => o.attivo).length}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              aria-label="Chiudi il messaggio di errore"
              className="ml-auto cursor-pointer text-stato-urgenza-testo/70 transition-colors duration-200 hover:text-stato-urgenza-testo"
            >
              &times;
            </button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Left: Operator List */}
          <div className="w-full shrink-0 lg:w-96">
            <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
              <SectionBar titolo="Operatori" icona={UserIcon} conteggio={operators.length} />
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
                </div>
              ) : operators.length === 0 ? (
                <div className="py-12 text-center text-sm text-caldo-testo">Nessun operatore trovato.</div>
              ) : (
                <div className="max-h-[600px] divide-y divide-crema-bordo overflow-y-auto">
                  {operators.map((op) => {
                    const status = getStatusLabel(op);
                    const isSelected = op.id === selectedId;
                    return (
                      <button
                        key={op.id}
                        onClick={() => setSelectedId(op.id)}
                        className={`w-full cursor-pointer border-l-2 px-5 py-3 text-left transition-colors duration-200 ${
                          isSelected
                            ? "border-l-inchiostro bg-crema-scuro"
                            : "border-l-transparent hover:bg-crema-scuro"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${op.attivo ? "bg-inchiostro text-white" : "bg-stato-neutro-bg text-stato-neutro-testo"}`}>
                              {op.nome.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${status.dot}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-inchiostro">{op.nome}</span>
                              {op.ruolo === "admin" && (
                                <span className="inline-flex items-center rounded-full border border-stato-malva-bordo bg-stato-malva-bg px-1.5 py-0.5 text-[10px] font-medium text-stato-malva-testo">Admin</span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${status.color}`}>
                                {status.label}
                              </span>
                              <span className="text-[11px] text-caldo-testo">
                                {op.ticket_in_corso + op.ticket_nuovi} ticket attivi
                              </span>
                              {op.ticket_arretrati_count > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-stato-urgenza-bordo bg-stato-urgenza-bg px-1.5 py-0.5 text-[10px] font-semibold text-stato-urgenza-testo">
                                  <AlertTriangleIcon className="h-2.5 w-2.5" />
                                  {op.ticket_arretrati_count} arretrati
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected Operator Detail */}
          <div className="min-w-0 flex-1">
            {selected ? (
              <div className="space-y-6">
                {/* Profile Card */}
                <div className="rounded-card border border-crema-contorno bg-white p-6">
                  <div className="flex items-start gap-5">
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-inchiostro text-xl font-bold text-white">
                        {selected.nome.charAt(0).toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${getStatusLabel(selected).dot}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-inchiostro">{selected.nome}</h2>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusLabel(selected).color}`}>
                          {getStatusLabel(selected).label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-caldo-testo">
                        {selected.ruolo === "admin" ? "Amministratore" : "Operatore di Supporto"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-caldo-testo">
                        <span className="flex items-center gap-1.5">
                          <MailIcon className="h-4 w-4 text-caldo-testo" />
                          {selected.email}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <ClockIcon className="h-4 w-4 text-caldo-testo" />
                          {selected.ultimo_accesso ? `Ultimo accesso: ${formatRelativeTime(selected.ultimo_accesso)}` : "Mai connesso"}
                        </span>
                      </div>
                    </div>
                    {/* Stars */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <StarIcon key={i} filled={i <= Math.round(selected.ticket_chiusi / Math.max(selected.ticket_totali, 1) * 5)} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-panel border border-stato-malva-bordo bg-stato-malva-bg p-4 text-center">
                    <p className="tabular text-3xl font-bold text-inchiostro">{selected.ticket_in_corso}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-stato-malva-testo">In Corso</p>
                  </div>
                  <div className="rounded-panel border border-stato-ok-bordo bg-stato-ok-bg p-4 text-center">
                    <p className="tabular text-3xl font-bold text-inchiostro">{selected.ticket_chiusi}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-stato-ok-testo">Chiusi</p>
                  </div>
                  <div className="rounded-panel border border-stato-neutro-bordo bg-stato-neutro-bg p-4 text-center">
                    <p className="tabular text-3xl font-bold text-inchiostro">{selected.ticket_totali > 0 ? Math.round((selected.ticket_chiusi / selected.ticket_totali) * 100) : 0}%</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-stato-neutro-testo">Media Risoluzione</p>
                  </div>
                </div>

                {/* Stale Tickets Warning */}
                {selected.ticket_arretrati_count > 0 && (
                  <div className={`overflow-hidden rounded-card border ${
                    selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                      ? "border-stato-urgenza-bordo bg-stato-urgenza-bg"
                      : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                        ? "border-stato-attesa-bordo bg-stato-attesa-bg"
                        : "border-stato-neutro-bordo bg-stato-neutro-bg"
                  }`}>
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                          selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                            ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
                            : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                              ? "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo"
                              : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"
                        }`}>
                          <AlertTriangleIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${
                            selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                              ? "text-stato-urgenza-testo"
                              : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                                ? "text-stato-attesa-testo"
                                : "text-stato-neutro-testo"
                          }`}>
                            Ticket Arretrati ({selected.ticket_arretrati_count})
                          </h3>
                          <p className={`mt-0.5 text-xs ${
                            selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                              ? "text-stato-urgenza-testo"
                              : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                                ? "text-stato-attesa-testo"
                                : "text-stato-neutro-testo"
                          }`}>
                            Ticket assegnati senza aggiornamento da oltre 3 giorni
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-crema-bordo">
                      {selected.ticket_arretrati.map((t) => {
                        const stale = getStaleColor(t.giorni_fermi);
                        return (
                          <Link
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            className={`flex cursor-pointer items-center justify-between px-5 py-3 transition-colors duration-200 hover:bg-crema-scuro ${stale.bg}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-inchiostro">{t.numero}</span>
                                <PriorityBadge priorita={t.priorita as Priorita} />
                                <StatusBadge stato={t.stato as StatoTicket} />
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stale.bg} ${stale.text} ${stale.border}`}>
                                  {stale.label}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-sm text-caldo-testo">{t.sommario_problema}</p>
                            </div>
                            <div className="ml-4 flex shrink-0 items-center gap-1.5">
                              <ClockIcon className={`h-4 w-4 ${stale.text}`} />
                              <span className={`tabular text-sm font-bold ${stale.text}`}>
                                {t.giorni_fermi}g
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Tickets */}
                <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
                  <SectionBar
                    titolo="Ticket attualmente in lavorazione"
                    icona={HourglassIcon}
                    conteggio={selected.ticket_recenti.length}
                  />
                  <p className="border-b border-crema-bordo px-5 pb-3 text-xs text-caldo-testo">
                    Tutti i ticket assegnati attualmente in lavorazione per {selected.nome}.
                  </p>
                  {selected.ticket_recenti.length === 0 ? (
                    <div className="py-8 text-center text-sm text-caldo-testo">
                      Nessun ticket attualmente in lavorazione.
                    </div>
                  ) : (
                    <div className="divide-y divide-crema-bordo">
                      {selected.ticket_recenti.map((t) => (
                        <Link
                          key={t.id}
                          href={`/tickets/${t.id}`}
                          className="flex cursor-pointer items-center justify-between px-5 py-3 transition-colors duration-200 hover:bg-crema-scuro"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-inchiostro">{t.numero}</span>
                              <PriorityBadge priorita={t.priorita as Priorita} />
                              <StatusBadge stato={t.stato as StatoTicket} />
                            </div>
                            <p className="mt-0.5 truncate text-sm text-caldo-testo">{t.sommario_problema}</p>
                          </div>
                          <span className="ml-4 shrink-0 text-xs text-caldo-testo">{formatRelativeTime(t.data_aggiornamento)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Performance & Activity Row */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {/* Performance */}
                  <div className="rounded-card border border-crema-contorno bg-white p-5">
                    <h3 className="mb-4 text-base font-semibold text-inchiostro">Performance Settimanale</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-caldo-testo">Ticket Chiusi Questa Settimana</span>
                        <span className="tabular text-lg font-bold text-inchiostro">{selected.ticket_chiusi_settimana}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-caldo-testo">Media Ticket / Giorno</span>
                        <span className="tabular text-lg font-bold text-inchiostro">{(selected.ticket_chiusi_settimana / 7).toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-caldo-testo">Totale Ticket Gestiti</span>
                        <span className="tabular text-lg font-bold text-inchiostro">{selected.ticket_totali}</span>
                      </div>
                      <div className="mt-3 border-t border-crema-bordo pt-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-caldo-testo">Tasso di Risoluzione</span>
                          <span className={`font-semibold ${selected.ticket_totali > 0 && (selected.ticket_chiusi / selected.ticket_totali) > 0.7 ? "text-stato-ok-testo" : "text-stato-attesa-testo"}`}>
                            {selected.ticket_totali > 0 ? Math.round((selected.ticket_chiusi / selected.ticket_totali) * 100) : 0}%
                          </span>
                        </div>
                        {/* Riempimento e traccia sono elementi GRAFICI, non
                            testo: il token di stato in variante "testo" e'
                            abbastanza scuro da battere 3:1 sulla traccia
                            inchiostro/10. La traccia non e' un grigio a se':
                            e' l'inchiostro diluito, come nelle card Progetti. */}
                        <div className="mt-1.5 h-2 w-full rounded-full bg-inchiostro/10">
                          <div
                            className={`h-2 rounded-full ${selected.ticket_totali > 0 && (selected.ticket_chiusi / selected.ticket_totali) > 0.7 ? "bg-stato-ok-testo" : "bg-stato-attesa-testo"}`}
                            style={{ width: `${selected.ticket_totali > 0 ? Math.min((selected.ticket_chiusi / selected.ticket_totali) * 100, 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div className="rounded-card border border-crema-contorno bg-white p-5">
                    <h3 className="mb-4 text-base font-semibold text-inchiostro">Attività Recente</h3>
                    {selected.ticket_recenti.length === 0 ? (
                      <p className="text-sm text-caldo-testo">Nessuna attività recente.</p>
                    ) : (
                      <div className="space-y-3">
                        {selected.ticket_recenti.slice(0, 5).map((t) => (
                          <div key={t.id} className="flex items-start gap-3">
                            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.stato === "IN_CORSO" ? "bg-stato-malva-testo" : "bg-stato-attesa-testo"}`} />
                            <div className="min-w-0">
                              <p className="text-sm text-caldo-testo">
                                <span className="font-medium text-inchiostro">{t.numero}</span> - {t.sommario_problema}
                              </p>
                              <p className="mt-0.5 text-xs text-caldo-testo">{formatRelativeTime(t.data_aggiornamento)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-card border border-crema-contorno bg-white p-12 text-sm text-caldo-testo">
                Seleziona un operatore per visualizzare i dettagli.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
