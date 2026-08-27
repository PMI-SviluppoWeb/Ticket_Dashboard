"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Priorita,
  RuoloMessaggio,
  StatoTicket,
  TechnicalNote,
  Ticket,
} from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/components/badges";

const STATUS_OPTIONS: StatoTicket[] = ["NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];
const PRIORITY_OPTIONS: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

type Tab = "panoramica" | "chat" | "note";

interface TicketPageProps {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
}

export default function TicketPage({ id, onBack, onDeleted }: TicketPageProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("panoramica");

  const [note, setNote] = useState("");
  const [operatore, setOperatore] = useState("");
  const [contatto, setContatto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  const [messaggio, setMessaggio] = useState("");
  const [ruoloMessaggio, setRuoloMessaggio] = useState<RuoloMessaggio>("assistant");

  const [noteForm, setNoteForm] = useState({
    titolo: "",
    problema: "",
    soluzione: "",
    operatore: "",
  });
  const [editingNote, setEditingNote] = useState<TechnicalNote | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setTicket((await res.json()) as Ticket);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di caricamento del ticket.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ticket) return;
    setNote(ticket.note ?? "");
    setOperatore(ticket.operatore ?? "");
    setContatto(ticket.contatto ?? "");
    setTelefono(ticket.telefono ?? "");
    setEmail(ticket.email ?? "");
    setError("");
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  const mutate = useCallback(
    async (url: string, method: string, body?: unknown) => {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Errore di aggiornamento.");
      }
      setTicket((await res.json()) as Ticket);
    },
    []
  );

  const updateTicket = useCallback(
    async (patch: Partial<Ticket>) => {
      await mutate(`/api/tickets/${id}`, "PATCH", patch);
    },
    [id, mutate]
  );

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setSaving(true);
      setError("");
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore di salvataggio.");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const setStato = useCallback(
    (stato: StatoTicket) => {
      if (ticket && stato !== ticket.stato) void run(() => updateTicket({ stato }));
    },
    [ticket, run, updateTicket]
  );

  const setPriorita = useCallback(
    (priorita: Priorita) => {
      if (ticket && priorita !== ticket.priorita) void run(() => updateTicket({ priorita }));
    },
    [ticket, run, updateTicket]
  );

  const takeCharge = useCallback(() => {
    void run(() =>
      updateTicket({
        operatore: operatore.trim() || "Operatore",
        stato: "IN_CORSO",
      })
    );
  }, [run, updateTicket, operatore]);

  const saveNoteInterne = useCallback(() => {
    void run(() => updateTicket({ note: note.trim() || null }));
  }, [run, updateTicket, note]);

  const saveRecapiti = useCallback(() => {
    void run(() =>
      updateTicket({
        contatto: contatto.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
      })
    );
  }, [run, updateTicket, contatto, telefono, email]);

  const sendMessage = useCallback(() => {
    const testo = messaggio.trim();
    if (!testo) return;
    void run(async () => {
      await mutate(`/api/tickets/${id}/messages`, "POST", {
        ruolo: ruoloMessaggio,
        contenuto: testo,
      });
      setMessaggio("");
    });
  }, [run, mutate, id, messaggio, ruoloMessaggio]);

  const startEditNote = useCallback((n: TechnicalNote) => {
    setEditingNote(n);
    setNoteForm({
      titolo: n.titolo,
      problema: n.problema,
      soluzione: n.soluzione,
      operatore: n.operatore ?? "",
    });
  }, []);

  const resetNoteForm = useCallback(() => {
    setEditingNote(null);
    setNoteForm({ titolo: "", problema: "", soluzione: "", operatore: "" });
  }, []);

  const saveNoteTecnica = useCallback(() => {
    const titolo = noteForm.titolo.trim();
    const soluzione = noteForm.soluzione.trim();
    if (!titolo || !soluzione) return;
    void run(async () => {
      const payload = {
        titolo,
        problema: noteForm.problema.trim(),
        soluzione,
        operatore: noteForm.operatore.trim() || null,
      };
      if (editingNote) {
        await mutate(`/api/tickets/${id}/notes/${editingNote.id}`, "PATCH", payload);
      } else {
        await mutate(`/api/tickets/${id}/notes`, "POST", payload);
      }
      resetNoteForm();
    });
  }, [run, mutate, id, noteForm, editingNote, resetNoteForm]);

  const removeNote = useCallback(
    (noteId: string) => {
      void run(() => mutate(`/api/tickets/${id}/notes/${noteId}`, "DELETE"));
    },
    [run, mutate, id]
  );

  const elimina = useCallback(() => {
    void run(async () => {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Errore di eliminazione.");
      }
      onDeleted();
    });
  }, [run, id, onDeleted]);

  const eta = useMemo(() => {
    if (!ticket?.data_creazione) return "";
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
  }, [ticket?.data_creazione]);

  if (loading && !ticket) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">Caricamento ticket…</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-slate-500">Ticket non trovato.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Torna alla dashboard
        </button>
      </div>
    );
  }

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "panoramica", label: "Panoramica & Recapiti" },
    { key: "chat", label: `Chat (${ticket.messaggi.length})` },
    { key: "note", label: `Note tecniche (${ticket.note_tecniche.length})` },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ‹ Dashboard
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800">{ticket.numero}</h1>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[ticket.stato]}`}>
                {ticket.stato}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[ticket.priorita]}`}>
                {ticket.priorita}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Creato: {ticket.data_creazione}
              {eta ? ` · ${eta} fa` : ""}
              {ticket.operatore ? ` · Operatore: ${ticket.operatore}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Aggiorna
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Elimina
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
              <span className="text-xs font-medium text-red-700">Confermi?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={elimina}
                disabled={saving}
                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Elimina
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
          )}

          <div className="flex gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-blue-600 bg-white text-blue-700"
                    : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "panoramica" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Gestione
                </h2>
                <div className="space-y-3">
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
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Recapiti
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
                    <input
                      value={ticket.cliente}
                      readOnly
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Nome contatto</label>
                    <input
                      value={contatto}
                      onChange={(e) => setContatto(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Telefono</label>
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Es. 391 123 4567"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Es. nome@azienda.it"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Modulo software</label>
                    <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {ticket.modulo_software}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={saveRecapiti}
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Salvataggio…" : "Salva recapiti"}
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Sommario
                </h2>
                <p className="text-sm font-medium text-slate-800">{ticket.sommario_problema}</p>
                <h2 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Descrizione
                </h2>
                <p className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                  {ticket.descrizione_dettagliata}
                </p>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Note interne
                </h2>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Note visibili solo al team tecnico…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={saveNoteInterne}
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Salvataggio…" : "Salva note interne"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {tab === "chat" && (
            <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Conversazione con l'utente
              </h2>
              <div className="max-h-[55vh] flex-1 space-y-3 overflow-y-auto pr-1">
                {ticket.messaggi.length === 0 && (
                  <p className="text-xs text-slate-400">Nessun messaggio allegato al ticket.</p>
                )}
                {ticket.messaggi.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.ruolo === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        m.ruolo === "user"
                          ? "rounded-br-sm bg-blue-600 text-white"
                          : "rounded-bl-sm bg-slate-100 text-slate-700"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.contenuto}</p>
                      <p
                        className={`mt-1 text-[10px] ${m.ruolo === "user" ? "text-blue-200" : "text-slate-400"}`}
                      >
                        {m.ruolo === "user" ? "Utente" : "Assistente"} · {m.data_creazione}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Invia come:</span>
                  {(["assistant", "user"] as RuoloMessaggio[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRuoloMessaggio(r)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ruoloMessaggio === r
                          ? "bg-blue-600 text-white"
                          : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {r === "assistant" ? "Assistente" : "Utente"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={messaggio}
                    onChange={(e) => setMessaggio(e.target.value)}
                    rows={2}
                    placeholder="Scrivi un messaggio…"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={saving || messaggio.trim().length === 0}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Invio…" : "Invia"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {tab === "note" && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {editingNote ? "Modifica nota tecnica" : "Nuova nota tecnica"}
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Titolo *
                    </label>
                    <input
                      value={noteForm.titolo}
                      onChange={(e) => setNoteForm((f) => ({ ...f, titolo: e.target.value }))}
                      placeholder="Es. Errore all'avvio: arresto improvviso"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Problema riscontrato
                    </label>
                    <textarea
                      value={noteForm.problema}
                      onChange={(e) => setNoteForm((f) => ({ ...f, problema: e.target.value }))}
                      rows={2}
                      placeholder="Descrizione del problema e del contesto…"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Soluzione applicata *
                    </label>
                    <textarea
                      value={noteForm.soluzione}
                      onChange={(e) => setNoteForm((f) => ({ ...f, soluzione: e.target.value }))}
                      rows={3}
                      placeholder="Come è stato risolto il problema (finirà nella knowledge base)…"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Operatore
                      </label>
                      <input
                        value={noteForm.operatore}
                        onChange={(e) => setNoteForm((f) => ({ ...f, operatore: e.target.value }))}
                        placeholder="Nome del tecnico"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={saveNoteTecnica}
                      disabled={saving || !noteForm.titolo.trim() || !noteForm.soluzione.trim()}
                      className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {saving ? "Salvataggio…" : editingNote ? "Aggiorna nota" : "Salva nota"}
                    </button>
                    {editingNote && (
                      <button
                        type="button"
                        onClick={resetNoteForm}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {ticket.note_tecniche.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
                  Nessuna nota tecnica. Le note salvate alimenteranno la knowledge base.
                </p>
              ) : (
                ticket.note_tecniche.map((n) => (
                  <article key={n.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800">{n.titolo}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {n.data_creazione}
                          {n.operatore ? ` · ${n.operatore}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedNote(expandedNote === n.id ? null : n.id)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {expandedNote === n.id ? "Comprimi" : "Espandi"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditNote(n)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNote(n.id)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                    {expandedNote === n.id && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <h4 className="mb-0.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                            Problema
                          </h4>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
                            {n.problema || "—"}
                          </p>
                        </div>
                        <div>
                          <h4 className="mb-0.5 text-[11px] font-semibold tracking-wide text-emerald-600 uppercase">
                            Soluzione
                          </h4>
                          <p className="rounded-lg bg-emerald-50 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                            {n.soluzione}
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
