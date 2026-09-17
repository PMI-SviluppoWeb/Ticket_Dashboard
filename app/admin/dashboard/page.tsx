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
  RefreshIcon,
} from "@/components/icons";
import { PriorityBadge, StatusBadge } from "@/components/badges";
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
  if (!op.attivo) return { label: "Inattivo", color: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };
  if (activeTickets === 0) return { label: "Disponibile", color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (activeTickets <= 3) return { label: "Attivo", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500" };
  return { label: "Impegnato", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
}

function getStaleColor(giorni: number): { bg: string; text: string; border: string; label: string } {
  if (giorni >= 7) return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "Critico" };
  if (giorni >= 5) return { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", label: "Attenzione" };
  return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "In ritardo" };
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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className={`h-4 w-4 ${filled ? "text-amber-400" : "text-slate-300"}`} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function AdminDashboardPage() {
  const [currentOperator, setCurrentOperator] = useState<{ nome: string; email: string; ruolo: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [operators, setOperators] = useState<OperatorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { setChecking(false); return; }
        const data = await res.json();
        setCurrentOperator(data.operator);
        setIsAdmin(data.operator?.ruolo === "admin");
      } catch { /* Not logged in */ }
      finally { setChecking(false); }
    };
    checkUser();
  }, []);

  const fetchOperators = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/operatori/stats");
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      if (seq === seqRef.current) {
        setOperators(data.operatori);
        if (!selectedId && data.operatori.length > 0) {
          setSelectedId(data.operatori[0].id);
        }
      }
    } catch {
      if (seq === seqRef.current) setError("Impossibile caricare le statistiche operatori.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (isAdmin) fetchOperators();
  }, [isAdmin, fetchOperators]);

  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(fetchOperators, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, fetchOperators]);

  const selected = operators.find((o) => o.id === selectedId) ?? null;

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!currentOperator) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <UserIcon className="h-6 w-6 text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-slate-500">Devi effettuare il login per accedere a questa pagina.</p>
          <a href="/login?redirect=/admin/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition">
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h2 className="text-lg font-semibold text-slate-900">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-slate-500">Questa pagina è accessibile solo con le credenziali di amministratore.</p>
        </div>
      </div>
    );
  }

  const totalInCorso = operators.reduce((s, o) => s + o.ticket_in_corso, 0);
  const totalNuovi = operators.reduce((s, o) => s + o.ticket_nuovi, 0);
  const totalChiusi = operators.reduce((s, o) => s + o.ticket_chiusi, 0);
  const operatoriImpegnati = operators.filter((o) => o.attivo && (o.ticket_in_corso + o.ticket_nuovi) > 3).length;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Link href="/admin" className="hover:text-blue-600 transition">Operatori</Link>
              <ChevronRightIcon className="h-3 w-3" />
              <span className="text-slate-900 font-medium">Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard Amministratori</h1>
            <p className="text-sm text-slate-500">Panoramica in tempo reale dello stato degli operatori e dei ticket.</p>
          </div>
          <button onClick={fetchOperators} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition self-start">
            <RefreshIcon className="h-4 w-4" />
            Aggiorna
          </button>
        </div>

        {/* Global Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ticket In Corso</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{totalInCorso}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Nuovi Ticket</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{totalNuovi}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ticket Chiusi</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{totalChiusi}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Operatori Impegnati</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{operatoriImpegnati} / {operators.filter(o => o.attivo).length}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Left: Operator List */}
          <div className="w-full lg:w-96 shrink-0">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Operatori ({operators.length})</h2>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoaderIcon className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : operators.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">Nessun operatore trovato.</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {operators.map((op) => {
                    const status = getStatusLabel(op);
                    const isSelected = op.id === selectedId;
                    return (
                      <button
                        key={op.id}
                        onClick={() => setSelectedId(op.id)}
                        className={`w-full text-left px-5 py-3 transition hover:bg-slate-50 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-600" : "border-l-2 border-l-transparent"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold ${op.attivo ? "bg-blue-600" : "bg-slate-400"}`}>
                              {op.nome.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${status.dot}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 truncate">{op.nome}</span>
                              {op.ruolo === "admin" && (
                                <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">Admin</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.color}`}>
                                {status.label}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {op.ticket_in_corso + op.ticket_nuovi} ticket attivi
                              </span>
                              {op.ticket_arretrati_count > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
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
          <div className="flex-1 min-w-0">
            {selected ? (
              <div className="space-y-6">
                {/* Profile Card */}
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
                  <div className="flex items-start gap-5">
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white text-xl font-bold">
                        {selected.nome.charAt(0).toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${getStatusLabel(selected).dot}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-900">{selected.nome}</h2>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusLabel(selected).color}`}>
                          {getStatusLabel(selected).label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {selected.ruolo === "admin" ? "Amministratore" : "Operatore di Supporto"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                          {selected.email}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <ClockIcon className="h-4 w-4 text-slate-400" />
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
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                    <p className="text-3xl font-bold text-blue-600">{selected.ticket_in_corso}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">In Corso</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                    <p className="text-3xl font-bold text-emerald-600">{selected.ticket_chiusi}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Chiusi</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                    <p className="text-3xl font-bold text-violet-600">{selected.ticket_totali > 0 ? Math.round((selected.ticket_chiusi / selected.ticket_totali) * 100) : 0}%</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Media Risoluzione</p>
                  </div>
                </div>

                {/* Stale Tickets Warning */}
                {selected.ticket_arretrati_count > 0 && (
                  <div className={`rounded-xl border shadow-sm overflow-hidden ${
                    selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                      ? "border-red-200 bg-red-50"
                      : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                        ? "border-orange-200 bg-orange-50"
                        : "border-amber-200 bg-amber-50"
                  }`}>
                    <div className={`px-5 py-4 ${
                      selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                        ? "bg-red-100"
                        : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                          ? "bg-orange-100"
                          : "bg-amber-100"
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                            ? "bg-red-200 text-red-700"
                            : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                              ? "bg-orange-200 text-orange-700"
                              : "bg-amber-200 text-amber-700"
                        }`}>
                          <AlertTriangleIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${
                            selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                              ? "text-red-900"
                              : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                                ? "text-orange-900"
                                : "text-amber-900"
                          }`}>
                            Ticket Arretrati ({selected.ticket_arretrati_count})
                          </h3>
                          <p className={`text-xs mt-0.5 ${
                            selected.ticket_arretrati.some(t => t.giorni_fermi >= 7)
                              ? "text-red-700"
                              : selected.ticket_arretrati.some(t => t.giorni_fermi >= 5)
                                ? "text-orange-700"
                                : "text-amber-700"
                          }`}>
                            Ticket assegnati senza aggiornamento da oltre 3 giorni
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-200/50">
                      {selected.ticket_arretrati.map((t) => {
                        const stale = getStaleColor(t.giorni_fermi);
                        return (
                          <Link
                            key={t.id}
                            href={`/tickets/${t.id}`}
                            className={`flex items-center justify-between px-5 py-3 transition hover:opacity-80 ${stale.bg}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">{t.numero}</span>
                                <PriorityBadge priorita={t.priorita as Priorita} />
                                <StatusBadge stato={t.stato as StatoTicket} />
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stale.bg} ${stale.text} ${stale.border}`}>
                                  {stale.label}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm text-slate-600 truncate">{t.sommario_problema}</p>
                            </div>
                            <div className="ml-4 flex items-center gap-1.5 shrink-0">
                              <ClockIcon className={`h-4 w-4 ${stale.text}`} />
                              <span className={`text-sm font-bold ${stale.text}`}>
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
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="text-base font-semibold text-slate-900">Ticket Attualmente in Lavorazione</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Tutti i ticket assegnati attualmente in lavorazione per {selected.nome}.</p>
                  </div>
                  {selected.ticket_recenti.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                      Nessun ticket attualmente in lavorazione.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {selected.ticket_recenti.map((t) => (
                        <Link
                          key={t.id}
                          href={`/tickets/${t.id}`}
                          className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{t.numero}</span>
                              <PriorityBadge priorita={t.priorita as Priorita} />
                              <StatusBadge stato={t.stato as StatoTicket} />
                            </div>
                            <p className="mt-0.5 text-sm text-slate-600 truncate">{t.sommario_problema}</p>
                          </div>
                          <span className="ml-4 text-xs text-slate-400 shrink-0">{formatRelativeTime(t.data_aggiornamento)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Performance & Activity Row */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  {/* Performance */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                    <h3 className="text-base font-semibold text-slate-900 mb-4">Performance Settimanale</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Ticket Chiusi Questa Settimana</span>
                        <span className="text-lg font-bold text-slate-900">{selected.ticket_chiusi}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Media Ticket / Giorno</span>
                        <span className="text-lg font-bold text-slate-900">{(selected.ticket_chiusi / 7).toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Totale Ticket Gestiti</span>
                        <span className="text-lg font-bold text-slate-900">{selected.ticket_totali}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Tasso di Risoluzione</span>
                          <span className={`font-semibold ${selected.ticket_totali > 0 && (selected.ticket_chiusi / selected.ticket_totali) > 0.7 ? "text-emerald-600" : "text-amber-600"}`}>
                            {selected.ticket_totali > 0 ? Math.round((selected.ticket_chiusi / selected.ticket_totali) * 100) : 0}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${selected.ticket_totali > 0 && (selected.ticket_chiusi / selected.ticket_totali) > 0.7 ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${selected.ticket_totali > 0 ? Math.min((selected.ticket_chiusi / selected.ticket_totali) * 100, 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                    <h3 className="text-base font-semibold text-slate-900 mb-4">Attività Recente</h3>
                    {selected.ticket_recenti.length === 0 ? (
                      <p className="text-sm text-slate-500">Nessuna attività recente.</p>
                    ) : (
                      <div className="space-y-3">
                        {selected.ticket_recenti.slice(0, 5).map((t) => (
                          <div key={t.id} className="flex items-start gap-3">
                            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.stato === "IN_CORSO" ? "bg-blue-500" : "bg-amber-500"}`} />
                            <div className="min-w-0">
                              <p className="text-sm text-slate-700">
                                <span className="font-medium">{t.numero}</span> - {t.sommario_problema}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">{formatRelativeTime(t.data_aggiornamento)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
                Seleziona un operatore per visualizzare i dettagli.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
