"use client";

import { useEffect, useMemo, useState } from "react";
import type { Priorita, StatoTicket, Ticket } from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/components/badges";
import {
  InfoIcon,
  SparklesIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from "@/components/icons";

const STATI_MAP: Record<StatoTicket, string> = {
  NUOVO: "New",
  IN_CORSO: "In Progress",
  RISOLTO: "Resolved",
  CHIUSO: "Closed",
};

const PRIORITA_MAP: Record<Priorita, string> = {
  BASSA: "Low",
  MEDIA: "Medium",
  ALTA: "High",
};

const STATUS_OPTIONS: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];
const PRIORITY_OPTIONS: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

interface TicketDetailProps {
  ticket: Ticket;
  onUpdate: (id: string, patch: Partial<Ticket>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export default function TicketDetail({ ticket, onUpdate, onDelete, onClose }: TicketDetailProps) {
  const [note, setNote] = useState(ticket.note ?? "");
  const [operatore, setOperatore] = useState(ticket.operatore ?? "");
  const [selectedStato, setSelectedStato] = useState<StatoTicket>(ticket.stato);
  const [selectedPriorita, setSelectedPriorita] = useState<Priorita>(ticket.priorita);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNote(ticket.note ?? "");
    setOperatore(ticket.operatore ?? "");
    setSelectedStato(ticket.stato);
    setSelectedPriorita(ticket.priorita);
    setSaved(false);
    setError("");
  }, [ticket.id, ticket.note, ticket.operatore, ticket.stato, ticket.priorita]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onUpdate(ticket.id, {
        stato: selectedStato,
        priorita: selectedPriorita,
        note,
        operatore: operatore || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNote(ticket.note ?? "");
    setOperatore(ticket.operatore ?? "");
    setSelectedStato(ticket.stato);
    setSelectedPriorita(ticket.priorita);
    setError("");
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Edit Ticket{" "}
            <span className="ml-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-600">
              {ticket.numero}
            </span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Aggiorna i dettagli per {ticket.cliente}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvataggio...
              </>
            ) : saved ? (
              <>
                <CheckCircleIcon className="h-4 w-4" />
                Salvato!
              </>
            ) : (
              "Salva Modifiche"
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left column - Form */}
          <div className="space-y-5 xl:col-span-2">
            {/* Ticket Classification */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h2 className="mb-4 text-sm font-bold text-slate-800">Classificazione Ticket</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Stato del Ticket
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <select
                      value={selectedStato}
                      onChange={(e) => setSelectedStato(e.target.value as StatoTicket)}
                      className="w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATI_MAP[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Priorità
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <select
                      value={selectedPriorita}
                      onChange={(e) => setSelectedPriorita(e.target.value as Priorita)}
                      className="w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITA_MAP[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Taken / Internal Notes */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h2 className="mb-4 text-sm font-bold text-slate-800">
                Azioni Intraprese / Note Interne
              </h2>
              <div className="rounded-lg bg-slate-100 p-0.5">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Descrivi le azioni intraprese per risolvere il problema..."
                  className="w-full rounded-lg border-0 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Operator Assignment */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h2 className="mb-4 text-sm font-bold text-slate-800">Assegnazione Operatore</h2>
              <div className="rounded-lg bg-slate-100 p-0.5">
                <input
                  value={operatore}
                  onChange={(e) => setOperatore(e.target.value)}
                  placeholder="Nome operatore (lascia vuoto per liberare)"
                  className="w-full rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Resolution Details */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h2 className="mb-4 text-sm font-bold text-slate-800">Dettagli Risoluzione</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Telefono
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <input
                      value={ticket.telefono ?? ""}
                      readOnly
                      className="w-full rounded-lg border-0 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Email
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <input
                      value={ticket.email ?? ""}
                      readOnly
                      className="w-full rounded-lg border-0 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Section */}
            {ticket.messaggi.length > 0 && (
              <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
                <h2 className="mb-4 text-sm font-bold text-slate-800">
                  Messaggi ({ticket.messaggi.length})
                </h2>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {ticket.messaggi.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.ruolo === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                          m.ruolo === "user"
                            ? "rounded-br-sm bg-blue-600 text-white"
                            : "rounded-bl-sm bg-slate-100 text-slate-700"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.contenuto}</p>
                        <p
                          className={`mt-1.5 text-[10px] ${
                            m.ruolo === "user" ? "text-blue-200" : "text-slate-400"
                          }`}
                        >
                          {m.ruolo === "user" ? "Utente" : "Assistente"} · {m.data_creazione}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column - Context + AI */}
          <div className="space-y-5">
            {/* Ticket Context */}
            <div className="rounded-xl bg-slate-100 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <InfoIcon className="h-5 w-5 text-slate-600" />
                <h3 className="text-sm font-bold text-slate-800">Contesto Ticket</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    ID Ticket
                  </p>
                  <span className="mt-1 inline-block rounded-md bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm">
                    {ticket.numero}
                  </span>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Nome Cliente
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-700">{ticket.cliente}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Problema Originale
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600 leading-relaxed">
                    {ticket.sommario_problema}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Segnalato il
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{ticket.data_creazione}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Modulo Software
                  </p>
                  <span className="mt-1 inline-block rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {ticket.modulo_software}
                  </span>
                </div>

                {ticket.operatore && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Operatore Assegnato
                    </p>
                    <span className="mt-1 inline-block rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      {ticket.operatore}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* AI Insight Card */}
            {/* <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 p-5 shadow-sm border border-violet-100">
              <div className="mb-3 flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-violet-600" />
                <h3 className="text-sm font-bold text-violet-800">AI Insight</h3>
              </div>
              <p className="text-sm leading-relaxed text-violet-700">
                Basandosi su ticket simili per {ticket.cliente}, questo problema è spesso risolto
                pulendo la cache di sistema e reinstallando i driver principali dello schermo.
                Considera di consultare l&apos;ultima knowledge base del vendor per errori correlati.
              </p>
            </div> */}

            {/* Status Info */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Stato Attuale</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Stato:</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      STATUS_STYLES[ticket.stato]
                    }`}
                  >
                    {STATI_MAP[ticket.stato]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Priorità:</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                      PRIORITY_STYLES[ticket.priorita]
                    }`}
                  >
                    {PRIORITA_MAP[ticket.priorita]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Note:</span>
                  <span className="text-xs text-slate-600">
                    {ticket.note ? `${ticket.note.length} caratteri` : "Nessuna"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <AlertCircleIcon className="h-5 w-5" />
          {error}
        </div>
      )}
    </div>
  );
}