"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Allegato,
  Priorita,
  RuoloMessaggio,
  StatoTicket,
  TechnicalNote,
  Ticket,
} from "@/lib/types";
import { PRIORITY_STYLES, STATUS_STYLES } from "@/components/badges";
import {
  InfoIcon,
  SparklesIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  TrashIcon,
  EditIcon,
  BookIcon,
  UserIcon,
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

interface Operator {
  id: string;
  nome: string;
  email: string;
  ruolo: string;
}

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
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [note, setNote] = useState("");
  const [selectedOperatore, setSelectedOperatore] = useState("");
  const [contatto, setContatto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [selectedStato, setSelectedStato] = useState<StatoTicket>("NUOVO");
  const [selectedPriorita, setSelectedPriorita] = useState<Priorita>("BASSA");

  const [operatori, setOperatori] = useState<Operator[]>([]);
  const [currentUser, setCurrentUser] = useState<{ nome: string; ruolo: string } | null>(null);
  const [noteForm, setNoteForm] = useState({ titolo: "", problema: "", soluzione: "" });
  const [editingNote, setEditingNote] = useState<TechnicalNote | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [uploadingNoteId, setUploadingNoteId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = (await res.json()) as Ticket;
      setTicket(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di caricamento del ticket.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadOperatori = useCallback(async () => {
    try {
      const res = await fetch("/api/operatori");
      if (res.ok) {
        const data = await res.json();
        setOperatori(data.operatori ?? []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.operator) {
          setCurrentUser({ nome: data.operator.nome, ruolo: data.operator.ruolo });
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    load();
    loadOperatori();
    loadCurrentUser();
  }, [load, loadOperatori, loadCurrentUser]);

  useEffect(() => {
    if (!ticket) return;
    setNote(ticket.note ?? "");
    setSelectedOperatore(ticket.operatore ?? "");
    setContatto(ticket.contatto ?? "");
    setTelefono(ticket.telefono ?? "");
    setEmail(ticket.email ?? "");
    setSelectedStato(ticket.stato);
    setSelectedPriorita(ticket.priorita);
    setError("");
    setConfirmDelete(false);
    setConfirmClose(false);
    setSaved(false);
    setEditingNote(null);
    setNoteForm({ titolo: "", problema: "", soluzione: "" });
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
      return (await res.json()) as Ticket;
    },
    []
  );

  const updateTicket = useCallback(
    async (patch: Partial<Ticket>) => {
      const updated = await mutate(`/api/tickets/${id}`, "PATCH", patch);
      setTicket(updated);
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

  const handleSaveAll = useCallback(() => {
    void run(async () => {
      await updateTicket({
        stato: selectedStato,
        priorita: selectedPriorita,
        note: note.trim() || null,
        operatore: selectedOperatore || null,
        contatto: contatto.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [run, updateTicket, selectedStato, selectedPriorita, note, selectedOperatore, contatto, telefono, email]);

  const handleCancel = useCallback(() => {
    if (!ticket) return;
    setNote(ticket.note ?? "");
    setSelectedOperatore(ticket.operatore ?? "");
    setContatto(ticket.contatto ?? "");
    setTelefono(ticket.telefono ?? "");
    setEmail(ticket.email ?? "");
    setSelectedStato(ticket.stato);
    setSelectedPriorita(ticket.priorita);
    setError("");
    setPendingFiles([]);
  }, [ticket]);

  const handleCloseTicket = useCallback(() => {
    void run(async () => {
      await updateTicket({ stato: "CHIUSO" });
      setSelectedStato("CHIUSO");
      setConfirmClose(false);
    });
  }, [run, updateTicket]);

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

  // Technical Notes functions
  const saveNoteTecnica = useCallback(() => {
    const titolo = noteForm.titolo.trim();
    const soluzione = noteForm.soluzione.trim();
    if (!titolo || !soluzione) return;
    void run(async () => {
      const payload = {
        titolo,
        problema: noteForm.problema.trim(),
        soluzione,
        operatore: selectedOperatore || null,
      };
      
      let noteId = editingNote?.id;
      if (editingNote) {
        await mutate(`/api/tickets/${id}/notes/${editingNote.id}`, "PATCH", payload);
      } else {
        const newNote = await mutate(`/api/tickets/${id}/notes`, "POST", payload);
        noteId = (newNote as unknown as { note_tecniche?: { id: string }[] })?.note_tecniche?.slice(-1)?.[0]?.id;
      }
      
      // Upload pending files if any
      if (pendingFiles.length > 0 && noteId) {
        for (const file of pendingFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("noteId", noteId);
          formData.append("ticketId", id);
          
          await fetch("/api/uploads", {
            method: "POST",
            body: formData,
          });
        }
        setPendingFiles([]);
      }
      
      setEditingNote(null);
      setNoteForm({ titolo: "", problema: "", soluzione: "" });
      // Reload ticket to get updated notes
      await load();
    });
  }, [run, mutate, id, noteForm, editingNote, selectedOperatore, pendingFiles, load]);

  const startEditNote = useCallback((n: TechnicalNote) => {
    setEditingNote(n);
    setNoteForm({ titolo: n.titolo, problema: n.problema, soluzione: n.soluzione });
  }, []);

  const removeNote = useCallback(
    (noteId: string) => {
      void run(async () => {
        await mutate(`/api/tickets/${id}/notes/${noteId}`, "DELETE");
        await load();
      });
    },
    [run, mutate, id, load]
  );

  // File upload handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, noteId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingFile(file);
      setUploadingNoteId(noteId);
      setUploadProgress(0);
    }
  }, []);

  const uploadFile = useCallback(async () => {
    if (!uploadingFile || !uploadingNoteId || !ticket) return;

    const formData = new FormData();
    formData.append("file", uploadingFile);
    formData.append("noteId", uploadingNoteId);
    formData.append("ticketId", ticket.id);

    setUploadProgress(10);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Errore di caricamento.");
      }

      setUploadProgress(100);
      setUploadingFile(null);
      setUploadingNoteId(null);
      setUploadProgress(0);

      // Reload ticket to get updated attachments
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di caricamento file.");
      setUploadingFile(null);
      setUploadingNoteId(null);
      setUploadProgress(0);
    }
  }, [uploadingFile, uploadingNoteId, ticket, load]);

  const cancelUpload = useCallback(() => {
    setUploadingFile(null);
    setUploadingNoteId(null);
    setUploadProgress(0);
  }, []);

  const deleteAttachment = useCallback(
    (attachmentId: string) => {
      void run(async () => {
        const res = await fetch(`/api/uploads/${attachmentId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Errore di eliminazione.");
        }
        await load();
      });
    },
    [run, load]
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (mimeType: string) => mimeType.startsWith("image/");

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

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            ‹ Indietro
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              Modifica Ticket
              <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-600">
                {ticket.numero}
              </span>
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Aggiorna i dettagli per {ticket.cliente}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Close Ticket Button */}
          {!confirmClose ? (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              disabled={ticket.stato === "CHIUSO"}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ticket.stato === "CHIUSO" ? "Già Chiuso" : "Chiudi Ticket"}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5">
              <span className="text-sm font-medium text-amber-700">Confermi chiusura?</span>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleCloseTicket}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? "Chiusura..." : "Chiudi"}
              </button>
            </div>
          )}

          {/* Delete Button */}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition"
            >
              Elimina
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
              <span className="text-sm font-medium text-red-700">Confermi?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={elimina}
                disabled={saving}
                className="rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Elimina
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            {ticket.stato === "CHIUSO" ? "Chiudi" : "Annulla"}
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || ticket.stato === "CHIUSO"}
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
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircleIcon className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Warning: Ticket is closed */}
        {ticket.stato === "CHIUSO" && (
          <div className="mb-4 rounded-lg border border-slate-300 bg-slate-100 p-4">
            <div className="flex items-start gap-3">
              <CheckCircleIcon className="h-5 w-5 shrink-0 text-slate-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">
                  Ticket Chiuso
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Questo ticket è stato chiuso il {ticket.data_chiusura}. 
                  Non è più possibile assegnarlo o modificare i suoi dati.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Warning: Not assigned to you */}
        {ticket.stato !== "CHIUSO" &&
         currentUser?.ruolo !== "admin" && 
         ticket.operatore && 
         ticket.operatore !== currentUser?.nome && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircleIcon className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-800">
                  Questo ticket non è assegnato a te
                </h3>
                <p className="mt-1 text-sm text-amber-700">
                  Assegnato a: <strong>{ticket.operatore}</strong>. 
                  Puoi visualizzare i dettagli ma le modifiche saranno limitate.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void run(async () => {
                        await updateTicket({ operatore: currentUser?.nome ?? null, stato: "IN_CORSO" });
                        setSelectedOperatore(currentUser?.nome ?? "");
                      });
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
                  >
                    {saving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Collaborando...
                      </>
                    ) : (
                      <>
                        <UserIcon className="h-4 w-4" />
                        Collabora
                      </>
                    )}
                  </button>
                  <span className="text-xs text-amber-600">
                    Unendoti al ticket potrai modificare e aggiungere note
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info: Unassigned ticket */}
        {ticket.stato !== "CHIUSO" &&
         currentUser?.ruolo !== "admin" && !ticket.operatore && (
          <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <InfoIcon className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-800">
                  Questo ticket è disponibile
                </h3>
                <p className="mt-1 text-sm text-blue-700">
                  Nessun operatore assegnato. Puoi prendere in carico questo ticket.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      void run(async () => {
                        await updateTicket({ operatore: currentUser?.nome ?? null, stato: "IN_CORSO" });
                        setSelectedOperatore(currentUser?.nome ?? "");
                      });
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {saving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Assegnamento...
                      </>
                    ) : (
                      <>
                        <UserIcon className="h-4 w-4" />
                        Prendi in carico
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left column - Form */}
          <div className="space-y-5 xl:col-span-2">
            {/* Ticket Classification */}
            <div className={`rounded-xl bg-white p-5 shadow-sm border border-slate-200 ${ticket.stato === "CHIUSO" ? "opacity-60" : ""}`}>
              <h2 className="mb-4 text-sm font-bold text-slate-800">Classificazione Ticket</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Stato del Ticket
                  </label>
                  <div className="relative rounded-lg bg-slate-100 p-0.5">
                    <select
                      value={selectedStato}
                      onChange={(e) => setSelectedStato(e.target.value as StatoTicket)}
                      disabled={ticket.stato === "CHIUSO"}
                      className="w-full appearance-none rounded-lg border-0 bg-white px-3 py-2.5 pr-8 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATI_MAP[s]}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Priorità
                  </label>
                  <div className="relative rounded-lg bg-slate-100 p-0.5">
                    <select
                      value={selectedPriorita}
                      onChange={(e) => setSelectedPriorita(e.target.value as Priorita)}
                      disabled={ticket.stato === "CHIUSO"}
                      className="w-full appearance-none rounded-lg border-0 bg-white px-3 py-2.5 pr-8 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITA_MAP[p]}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Operator Selection */}
            <div className={`rounded-xl bg-white p-5 shadow-sm border border-slate-200 ${ticket.stato === "CHIUSO" ? "opacity-60" : ""}`}>
              <h2 className="mb-4 text-sm font-bold text-slate-800">Assegnazione Operatore</h2>
              
              {ticket.stato === "CHIUSO" ? (
                <p className="text-sm text-slate-500">
                  Ticket chiuso - non è possibile modificare l&apos;assegnazione.
                </p>
              ) : currentUser?.ruolo === "admin" ? (
                // Admin: dropdown completo
                <div className="relative rounded-lg bg-slate-100 p-0.5">
                  <select
                    value={selectedOperatore}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedOperatore(val);
                      // Auto-change status when assigning/releasing
                      if (val) {
                        setSelectedStato("IN_CORSO");
                      }
                    }}
                    className="w-full appearance-none rounded-lg border-0 bg-white px-3 py-2.5 pr-8 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Non assegnato --</option>
                    {operatori.map((op) => (
                      <option key={op.id} value={op.nome}>
                        {op.nome} ({op.ruolo})
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              ) : (
                // Operatore: solo pulsante "Prendi in carico" o stato assegnazione
                <div>
                  {ticket.operatore === currentUser?.nome ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Assegnato a te
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void run(async () => {
                            await updateTicket({ operatore: null, stato: "NUOVO" });
                            setSelectedOperatore("");
                          });
                        }}
                        disabled={saving}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
                      >
                        {saving ? "Rilascio..." : "Rilascia"}
                      </button>
                    </div>
                  ) : ticket.operatore ? (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Assegnato a: <strong>{ticket.operatore}</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void run(async () => {
                          await updateTicket({ operatore: currentUser?.nome ?? null, stato: "IN_CORSO" });
                          setSelectedOperatore(currentUser?.nome ?? "");
                        });
                      }}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Assegnamento...
                        </>
                      ) : (
                        <>
                          <span className="text-lg">+</span>
                          Prendi in carico
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
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

            {/* Technical Notes Section */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <BookIcon className="h-4 w-4 text-violet-600" />
                  Note Tecniche ({ticket.note_tecniche.length})
                </h2>
              </div>

              {/* Add/Edit Note Form */}
              <div className="mb-4 rounded-lg bg-slate-50 p-4 border border-slate-200">
                <h3 className="mb-3 text-xs font-semibold text-slate-600">
                  {editingNote ? "Modifica Nota Tecnica" : "Nuova Nota Tecnica"}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Titolo *</label>
                    <input
                      value={noteForm.titolo}
                      onChange={(e) => setNoteForm((f) => ({ ...f, titolo: e.target.value }))}
                      placeholder="Es. Errore all'avvio: arresto improvviso"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      placeholder="Descrizione del problema..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
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
                      placeholder="Come è stato risolto il problema..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* File Upload Section */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Allegati (opzionale)
                    </label>
                    <div className="rounded-lg border-2 border-dashed border-violet-200 bg-white p-4 text-center hover:border-violet-400 transition">
                      <input
                        type="file"
                        id="note-file-input"
                        className="hidden"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z,.dwg,.dxf,.sql,.json,.xml,.csv"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            setPendingFiles((prev) => [...prev, ...files]);
                          }
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="note-file-input"
                        className="cursor-pointer text-violet-600 hover:text-violet-700"
                      >
                        <span className="text-2xl">📎</span>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          Clicca per aggiungere file
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Immagini, PDF, documenti, file CAD, SQL...
                        </p>
                      </label>
                    </div>

                    {/* Pending Files List */}
                    {pendingFiles.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {pendingFiles.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                          >
                            <div className="h-8 w-8 shrink-0 rounded bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">
                              {file.name.split(".").pop()?.toUpperCase() || "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveNoteTecnica}
                      disabled={saving || !noteForm.titolo.trim() || !noteForm.soluzione.trim()}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? "Salvataggio..." : editingNote ? "Aggiorna Nota" : "Aggiungi Nota"}
                    </button>
                    {editingNote && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(null);
                          setNoteForm({ titolo: "", problema: "", soluzione: "" });
                          setPendingFiles([]);
                        }}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes List */}
              {ticket.note_tecniche.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                  Nessuna nota tecnica presente.
                </p>
              ) : (
                <div className="space-y-3">
                  {ticket.note_tecniche.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-800">{n.titolo}</h4>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {n.data_creazione}
                            {n.operatore ? ` · ${n.operatore}` : ""}
                          </p>
                          {/* Attachments count badge - always visible */}
                          {n.allegati && n.allegati.length > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              📎 {n.allegati.length} {n.allegati.length === 1 ? "allegato" : "allegati"}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <label className="cursor-pointer rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition flex items-center gap-1">
                            📎 Allega
                            <input
                              type="file"
                              className="hidden"
                              id={`file-${n.id}`}
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z,.dwg,.dxf,.sql,.json,.xml,.csv"
                              onChange={(e) => handleFileSelect(e, n.id)}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setExpandedNote(expandedNote === n.id ? null : n.id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                          >
                            {expandedNote === n.id ? "▼" : "▶"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditNote(n)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                          >
                            <EditIcon className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeNote(n.id)}
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Upload Progress - always visible when uploading */}
                      {uploadingNoteId === n.id && uploadingFile && (
                        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-violet-700 truncate max-w-[200px]">
                              {uploadingFile.name}
                            </span>
                            <span className="text-[10px] text-violet-500">
                              {formatFileSize(uploadingFile.size)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-violet-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-600 transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={uploadFile}
                              disabled={saving}
                              className="rounded bg-violet-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              {saving ? "Caricamento..." : "Carica"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelUpload}
                              className="rounded border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Attachments List - always visible when there are attachments */}
                      {n.allegati && n.allegati.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {n.allegati.map((allegato) => (
                            <div
                              key={allegato.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                            >
                              {isImageFile(allegato.tipo_mime) ? (
                                <div className="h-8 w-8 shrink-0 rounded bg-slate-100 flex items-center justify-center overflow-hidden">
                                  <img
                                    src={`/api/uploads/${allegato.id}`}
                                    alt={allegato.nome_originale}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="h-8 w-8 shrink-0 rounded bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                  {allegato.nome_originale.split(".").pop()?.toUpperCase() || "?"}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <a
                                  href={`/api/uploads/${allegato.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-blue-600 hover:underline truncate block"
                                >
                                  {allegato.nome_originale}
                                </a>
                                <p className="text-[10px] text-slate-400">
                                  {formatFileSize(allegato.dimensione)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteAttachment(allegato.id)}
                                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Elimina allegato"
                              >
                                <TrashIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Expanded Details */}
                      {expandedNote === n.id && (
                        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                          {n.problema && (
                            <div>
                              <h5 className="mb-0.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                                Problema
                              </h5>
                              <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
                                {n.problema}
                              </p>
                            </div>
                          )}
                          <div>
                            <h5 className="mb-0.5 text-[11px] font-semibold tracking-wide text-emerald-600 uppercase">
                              Soluzione
                            </h5>
                            <p className="rounded-lg bg-emerald-50 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                              {n.soluzione}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Details */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h2 className="mb-4 text-sm font-bold text-slate-800">Dettagli Contatto</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Nome Contatto
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <input
                      value={contatto}
                      onChange={(e) => setContatto(e.target.value)}
                      className="w-full rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Telefono
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Es. 391 123 4567"
                      className="w-full rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Email
                  </label>
                  <div className="rounded-lg bg-slate-100 p-0.5">
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Es. nome@azienda.it"
                      className="w-full rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
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
            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 p-5 shadow-sm border border-violet-100">
              <div className="mb-3 flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-violet-600" />
                <h3 className="text-sm font-bold text-violet-800">AI Insight</h3>
              </div>
              <p className="text-sm leading-relaxed text-violet-700">
                Basandosi su ticket simili per {ticket.cliente}, questo problema è spesso risolto
                pulendo la cache di sistema e reinstallando i driver principali dello schermo.
                Considera di consultare l&apos;ultima knowledge base del vendor per errori correlati.
              </p>
            </div>

            {/* Status Summary */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Riepilogo</h3>
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
                  <span className="text-xs text-slate-500">Note interne:</span>
                  <span className="text-xs text-slate-600">
                    {ticket.note ? `${ticket.note.length} caratteri` : "Nessuna"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Note tecniche:</span>
                  <span className="text-xs text-slate-600">{ticket.note_tecniche.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Messaggi:</span>
                  <span className="text-xs text-slate-600">{ticket.messaggi.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}