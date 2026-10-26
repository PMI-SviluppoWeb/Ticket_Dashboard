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
import {
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
  chip,
} from "@/components/badges";
import {
  InfoIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
  EditIcon,
  BookIcon,
  UserIcon,
  UserPlusIcon,
  MailIcon,
  ClockIcon,
  CalendarIcon,
  TicketIcon,
  FolderIcon,
} from "@/components/icons";

// Base del chip.
//
// Arriva dal kit (`chip()`), non da una copia locale: i chip di stato e priorita'
// non sono coperti dai componenti gia' pronti del kit, perche' quello di stato
// porta anche il puntino e quello di priorita' il prefisso "Priorita: ". Senza
// questa base i chip resterebbero senza padding e senza bordo (`border-<colore>`
// da solo non disegna nulla: la larghezza del bordo e' 0 finche' non arriva
// `border`).
const CHIP_BASE = chip("", { taglia: "lg" });

// Colore del puntino pieno di ciascuno stato.
//
// Il kit condiviso (components/badges.tsx) esporta i chip completi ma non i
// puntini: qui serve la sola tinta, non fondo+bordo. Si usa la tinta di TESTO
// della stessa famiglia semantica di STATUS_STYLES, cosi' il puntino e il chip
// raccontano lo stesso stato con lo stesso colore. Un -bg sarebbe troppo chiaro
// per un puntino da 6px (e' un fondo pensato per stendere un chip intero).
const STATI_DOT: Record<StatoTicket, string> = {
  NUOVO: "bg-stato-info-testo",
  IN_CORSO: "bg-stato-malva-testo",
  RISOLTO: "bg-stato-ok-testo",
  CHIUSO: "bg-stato-neutro-testo",
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
      <div className="flex h-full items-center justify-center bg-crema">
        <div className="flex items-center gap-3 text-caldo-testo">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-crema-contorno border-t-inchiostro" />
          <span className="text-sm font-medium">Caricamento ticket...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-crema p-8">
        <p className="text-sm text-caldo-testo">Ticket non trovato.</p>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-control border border-crema-contorno bg-white px-5 py-2.5 text-sm font-medium text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
        >
          Torna alla dashboard
        </button>
      </div>
    );
  }

  const isClosed = ticket.stato === "CHIUSO";

  return (
    <div className="flex h-full flex-col bg-crema">
      {/* Main Content */}
      <main className="flex-1 space-y-6 overflow-y-auto px-6 py-6 lg:px-8">
        {/* Error banner — l'errore e' un ticket che richiede attenzione, quindi
            famiglia urgenza (come la priorita' ALTA), non `pericolo`: quello e'
            riservato alle azioni irreversibili. */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-panel border border-stato-urgenza-bordo bg-stato-urgenza-bg px-4 py-3 text-sm font-medium text-stato-urgenza-testo"
          >
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Closed ticket banner */}
        {isClosed && (
          <div className="flex items-center gap-2.5 rounded-panel border border-stato-neutro-bordo bg-stato-neutro-bg px-4 py-3 text-sm text-stato-neutro-testo">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            Ticket chiuso il {ticket.data_chiusura}. Modifiche non consentite.
          </div>
        )}

        {/* ========== TICKET HEADER ========== */}
        <section className="rounded-panel border border-crema-contorno bg-white p-6">
          {/* Row 1: Breadcrumb & sync status */}
          <div className="flex items-center justify-between gap-4 border-b border-crema-bordo pb-4 text-xs">
            <nav aria-label="Percorso" className="flex items-center gap-2 font-medium text-caldo-testo">
              <button
                type="button"
                onClick={onBack}
                className="cursor-pointer transition-colors duration-200 hover:text-inchiostro"
              >
                Dashboard
              </button>
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo/60" />
              <span className="tabular font-semibold text-inchiostro">{ticket.numero}</span>
            </nav>
            <div className="flex items-center gap-2 text-xs font-medium text-caldo-testo">
              <span className={`inline-block h-2 w-2 rounded-full ${STATI_DOT[ticket.stato]}`} />
              {STATUS_LABELS[ticket.stato]}
            </div>
          </div>

          {/* Row 2: Title, badges, actions */}
          <div className="flex items-start justify-between gap-6 py-5">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="tabular rounded-control bg-inchiostro px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-white">
                  #{ticket.numero}
                </span>
                <span className={`${CHIP_BASE} ${STATUS_STYLES[ticket.stato]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATI_DOT[ticket.stato]}`} />
                  {STATUS_LABELS[ticket.stato]}
                </span>
                <span className={`${CHIP_BASE} ${PRIORITY_STYLES[ticket.priorita]}`}>
                  Priorita: {PRIORITY_LABELS[ticket.priorita]}
                </span>
              </div>
              <h1 className="break-words text-xl font-bold leading-snug tracking-tight text-inchiostro sm:text-2xl">
                {ticket.sommario_problema}
              </h1>
            </div>

            {/* Action buttons stack */}
            <div className="flex w-64 flex-shrink-0 flex-col gap-2">
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
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-inchiostro px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <UserPlusIcon className="h-4 w-4" />
                  )}
                  Prendi in carico
                </button>
              )}

              {ticket.email && (
                <button
                  type="button"
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  aria-expanded={showEmailForm}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-crema-contorno bg-white px-3 py-2 text-xs font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro sm:text-sm"
                >
                  <MailIcon className="h-4 w-4" />
                  {showEmailForm ? "Chiudi Email" : "Invia Email / Rispondi"}
                </button>
              )}

              {!confirmClose ? (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  disabled={isClosed}
                  aria-expanded={confirmClose}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-crema-contorno bg-crema-scuro px-3 py-2 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                >
                  {isClosed ? "Gi Chiuso" : "Chiudi Ticket"}
                </button>
              ) : (
                <div className="flex w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    disabled={saving}
                    className="flex-1 cursor-pointer rounded-control bg-inchiostro px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Chiusura..." : "Conferma"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClose(false)}
                    className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro"
                  >
                    Annulla
                  </button>
                </div>
              )}

              {/* Delete button — azione distruttiva, quindi `pericolo` e non
                  `stato-urgenza`: il rosso urgenza segnala un ticket urgente,
                  questo rosso segnala qualcosa che non si puo' annullare. */}
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-expanded={confirmDelete}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent bg-pericolo/10 px-3 py-2 text-xs font-semibold text-pericolo transition-colors duration-200 hover:bg-pericolo/20 sm:text-sm"
                >
                  Elimina Ticket
                </button>
              ) : (
                <div className="flex w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={elimina}
                    disabled={saving}
                    className="flex-1 cursor-pointer rounded-control bg-pericolo px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-pericolo-scuro disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Eliminazione..." : "Conferma Elimina"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro"
                  >
                    Annulla
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Metadata bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-crema-bordo pt-3 text-xs text-caldo-testo">
            <div className="flex items-center gap-1.5 font-medium text-inchiostro">
              <TicketIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo" />
              <span>Modulo:</span>
              <span className="rounded bg-crema-scuro px-2 py-0.5 font-mono font-semibold text-inchiostro">
                {ticket.modulo_software}
              </span>
            </div>
            <span className="h-3 w-px bg-crema-contorno" />
            <div className="flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo" />
              <span>
                Ricevuto: <strong className="tabular font-semibold text-inchiostro">{ticket.data_creazione}</strong>
              </span>
            </div>
            {ticket.operatore && (
              <>
                <span className="h-3 w-px bg-crema-contorno" />
                <div className="flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo" />
                  <span>
                    Operatore: <strong className="font-semibold text-inchiostro">{ticket.operatore}</strong>
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Unassigned ticket CTA */}
        {!isClosed && currentUser?.ruolo !== "admin" && !ticket.operatore && (
          <div className="flex items-center justify-between rounded-panel border border-stato-info-bordo bg-stato-info-bg p-4">
            <div className="flex items-center gap-3">
              <InfoIcon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Questo ticket e disponibile</p>
                <p className="text-xs">Nessun operatore assegnato. Puoi prendere in carico.</p>
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
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Assegnamento..." : "Prendi in carico"}
            </button>
          </div>
        )}

        {/* Assigned to another operator */}
        {!isClosed && currentUser?.ruolo !== "admin" && ticket.operatore && ticket.operatore !== currentUser?.nome && (
          <div className="flex items-center justify-between rounded-panel border border-stato-attesa-bordo bg-stato-attesa-bg p-4">
            <div className="flex items-center gap-3">
              <AlertCircleIcon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Assegnato a <strong>{ticket.operatore}</strong></p>
                <p className="text-xs">Puoi visualizzare ma le modifiche sono limitate.</p>
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
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stato-attesa-bordo bg-white px-4 py-2 text-sm font-semibold text-stato-attesa-testo transition-colors duration-200 hover:bg-crema-scuro disabled:cursor-not-allowed disabled:opacity-50"
            >
              Collabora
            </button>
          </div>
        )}

        {/* ========== 2-COLUMN GRID ========== */}
        <div className="grid w-full grid-cols-1 items-start gap-6 xl:grid-cols-12">
          {/* ===== LEFT COLUMN (8 cols) ===== */}
          <div className="space-y-6 xl:col-span-8">

            {/* 1. Customer Message Card */}
            <section className="overflow-hidden rounded-panel border border-crema-contorno bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-crema-bordo bg-crema-scuro px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-control border border-stato-info-bordo bg-stato-info-bg text-stato-info-testo">
                    <MailIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-inchiostro">Richiesta Originale</h2>
                    <p className="text-xs text-caldo-testo">Descrizione del problema</p>
                  </div>
                </div>
                <span className="tabular inline-flex items-center gap-1.5 rounded-control border border-crema-contorno bg-white px-2.5 py-1 text-xs font-medium text-caldo-testo">
                  {ticket.data_creazione}
                </span>
              </div>
              <div className="space-y-5 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-inchiostro text-sm font-bold text-white ring-4 ring-crema-scuro">
                      {getInitials(ticket.contatto || ticket.cliente)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-inchiostro">{ticket.contatto || "Non specificato"}</h3>
                        <span className="rounded bg-stato-neutro-bg px-2 py-0.5 text-[11px] font-medium text-stato-neutro-testo">{ticket.cliente}</span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-caldo-testo">{ticket.email || "Nessuna email"}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-panel border border-crema-bordo bg-crema-scuro p-5 text-sm leading-relaxed text-caldo-testo">
                  <div className="flex items-center gap-2 border-b border-crema-contorno pb-2.5 text-xs font-semibold text-caldo-testo">
                    <span>Oggetto:</span>
                    <span className="font-bold text-inchiostro">{ticket.sommario_problema}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{ticket.descrizione_dettagliata}</p>
                  {ticket.note && (
                    <div className="border-t border-crema-contorno pt-3">
                      <p className="mb-1 text-xs font-semibold text-inchiostro">Note interne:</p>
                      <p className="whitespace-pre-wrap text-xs text-caldo-testo">{ticket.note}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Quick Reply / Composer */}
            <section className="space-y-4 rounded-panel border border-crema-contorno bg-white p-6">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-control border border-stato-malva-bordo bg-stato-malva-bg text-stato-malva-testo">
                    <EditIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-inchiostro">Risposta Rapida</h2>
                    <p className="text-xs text-caldo-testo">Aggiungi una nota interna</p>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden rounded-control border border-crema-contorno bg-white transition-colors duration-200 focus-within:border-inchiostro focus-within:ring-2 focus-within:ring-inchiostro/20">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Scrivi una nota interna..."
                  disabled={isClosed}
                  className="min-h-[80px] w-full resize-y border-0 p-4 text-xs text-inchiostro placeholder-caldo-testo focus:ring-0 disabled:cursor-not-allowed disabled:bg-crema-scuro sm:text-sm"
                />
                <div className="flex items-center justify-end border-t border-crema-bordo bg-crema-scuro px-4 py-2.5">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving || isClosed}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-inchiostro px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva Note"}
                  </button>
                </div>
              </div>
            </section>

            {/* 3. Technical Notes */}
            <section className="space-y-4 rounded-panel border border-crema-contorno bg-white p-6">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-control border border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo">
                    <BookIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-inchiostro">Note Tecniche</h2>
                    <p className="tabular text-xs text-caldo-testo">{ticket.note_tecniche.length} note archiviate</p>
                  </div>
                </div>
              </div>

              {/* Add/Edit Note Form */}
              {!isClosed && (
                <div className="space-y-3 rounded-panel border border-crema-contorno bg-crema-scuro p-4">
                  <h3 className="text-xs font-semibold text-inchiostro">
                    {editingNote ? "Modifica Nota" : "Nuova Nota Tecnica"}
                  </h3>
                  <input
                    value={noteForm.titolo}
                    onChange={(e) => setNoteForm((f) => ({ ...f, titolo: e.target.value }))}
                    placeholder="Titolo nota *"
                    className="w-full rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro placeholder-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  />
                  <textarea
                    value={noteForm.problema}
                    onChange={(e) => setNoteForm((f) => ({ ...f, problema: e.target.value }))}
                    rows={2}
                    placeholder="Problema riscontrato..."
                    className="w-full resize-none rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro placeholder-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  />
                  <textarea
                    value={noteForm.soluzione}
                    onChange={(e) => setNoteForm((f) => ({ ...f, soluzione: e.target.value }))}
                    rows={3}
                    placeholder="Soluzione applicata *"
                    className="w-full resize-none rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro placeholder-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  />

                  {/* File Upload */}
                  <div className="rounded-control border-2 border-dashed border-stato-malva-bordo bg-white p-3 text-center transition-colors duration-200 hover:border-stato-malva-testo">
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
                    <label htmlFor="note-file-input-new" className="cursor-pointer text-stato-malva-testo transition-colors duration-200 hover:text-inchiostro">
                      <p className="text-xs font-medium text-caldo-testo">Allega file</p>
                      <p className="text-[10px] text-caldo-testo">Immagini, PDF, documenti...</p>
                    </label>
                  </div>

                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-control border border-crema-contorno bg-white p-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-stato-malva-bg text-[9px] font-bold text-stato-malva-testo">
                            {file.name.split(".").pop()?.toUpperCase() || "?"}
                          </div>
                          <span className="flex-1 truncate text-xs text-inchiostro">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label={`Rimuovi ${file.name}`}
                            className="cursor-pointer p-0.5 text-caldo-testo transition-colors duration-200 hover:text-pericolo"
                          >
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
                      className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Salvataggio..." : editingNote ? "Aggiorna" : "Aggiungi Nota"}
                    </button>
                    {editingNote && (
                      <button
                        type="button"
                        onClick={() => { setEditingNote(null); setNoteForm({ titolo: "", problema: "", soluzione: "" }); setPendingFiles([]); }}
                        className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-white"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Notes List */}
              {ticket.note_tecniche.length === 0 ? (
                <p className="rounded-panel border border-dashed border-crema-contorno p-4 text-center text-sm text-caldo-testo">
                  Nessuna nota tecnica presente.
                </p>
              ) : (
                <div className="space-y-3">
                  {ticket.note_tecniche.map((n) => (
                    <div key={n.id} className="rounded-panel border border-crema-contorno bg-crema-scuro p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-inchiostro">{n.titolo}</h4>
                          <p className="tabular mt-0.5 text-[11px] text-caldo-testo">
                            {n.data_creazione}{n.operatore ? ` - ${n.operatore}` : ""}
                          </p>
                          {n.allegati && n.allegati.length > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-stato-malva-bordo bg-stato-malva-bg px-2 py-0.5 text-[10px] font-semibold text-stato-malva-testo">
                              {n.allegati.length} {n.allegati.length === 1 ? "allegato" : "allegati"}
                            </span>
                          )}
                        </div>
                        {!isClosed && (
                          <div className="flex shrink-0 gap-1.5">
                            <label className="cursor-pointer rounded-control border border-stato-malva-bordo bg-stato-malva-bg px-2 py-1 text-[11px] font-medium text-stato-malva-testo transition-colors duration-200 hover:border-stato-malva-testo">
                              Allega
                              <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z" onChange={(e) => handleFileSelect(e, n.id)} />
                            </label>
                            <button
                              type="button"
                              onClick={() => setExpandedNote(expandedNote === n.id ? null : n.id)}
                              aria-expanded={expandedNote === n.id}
                              aria-label={expandedNote === n.id ? "Comprimi dettagli nota" : "Espandi dettagli nota"}
                              className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                            >
                              <ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${expandedNote === n.id ? "rotate-180" : ""}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditNote(n)}
                              aria-label="Modifica nota"
                              className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                            >
                              <EditIcon className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeNote(n.id)}
                              aria-label="Elimina nota"
                              className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1 text-stato-urgenza-testo transition-colors duration-200 hover:bg-stato-urgenza-bordo"
                            >
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Upload progress */}
                      {uploadingNoteId === n.id && uploadingFile && (
                        <div className="mt-3 rounded-panel border border-stato-malva-bordo bg-stato-malva-bg p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="max-w-[200px] truncate text-xs font-medium text-stato-malva-testo">{uploadingFile.name}</span>
                            <span className="tabular text-[10px] text-stato-malva-testo">{formatFileSize(uploadingFile.size)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
                            <div className="h-full bg-stato-malva-testo transition-colors duration-300" style={{ width: `${uploadProgress}%` }} />
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={uploadFile}
                              disabled={saving}
                              className="cursor-pointer rounded-control bg-inchiostro px-3 py-1 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {saving ? "Caricamento..." : "Carica"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelUpload}
                              className="cursor-pointer rounded-control border border-crema-contorno bg-white px-3 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      {n.allegati && n.allegati.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {n.allegati.map((allegato) => (
                            <div key={allegato.id} className="flex items-center gap-2 rounded-control border border-crema-contorno bg-white p-2">
                              {isImageFile(allegato.tipo_mime) ? (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-crema-scuro">
                                  <img src={`/api/uploads/${allegato.id}`} alt={allegato.nome_originale} className="h-full w-full object-cover" />
                                </div>
                              ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-stato-info-bg text-[10px] font-bold text-stato-info-testo">
                                  {allegato.nome_originale.split(".").pop()?.toUpperCase() || "?"}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <a href={`/api/uploads/${allegato.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium text-inchiostro underline-offset-2 transition-colors duration-200 hover:underline">
                                  {allegato.nome_originale}
                                </a>
                                <p className="tabular text-[10px] text-caldo-testo">{formatFileSize(allegato.dimensione)}</p>
                              </div>
                              {!isClosed && (
                                <button
                                  type="button"
                                  onClick={() => deleteAttachment(allegato.id)}
                                  title="Elimina"
                                  aria-label={`Elimina allegato ${allegato.nome_originale}`}
                                  className="shrink-0 cursor-pointer rounded p-1 text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-pericolo"
                                >
                                  <TrashIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Expanded details */}
                      {expandedNote === n.id && (
                        <div className="mt-3 space-y-2 border-t border-crema-contorno pt-3">
                          {n.problema && (
                            <div>
                              <h5 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">Problema</h5>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-caldo-testo">{n.problema}</p>
                            </div>
                          )}
                          <div>
                            <h5 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-stato-ok-testo">Soluzione</h5>
                            <p className="whitespace-pre-wrap rounded-panel border border-stato-ok-bordo bg-stato-ok-bg p-2.5 text-xs leading-relaxed text-stato-ok-testo">{n.soluzione}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ===== RIGHT COLUMN (4 cols) ===== */}
          <div className="space-y-6 xl:col-span-4">

            {/* 1. Customer Details Card */}
            <section className="space-y-4 rounded-panel border border-crema-contorno bg-white p-5">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-3">
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4 text-caldo-testo" />
                  <h2 className="text-sm font-bold text-inchiostro">Dettagli Cliente</h2>
                </div>
              </div>
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Azienda</span>
                  <div className="mt-1 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-control bg-stato-info-bg text-xs font-bold text-stato-info-testo">
                      {getInitials(ticket.cliente)}
                    </div>
                    <div>
                      <span className="block text-sm font-bold text-inchiostro">{ticket.cliente}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Referente</span>
                  <p className="mt-0.5 text-xs font-semibold text-inchiostro">{ticket.contatto || "Non specificato"}</p>
                </div>
                <div className="space-y-2 pt-1">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Email</span>
                    <p className="mt-0.5 break-all text-xs font-medium text-inchiostro">{ticket.email || "Non fornita"}</p>
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Telefono</span>
                    <p className="tabular mt-0.5 text-xs font-medium text-caldo-testo">{ticket.telefono || "Non fornito"}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Status & Assignment Card */}
            <section className="space-y-4 rounded-panel border border-crema-contorno bg-white p-5">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-3">
                <div className="flex items-center gap-2">
                  <EditIcon className="h-4 w-4 text-caldo-testo" />
                  <h2 className="text-sm font-bold text-inchiostro">Stato & Assegnazione</h2>
                </div>
              </div>
              <div className="space-y-3.5 text-xs">
                {/* Status selector */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Stato</label>
                  <div className="relative">
                    <select
                      value={selectedStato}
                      onChange={(e) => setSelectedStato(e.target.value as StatoTicket)}
                      disabled={isClosed}
                      className="w-full cursor-pointer appearance-none rounded-control border border-crema-contorno bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:ring-2 focus:ring-inchiostro/20 disabled:cursor-not-allowed disabled:bg-crema-scuro"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-[calc(50%-0.5rem)] h-4 w-4 text-caldo-testo" />
                  </div>
                </div>

                {/* Operator assignment */}
                <div>
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Operatore</span>
                  {isClosed ? (
                    <p className="text-xs text-caldo-testo">Ticket chiuso</p>
                  ) : currentUser?.ruolo === "admin" ? (
                    <div className="relative">
                      <select
                        value={selectedOperatore}
                        onChange={(e) => { const val = e.target.value; setSelectedOperatore(val); if (val) setSelectedStato("IN_CORSO"); }}
                        className="w-full cursor-pointer appearance-none rounded-control border border-crema-contorno bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:ring-2 focus:ring-inchiostro/20"
                      >
                        <option value="">Non assegnato</option>
                        {operatori.map((op) => (
                          <option key={op.id} value={op.nome}>{op.nome} ({op.ruolo})</option>
                        ))}
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-[calc(50%-0.5rem)] h-4 w-4 text-caldo-testo" />
                    </div>
                  ) : ticket.operatore === currentUser?.nome ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-control border border-stato-ok-bordo bg-stato-ok-bg px-3 py-2 text-xs font-medium text-stato-ok-testo">
                        <span className="h-1.5 w-1.5 rounded-full bg-stato-ok-testo" /> Assegnato a te
                      </span>
                      <button
                        type="button"
                        onClick={() => { void run(async () => { await updateTicket({ operatore: null, stato: "NUOVO" }); setSelectedOperatore(""); }); }}
                        disabled={saving}
                        className="cursor-pointer text-[11px] font-semibold text-stato-attesa-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Rilascia
                      </button>
                    </div>
                  ) : ticket.operatore ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-stato-neutro-testo">
                      <span className="h-1.5 w-1.5 rounded-full bg-stato-neutro-testo" /> {ticket.operatore}
                    </span>
                  ) : (
                    <span className="text-xs text-caldo-testo">Non assegnato</span>
                  )}
                </div>

                {/* Priority selector */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Priorita</label>
                  <div className="relative">
                    <select
                      value={selectedPriorita}
                      onChange={(e) => setSelectedPriorita(e.target.value as Priorita)}
                      disabled={isClosed}
                      className="w-full cursor-pointer appearance-none rounded-control border border-crema-contorno bg-white px-3 py-2.5 pr-8 text-xs font-semibold text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:ring-2 focus:ring-inchiostro/20 disabled:cursor-not-allowed disabled:bg-crema-scuro"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-[calc(50%-0.5rem)] h-4 w-4 text-caldo-testo" />
                  </div>
                </div>

                {/* Save button */}
                {!isClosed && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-inchiostro px-4 py-2.5 text-xs font-bold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
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
            <section className="space-y-3.5 rounded-panel border border-crema-contorno bg-white p-5">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-2">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-caldo-testo" />
                  <h2 className="text-sm font-bold text-inchiostro">Gestione Tempo</h2>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                {ticket.data_inizio_lavoro && (
                  <div className="flex items-center justify-between">
                    <span className="text-caldo-testo">Inizio lavoro:</span>
                    <span className="tabular font-semibold text-inchiostro">{ticket.data_inizio_lavoro}</span>
                  </div>
                )}
                {ticket.tempo_stimato_minuti !== null && ticket.tempo_stimato_minuti !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-caldo-testo">Stimato:</span>
                    <span className="tabular font-semibold text-inchiostro">{Math.floor(ticket.tempo_stimato_minuti / 60)}h {ticket.tempo_stimato_minuti % 60}m</span>
                  </div>
                )}
                {ticket.data_chiusura && (
                  <div className="flex items-center justify-between">
                    <span className="text-caldo-testo">Chiusura:</span>
                    <span className="tabular font-semibold text-inchiostro">{ticket.data_chiusura}</span>
                  </div>
                )}
                {isClosed && (
                  <div className="border-t border-crema-bordo pt-2">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">Tempo Effettivo</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tempoEffettivo}
                        onChange={(e) => setTempoEffettivo(e.target.value)}
                        placeholder="es. 2:30"
                        className="tabular w-24 rounded-control border border-crema-contorno px-3 py-1.5 text-xs text-inchiostro placeholder-caldo-testo transition-colors duration-200 focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                      />
                      <span className="text-[10px] text-caldo-testo">ore:minuti</span>
                      <button
                        type="button"
                        onClick={saveTempoEffettivo}
                        disabled={savingTempo || !tempoEffettivo.trim()}
                        className="cursor-pointer rounded-control bg-inchiostro px-3 py-1.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Salva
                      </button>
                    </div>
                  </div>
                )}
                {isClosed && ticket.tempo_effettivo_minuti !== null && ticket.tempo_effettivo_minuti !== undefined && (
                  <div className="flex items-center justify-between border-t border-crema-bordo pt-2">
                    <span className="font-semibold text-stato-ok-testo">Tempo Finale:</span>
                    <span className="tabular rounded border border-stato-ok-bordo bg-stato-ok-bg px-2 py-0.5 font-bold text-stato-ok-testo">
                      {Math.floor(ticket.tempo_effettivo_minuti / 60)}h {ticket.tempo_effettivo_minuti % 60}m
                    </span>
                  </div>
                )}
                {!ticket.data_inizio_lavoro && !isClosed && (
                  <p className="text-xs italic text-caldo-testo">Il timer parte quando il ticket viene preso in carico.</p>
                )}
              </div>
            </section>

            {/* 4. Email Log Card */}
            <section className="space-y-3 rounded-panel border border-crema-contorno bg-white p-5">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-2">
                <div className="flex items-center gap-2">
                  <MailIcon className="h-4 w-4 text-caldo-testo" />
                  <h2 className="text-sm font-bold text-inchiostro">Email</h2>
                </div>
                <span className="tabular text-[10px] font-semibold text-caldo-testo">{emailLog.length} inviate</span>
              </div>

              {showEmailForm && (
                <div className="space-y-2 rounded-panel border border-stato-info-bordo bg-stato-info-bg p-3">
                  <input
                    type="text"
                    value={emailOggetto}
                    onChange={(e) => setEmailOggetto(e.target.value)}
                    placeholder="Oggetto email"
                    className="w-full rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder-caldo-testo transition-colors duration-200 focus:border-inchiostro focus:outline-none"
                  />
                  <textarea
                    value={emailMessaggio}
                    onChange={(e) => setEmailMessaggio(e.target.value)}
                    placeholder="Messaggio..."
                    rows={3}
                    className="w-full resize-none rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro placeholder-caldo-testo transition-colors duration-200 focus:border-inchiostro focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={sendManualEmail}
                    disabled={sendingEmail || !emailOggetto.trim() || !emailMessaggio.trim()}
                    className="cursor-pointer rounded-control bg-inchiostro px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingEmail ? "Invio..." : "Invia"}
                  </button>
                </div>
              )}

              {emailLog.length === 0 ? (
                <p className="text-xs text-caldo-testo">Nessuna email inviata.</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {emailLog.map((e) => (
                    <div key={e.id} className="rounded-control border border-crema-bordo p-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold uppercase ${e.stato === "inviata" ? "text-stato-ok-testo" : "text-stato-urgenza-testo"}`}>
                          {e.tipo.replace("_", " ")}
                        </span>
                        <span className="tabular text-[10px] text-caldo-testo">
                          {new Date(e.data_creazione).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-caldo-testo">{e.oggetto}</p>
                      {e.errore && <p className="mt-0.5 text-[10px] text-stato-urgenza-testo">{e.errore}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 5. System Info Card */}
            <section className="space-y-3 rounded-panel border border-crema-contorno bg-white p-5">
              <div className="flex items-center justify-between border-b border-crema-bordo pb-2">
                <div className="flex items-center gap-2">
                  <TicketIcon className="h-4 w-4 text-caldo-testo" />
                  <h2 className="text-sm font-bold text-inchiostro">Info Sistema</h2>
                </div>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-crema-bordo py-1">
                  <span className="text-caldo-testo">ID Ticket</span>
                  <span className="tabular font-mono font-bold text-inchiostro">{ticket.numero}</span>
                </div>
                <div className="flex items-center justify-between border-b border-crema-bordo py-1">
                  <span className="text-caldo-testo">Modulo</span>
                  <span className="rounded bg-crema-scuro px-2 py-0.5 font-mono text-[11px] font-semibold text-inchiostro">{ticket.modulo_software}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-caldo-testo">Email inviate</span>
                  <span className="tabular font-semibold text-inchiostro">{emailLog.length}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
