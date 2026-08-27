"use client";

import { useEffect, useMemo, useState } from "react";
import type { Priorita, StatoTicket, Ticket } from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/components/badges";

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
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNote(ticket.note ?? "");
    setOperatore(ticket.operatore ?? "");
    setConfirmDelete(false);
    setError("");
  }, [ticket.id, ticket.note, ticket.operatore]);

  const eta = useMemo(() => {
    if (!ticket.data_creazione) return "";
    const parts = ticket.data_creazione.split(/[/\s:]/);
    if (parts.length < 5) return "";
    const [d, m, y, h, min] = parts.map(Number);
    const created = new Date(y, m - 1, d, h, min);
    const diff = Date.now() - created.getTime();
    const giorni = Math.floor(diff / 86400000);
    const ore = Math.floor(diff / 3600000);
    if (giorni > 0) return `${giorni} g`;
    if (ore > 0) return `${ore} h`;
    const minuti = Math.max(1, Math.floor(diff / 60000));
    return `${minuti} min`;
  }, [ticket.data_creazione]);

  const saveNote = async () => {
    setSaving(true);
    setError("");
    try {
      await onUpdate(ticket.id, { note });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const takeCharge = async () => {
    setSaving(true);
    setError("");
    try {
      await onUpdate(ticket.id, {
        operatore: operatore.trim() || "Operatore",
        stato: "IN_CORSO",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const setStato = async (stato: StatoTicket) => {
    setError("");
    try {
      await onUpdate(ticket.id, { stato });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    }
  };

  const setPriorita = async (priorita: Priorita) => {
    setError("");
    try {
      await onUpdate(ticket.id, { priorita });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di salvataggio.");
    }
  };

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">{ticket.numero}</h2>
          <p className="text-xs text-slate-400">
            Creato: {ticket.data_creazione}
            {eta ? ` · ${eta} fa` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Chiudi ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">{ticket.cliente}</p>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[ticket.stato]}`}>
                  {ticket.stato}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[ticket.priorita]}`}>
                  {ticket.priorita}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">Contatto: {ticket.contatto}</p>
            <span className="mt-1.5 inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {ticket.modulo_software}
            </span>
            {ticket.operatore && (
              <span className="ml-1.5 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Operatore: {ticket.operatore}
              </span>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Sommario
            </h3>
            <p className="text-sm font-medium text-slate-800">{ticket.sommario_problema}</p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Descrizione
            </h3>
            <p className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
              {ticket.descrizione_dettagliata}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Conversazione ({ticket.messaggi.length})
            </h3>
            <div className="space-y-2">
              {ticket.messaggi.length === 0 && (
                <p className="text-xs text-slate-400">Nessun messaggio allegato al ticket.</p>
              )}
              {ticket.messaggi.map((m) => (
                <div key={m.id} className={`flex ${m.ruolo === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                      m.ruolo === "user"
                        ? "rounded-br-sm bg-blue-600 text-white"
                        : "rounded-bl-sm bg-slate-100 text-slate-700"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.contenuto}</p>
                    <p className={`mt-1 text-[10px] ${m.ruolo === "user" ? "text-blue-200" : "text-slate-400"}`}>
                      {m.ruolo === "user" ? "Utente" : "Assistente"} · {m.data_creazione}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">{error}</p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Stato</label>
          <div className="flex gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStato(s)}
                disabled={s === ticket.stato || saving}
                className={`flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition disabled:opacity-100 ${
                  s === ticket.stato
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Priorità</label>
          <div className="flex gap-1.5">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriorita(p)}
                disabled={p === ticket.priorita || saving}
                className={`flex-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                  p === ticket.priorita
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Operatore</label>
          <div className="flex gap-2">
            <input
              value={operatore}
              onChange={(e) => setOperatore(e.target.value)}
              placeholder="Nome operatore"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={takeCharge}
              disabled={saving}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Prendi in carico
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Note interne</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note visibili solo al team…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={saveNote}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Salva note"}
            </button>
          </div>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Elimina ticket
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
            <span className="text-xs font-medium text-red-700">Confermi?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onDelete(ticket.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Errore di eliminazione.");
                  }
                }}
                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Elimina
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
