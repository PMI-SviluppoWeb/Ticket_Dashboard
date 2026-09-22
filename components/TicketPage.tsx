"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Allegato,
  EmailLog,
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
  NUOVO: "Nuovo",
  IN_CORSO: "In Lavorazione",
  RISOLTO: "Risolto",
  CHIUSO: "Chiuso",
};

const STATI_COLORS: Record<StatoTicket, string> = {
  NUOVO: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  IN_CORSO: "bg-blue-50 text-blue-700 border border-blue-200",
  RISOLTO: "bg-violet-50 text-violet-700 border border-violet-200",
  CHIUSO: "bg-slate-100 text-slate-600 border border-slate-200",
};

const STATI_DOT: Record<StatoTicket, string> = {
  NUOVO: "bg-emerald-500",
  IN_CORSO: "bg-blue-500",
  RISOLTO: "bg-violet-500",
  CHIUSO: "bg-slate-400",
};

const PRIORITA_MAP: Record<Priorita, string> = {
  BASSA: "Bassa",
  MEDIA: "Media",
  ALTA: "Alta",
};

const PRIORITA_COLORS: Record<Priorita, string> = {
  BASSA: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  MEDIA: "bg-amber-50 text-amber-700 border border-amber-200",
  ALTA: "bg-red-50 text-red-700 border border-red-200",
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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
  const [cliente, setCliente] = useState("");
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

  const [emailLog, setEmailLog] = useState<EmailLog[]>([]);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailOggetto, setEmailOggetto] = useState("");
  const [emailMessaggio, setEmailMessaggio] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [tempoEffettivo, setTempoEffettivo] = useState("");
  const [savingTempo, setSavingTempo] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = (await res.json()) as Ticket;
      setTicket(data);
      setError("");
      if (data.tempo_effettivo_minuti !== null && data.tempo_effettivo_minuti !== undefined) {
        const ore = Math.floor(data.tempo_effettivo_minuti / 60);
        const minuti = data.tempo_effettivo_minuti % 60;
        setTempoEffettivo(`${ore}:${String(minuti).padStart(2, "0")}`);
      } else if (data.tempo_stimato_minuti !== null && data.tempo_stimato_minuti !== undefined) {
        const ore = Math.floor(data.tempo_stimato_minuti / 60);
        const minuti = data.tempo_stimato_minuti % 60;
        setTempoEffettivo(`${ore}:${String(minuti).padStart(2, "0")}`);
      } else {
        setTempoEffettivo("");
      }
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
    } catch { /* */ }
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
    } catch { /* */ }
  }, []);

  useEffect(() => {
    load();
    loadOperatori();
    loadCurrentUser();
  }, [load, loadOperatori, loadCurrentUser]);

  const loadEmailLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/email`);
      if (res.ok) {
        const data = await res.json();
        setEmailLog(data.log ?? []);
      }
    } catch { /* */ }
  }, [id]);

  useEffect(() => {
    if (ticket) loadEmailLog();
  }, [ticket, loadEmailLog]);

  const sendManualEmail = useCallback(async () => {
    if (!emailOggetto.trim() || !emailMessaggio.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/tickets/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oggetto: emailOggetto, messaggio: emailMessaggio }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore invio email.");
      }
      setEmailOggetto("");
      setEmailMessaggio("");
      setShowEmailForm(false);
      await loadEmailLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio email.");
    } finally {
      setSendingEmail(false);
    }
  }, [id, emailOggetto, emailMessaggio, loadEmailLog]);

  useEffect(() => {
    if (!ticket) return;
    setNote(ticket.note ?? "");
    setSelectedOperatore(ticket.operatore ?? "");
    setCliente(ticket.cliente ?? "");
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
        cliente: cliente.trim(),
        contatto: contatto.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [run, updateTicket, selectedStato, selectedPriorita, note, selectedOperatore, cliente, contatto, telefono, email]);

  const handleCancel = useCallback(() => {
    if (!ticket) return;
    setNote(ticket.note ?? "");
    setSelectedOperatore(ticket.operatore ?? "");
    setCliente(ticket.cliente ?? "");
    setContatto(ticket.contatto ?? "");
    setTelefono(ticket.telefono ?? "");
    setEmail(ticket.email ?? "");
    setSelectedStato(ticket.stato);
    setSelectedPriorita(ticket.priorita);
    setError("");
    setPendingFiles([]);
    if (ticket.tempo_effettivo_minuti !== null && ticket.tempo_effettivo_minuti !== undefined) {
      const ore = Math.floor(ticket.tempo_effettivo_minuti / 60);
      const minuti = ticket.tempo_effettivo_minuti % 60;
      setTempoEffettivo(`${ore}:${String(minuti).padStart(2, "0")}`);
    } else if (ticket.tempo_stimato_minuti !== null && ticket.tempo_stimato_minuti !== undefined) {
      const ore = Math.floor(ticket.tempo_stimato_minuti / 60);
      const minuti = ticket.tempo_stimato_minuti % 60;
      setTempoEffettivo(`${ore}:${String(minuti).padStart(2, "0")}`);
    } else {
      setTempoEffettivo("");
    }
  }, [ticket]);

  const saveTempoEffettivo = useCallback(() => {
    if (!tempoEffettivo.trim()) return;
    void run(async () => {
      const parts = tempoEffettivo.split(":");
      let minutiTotali: number;
      if (parts.length === 2) {
        const ore = parseInt(parts[0], 10) || 0;
        const minuti = parseInt(parts[1], 10) || 0;
        minutiTotali = ore * 60 + minuti;
      } else {
        const ore = parseFloat(tempoEffettivo) || 0;
        minutiTotali = Math.round(ore * 60);
      }
      if (minutiTotali <= 0) return;
      await updateTicket({ tempo_effettivo_minuti: minutiTotali } as Partial<Ticket>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [tempoEffettivo, run, updateTicket]);

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
      let filesUploaded = 0;
      if (pendingFiles.length > 0 && noteId) {
        for (const file of pendingFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("noteId", noteId);
          formData.append("ticketId", id);
          const res = await fetch("/api/uploads", { method: "POST", body: formData });
          if (res.ok) filesUploaded++;
        }
        setPendingFiles([]);
      }
      if (noteId && !editingNote) {
        await fetch(`/api/tickets/${id}/notes/${noteId}/send-email`, { method: "POST" });
      }
      setEditingNote(null);
      setNoteForm({ titolo: "", problema: "", soluzione: "" });
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
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Errore di caricamento.");
      }
      setUploadProgress(100);
      setUploadingFile(null);
      setUploadingNoteId(null);
      setUploadProgress(0);
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
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="text-sm font-medium">Caricamento ticket...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50 p-8">
        <p className="text-sm text-slate-500">Ticket non trovato.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition shadow-sm"
        >
          Torna alla dashboard
        </button>
      </div>
    );
  }

  const isClosed = ticket.stato === "CHIUSO";

  return (
    <div className="flex h-full flex-col bg-slate-50/70">
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Closed ticket banner */}
        {isClosed && (
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-slate-500" />
            Ticket chiuso il {ticket.data_chiusura}. Modifiche non consentite.
          </div>
        )}

        {/* ========== TICKET HEADER ========== */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
          {/* Row 1: Breadcrumb & sync status */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100 text-xs">
            <nav className="flex items-center gap-2 text-slate-500 font-medium">
              <button type="button" onClick={onBack} className="hover:text-blue-600 transition-colors">
                Dashboard
              </button>
              <span className="text-slate-300">&rsaquo;</span>
              <span className="text-slate-800 font-semibold">{ticket.numero}</span>
            </nav>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
              <span className={`inline-block w-2 h-2 rounded-full ${STATI_DOT[ticket.stato]}`} />
              {STATI_MAP[ticket.stato]}
            </div>
          </div>

          {/* Row 2: Title, badges, actions */}
          <div className="py-5 flex items-start justify-between gap-6">
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2.5 py-1 rounded-md tracking-wider">
                  #{ticket.numero}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATI_COLORS[ticket.stato]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATI_DOT[ticket.stato]}`} />
                  {STATI_MAP[ticket.stato]}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORITA_COLORS[ticket.priorita]}`}>
                  Priorita: {PRIORITA_MAP[ticket.priorita]}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug break-words">
                {ticket.sommario_problema}
              </h1>
            </div>

            {/* Action buttons stack */}
            <div className="flex flex-col gap-2 flex-shrink-0 w-64">
              {!isClosed && ticket.stato !== "IN_CORSO" && (
                <button
                  type="button"
                  onClick={() => {
                    void run(async () => {
                      const op = currentUser?.nome ?? null;
                      await updateTicket({ operatore: op, stato: "IN_CORSO" });
                      setSelectedOperatore(op ?? "");
                      setSelectedStato("IN_CORSO");
                    });
                  }}
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/25 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <span className="text-base">+</span>
                  )}
                  Prendi in carico
                </button>
              )}

              {ticket.email && (
                <button
                  type="button"
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-sm"
                >
                  <span className="text-blue-600">&#9993;</span>
                  {showEmailForm ? "Chiudi Email" : "Invia Email / Rispondi"}
                </button>
              )}

              {!confirmClose ? (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  disabled={isClosed}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClosed ? "Gi Chiuso" : "Chiudi Ticket"}
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {saving ? "Chiusura..." : "Conferma"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClose(false)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Annulla
                  </button>
                </div>
              )}

              {/* Delete button */}
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                >
                  Elimina Ticket
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={elimina}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving ? "Eliminazione..." : "Conferma Elimina"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Annulla
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Metadata bar */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <span className="text-slate-400">&#128196;</span>
              <span>Modulo:</span>
              <span className="font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">{ticket.modulo_software}</span>
            </div>
            <span className="text-slate-300">&bull;</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">&#128197;</span>
              <span>Ricevuto: <strong className="text-slate-700 font-semibold">{ticket.data_creazione}</strong></span>
            </div>
            {ticket.operatore && (
              <>
                <span className="text-slate-300">&bull;</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">&#128100;</span>
                  <span>Operatore: <strong className="text-slate-700 font-semibold">{ticket.operatore}</strong></span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Unassigned ticket CTA */}
        {!isClosed && currentUser?.ruolo !== "admin" && !ticket.operatore && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <InfoIcon className="h-5 w-5 shrink-0 text-blue-500" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Questo ticket e disponibile</p>
                <p className="text-xs text-blue-600">Nessun operatore assegnato. Puoi prendere in carico.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void run(async () => {
                  await updateTicket({ operatore: currentUser?.nome ?? null, stato: "IN_CORSO" });
                  setSelectedOperatore(currentUser?.nome ?? "");
                  setSelectedStato("IN_CORSO");
                });
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? "Assegnamento..." : "Prendi in carico"}
            </button>
          </div>
        )}

        {/* Assigned to another operator */}
        {!isClosed && currentUser?.ruolo !== "admin" && ticket.operatore && ticket.operatore !== currentUser?.nome && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircleIcon className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Assegnato a <strong>{ticket.operatore}</strong></p>
                <p className="text-xs text-amber-600">Puoi visualizzare ma le modifiche sono limitate.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void run(async () => {
                  await updateTicket({ operatore: currentUser?.nome ?? null, stato: "IN_CORSO" });
                  setSelectedOperatore(currentUser?.nome ?? "");
                });
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
            >
              Collabora
            </button>
          </div>
        )}

        {/* ========== 2-COLUMN GRID ========== */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full items-start">
          {/* ===== LEFT COLUMN (8 cols) ===== */}
          <div className="xl:col-span-8 space-y-6">

            {/* 1. Customer Message Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <span className="text-base">&#9993;</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Richiesta Originale</h2>
                    <p className="text-xs text-slate-500">Descrizione del problema</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200/80 shadow-sm">
                  {ticket.data_creazione}
                </span>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm shadow-sm ring-4 ring-slate-100">
                      {getInitials(ticket.contatto || ticket.cliente)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{ticket.contatto || "Non specificato"}</h3>
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{ticket.cliente}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{ticket.email || "Nessuna email"}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-5 text-sm text-slate-700 leading-relaxed space-y-3">
                  <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200/70 text-xs text-slate-600 font-semibold">
                    <span>Oggetto:</span>
                    <span className="text-slate-900 font-bold">{ticket.sommario_problema}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{ticket.descrizione_dettagliata}</p>
                  {ticket.note && (
                    <div className="pt-3 border-t border-slate-200/70">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Note interne:</p>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{ticket.note}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Quick Reply / Composer */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <span className="text-base">&#9998;</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Risposta Rapida</h2>
                    <p className="text-xs text-slate-500">Aggiungi una nota interna</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all bg-white overflow-hidden">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Scrivi una nota interna..."
                  disabled={isClosed}
                  className="w-full text-xs sm:text-sm p-4 border-0 focus:ring-0 text-slate-800 placeholder-slate-400 resize-y min-h-[80px] disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
                <div className="bg-slate-50/90 px-4 py-2.5 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving || isClosed}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva Note"}
                  </button>
                </div>
              </div>
            </section>

            {/* 3. Technical Notes */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100">
                    <BookIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Note Tecniche</h2>
                    <p className="text-xs text-slate-500">{ticket.note_tecniche.length} note archiviate</p>
                  </div>
                </div>
              </div>

              {/* Add/Edit Note Form */}
              {!isClosed && (
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-600">
                    {editingNote ? "Modifica Nota" : "Nuova Nota Tecnica"}
                  </h3>
                  <input
                    value={noteForm.titolo}
                    onChange={(e) => setNoteForm((f) => ({ ...f, titolo: e.target.value }))}
                    placeholder="Titolo nota *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <textarea
                    value={noteForm.problema}
                    onChange={(e) => setNoteForm((f) => ({ ...f, problema: e.target.value }))}
                    rows={2}
                    placeholder="Problema riscontrato..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <textarea
                    value={noteForm.soluzione}
                    onChange={(e) => setNoteForm((f) => ({ ...f, soluzione: e.target.value }))}
                    rows={3}
                    placeholder="Soluzione applicata *"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />

                  {/* File Upload */}
                  <div className="rounded-lg border-2 border-dashed border-violet-200 bg-white p-3 text-center hover:border-violet-400 transition">
                    <input
                      type="file"
                      id="note-file-input-new"
                      className="hidden"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z,.dwg,.dxf,.sql,.json,.xml,.csv"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) setPendingFiles((prev) => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                    <label htmlFor="note-file-input-new" className="cursor-pointer text-violet-600 hover:text-violet-700">
                      <p className="text-xs font-medium text-slate-600">Allega file</p>
                      <p className="text-[10px] text-slate-400">Immagini, PDF, documenti...</p>
                    </label>
                  </div>

                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                          <div className="h-6 w-6 shrink-0 rounded bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-600">
                            {file.name.split(".").pop()?.toUpperCase() || "?"}
                          </div>
                          <span className="text-xs text-slate-700 truncate flex-1">{file.name}</span>
                          <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 p-0.5">
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveNoteTecnica}
                      disabled={saving || !noteForm.titolo.trim() || !noteForm.soluzione.trim()}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? "Salvataggio..." : editingNote ? "Aggiorna" : "Aggiungi Nota"}
                    </button>
                    {editingNote && (
                      <button
                        type="button"
                        onClick={() => { setEditingNote(null); setNoteForm({ titolo: "", problema: "", soluzione: "" }); setPendingFiles([]); }}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Notes List */}
              {ticket.note_tecniche.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                  Nessuna nota tecnica presente.
                </p>
              ) : (
                <div className="space-y-3">
                  {ticket.note_tecniche.map((n) => (
                    <div key={n.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-800">{n.titolo}</h4>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {n.data_creazione}{n.operatore ? ` - ${n.operatore}` : ""}
                          </p>
                          {n.allegati && n.allegati.length > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              {n.allegati.length} {n.allegati.length === 1 ? "allegato" : "allegati"}
                            </span>
                          )}
                        </div>
                        {!isClosed && (
                          <div className="flex shrink-0 gap-1.5">
                            <label className="cursor-pointer rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition">
                              Allega
                              <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z" onChange={(e) => handleFileSelect(e, n.id)} />
                            </label>
                            <button type="button" onClick={() => setExpandedNote(expandedNote === n.id ? null : n.id)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
                              {expandedNote === n.id ? "▼" : "▶"}
                            </button>
                            <button type="button" onClick={() => startEditNote(n)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
                              <EditIcon className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => removeNote(n.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Upload progress */}
                      {uploadingNoteId === n.id && uploadingFile && (
                        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-violet-700 truncate max-w-[200px]">{uploadingFile.name}</span>
                            <span className="text-[10px] text-violet-500">{formatFileSize(uploadingFile.size)}</span>
                          </div>
                          <div className="h-1.5 bg-violet-200 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button type="button" onClick={uploadFile} disabled={saving} className="rounded bg-violet-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                              {saving ? "Caricamento..." : "Carica"}
                            </button>
                            <button type="button" onClick={cancelUpload} className="rounded border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100">
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      {n.allegati && n.allegati.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {n.allegati.map((allegato) => (
                            <div key={allegato.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                              {isImageFile(allegato.tipo_mime) ? (
                                <div className="h-8 w-8 shrink-0 rounded bg-slate-100 flex items-center justify-center overflow-hidden">
                                  <img src={`/api/uploads/${allegato.id}`} alt={allegato.nome_originale} className="h-full w-full object-cover" />
                                </div>
                              ) : (
                                <div className="h-8 w-8 shrink-0 rounded bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                  {allegato.nome_originale.split(".").pop()?.toUpperCase() || "?"}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <a href={`/api/uploads/${allegato.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:underline truncate block">
                                  {allegato.nome_originale}
                                </a>
                                <p className="text-[10px] text-slate-400">{formatFileSize(allegato.dimensione)}</p>
                              </div>
                              {!isClosed && (
                                <button type="button" onClick={() => deleteAttachment(allegato.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                                  <TrashIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Expanded details */}
                      {expandedNote === n.id && (
                        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                          {n.problema && (
                            <div>
                              <h5 className="mb-0.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Problema</h5>
                              <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{n.problema}</p>
                            </div>
                          )}
                          <div>
                            <h5 className="mb-0.5 text-[11px] font-semibold tracking-wide text-emerald-600 uppercase">Soluzione</h5>
                            <p className="rounded-lg bg-emerald-50 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{n.soluzione}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 4. Dark Tech Workspace Banner */}
            {/* <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-2xl text-white p-6 shadow-md relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
                <span className="text-9xl">&#128187;</span>
              </div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-blue-300">
                      <BookIcon className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-bold text-white tracking-tight">Documentazione Tecnica & Worklog</h3>
                  </div>
                  <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                    Diagnostica approfondita, sessioni di debugging e worklog certificati sono accessibili nella dashboard tecnica dedicata.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-400">&#10003;</span>
                      Note tecniche: <strong className="text-white">{ticket.note_tecniche.length}</strong>
                    </span>
                    {ticket.data_inizio_lavoro && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-amber-300">&#9202;</span>
                        In lavoro dal {ticket.data_inizio_lavoro}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section> */}
          </div>

          {/* ===== RIGHT COLUMN (4 cols) ===== */}
          <div className="xl:col-span-4 space-y-6">

            {/* 1. Customer Details Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">&#127970;</span>
                  <h2 className="text-sm font-bold text-slate-900">Dettagli Cliente</h2>
                </div>
              </div>
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Azienda</span>
                  <div className="flex items-center gap-2.5 mt-1">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                      {getInitials(ticket.cliente)}
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-900 block">{ticket.cliente}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Referente</span>
                  <p className="text-xs font-semibold text-slate-900 mt-0.5">{ticket.contatto || "Non specificato"}</p>
                </div>
                <div className="space-y-2 pt-1">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Email</span>
                    <p className="text-xs text-blue-600 font-medium mt-0.5 break-all">{ticket.email || "Non fornita"}</p>
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Telefono</span>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">{ticket.telefono || "Non fornito"}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Status & Assignment Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">&#9881;</span>
                  <h2 className="text-sm font-bold text-slate-900">Stato & Assegnazione</h2>
                </div>
              </div>
              <div className="space-y-3.5 text-xs">
                {/* Status selector */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Stato</label>
                  <div className="relative">
                    <select
                      value={selectedStato}
                      onChange={(e) => setSelectedStato(e.target.value as StatoTicket)}
                      disabled={isClosed}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATI_MAP[s]}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Operator assignment */}
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Operatore</span>
                  {isClosed ? (
                    <p className="text-xs text-slate-500">Ticket chiuso</p>
                  ) : currentUser?.ruolo === "admin" ? (
                    <div className="relative">
                      <select
                        value={selectedOperatore}
                        onChange={(e) => { const val = e.target.value; setSelectedOperatore(val); if (val) setSelectedStato("IN_CORSO"); }}
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value="">Non assegnato</option>
                        {operatori.map((op) => (
                          <option key={op.id} value={op.nome}>{op.nome} ({op.ruolo})</option>
                        ))}
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  ) : ticket.operatore === currentUser?.nome ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Assegnato a te
                      </span>
                      <button type="button" onClick={() => { void run(async () => { await updateTicket({ operatore: null, stato: "NUOVO" }); setSelectedOperatore(""); }); }} disabled={saving} className="text-[11px] font-semibold text-amber-600 hover:text-amber-800">
                        Rilascia
                      </button>
                    </div>
                  ) : ticket.operatore ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {ticket.operatore}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Non assegnato</span>
                  )}
                </div>

                {/* Priority selector */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Priorita</label>
                  <div className="relative">
                    <select
                      value={selectedPriorita}
                      onChange={(e) => setSelectedPriorita(e.target.value as Priorita)}
                      disabled={isClosed}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>{PRIORITA_MAP[p]}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Save button */}
                {!isClosed && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Salvataggio...</>
                    ) : saved ? (
                      <><CheckCircleIcon className="h-4 w-4" /> Salvato!</>
                    ) : (
                      "Salva Modifiche"
                    )}
                  </button>
                )}
              </div>
            </section>

            {/* 3. Time Tracking Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">&#9202;</span>
                  <h2 className="text-sm font-bold text-slate-900">Gestione Tempo</h2>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                {ticket.data_inizio_lavoro && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Inizio lavoro:</span>
                    <span className="font-semibold text-slate-800">{ticket.data_inizio_lavoro}</span>
                  </div>
                )}
                {ticket.tempo_stimato_minuti !== null && ticket.tempo_stimato_minuti !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Stimato:</span>
                    <span className="font-semibold text-slate-800">{Math.floor(ticket.tempo_stimato_minuti / 60)}h {ticket.tempo_stimato_minuti % 60}m</span>
                  </div>
                )}
                {ticket.data_chiusura && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Chiusura:</span>
                    <span className="font-semibold text-slate-800">{ticket.data_chiusura}</span>
                  </div>
                )}
                {isClosed && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Tempo Effettivo</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempoEffettivo}
                        onChange={(e) => setTempoEffettivo(e.target.value)}
                        placeholder="es. 2:30"
                        className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400">ore:minuti</span>
                      <button type="button" onClick={saveTempoEffettivo} disabled={savingTempo || !tempoEffettivo.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        Salva
                      </button>
                    </div>
                  </div>
                )}
                {isClosed && ticket.tempo_effettivo_minuti !== null && ticket.tempo_effettivo_minuti !== undefined && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-emerald-600 font-semibold">Tempo Finale:</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {Math.floor(ticket.tempo_effettivo_minuti / 60)}h {ticket.tempo_effettivo_minuti % 60}m
                    </span>
                  </div>
                )}
                {!ticket.data_inizio_lavoro && !isClosed && (
                  <p className="text-xs text-slate-400 italic">Il timer parte quando il ticket viene preso in carico.</p>
                )}
              </div>
            </section>

            {/* 4. Email Log Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">&#9993;</span>
                  <h2 className="text-sm font-bold text-slate-900">Email</h2>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">{emailLog.length} inviate</span>
              </div>

              {showEmailForm && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <input type="text" value={emailOggetto} onChange={(e) => setEmailOggetto(e.target.value)} placeholder="Oggetto email" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none" />
                  <textarea value={emailMessaggio} onChange={(e) => setEmailMessaggio(e.target.value)} placeholder="Messaggio..." rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none resize-none" />
                  <button type="button" onClick={sendManualEmail} disabled={sendingEmail || !emailOggetto.trim() || !emailMessaggio.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {sendingEmail ? "Invio..." : "Invia"}
                  </button>
                </div>
              )}

              {emailLog.length === 0 ? (
                <p className="text-xs text-slate-400">Nessuna email inviata.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {emailLog.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold uppercase ${e.stato === "inviata" ? "text-emerald-600" : "text-red-500"}`}>
                          {e.tipo.replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(e.data_creazione).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 truncate">{e.oggetto}</p>
                      {e.errore && <p className="mt-0.5 text-[10px] text-red-500">{e.errore}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 5. System Info Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">&#128187;</span>
                  <h2 className="text-sm font-bold text-slate-900">Info Sistema</h2>
                </div>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">ID Ticket</span>
                  <span className="font-mono font-bold text-slate-900">{ticket.numero}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Modulo</span>
                  <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{ticket.modulo_software}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Email inviate</span>
                  <span className="font-semibold text-slate-800">{emailLog.length}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
