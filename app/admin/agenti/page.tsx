"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  EditIcon,
  LoaderIcon,
  LockClosedIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import { useOperatore } from "@/lib/operatore-client";
import type {
  Agente,
  AgenteEsecuzione,
  AgenteInput,
  RuoloAgente,
} from "@/lib/types";

type FormData = AgenteInput;

const EMPTY_FORM: FormData = {
  nome: "",
  descrizione: "",
  ruolo: "assistente",
  modello: "deepseek/deepseek-v4.1-flash-1017",
  system_prompt: "",
  attivo: true,
};

const RUOLI: Array<{ valore: RuoloAgente; label: string; esempio: string }> = [
  {
    valore: "assistente",
    label: "Assistente ticket",
    esempio: "Riassume email in arrivo, suggerisce risposte, triage delle richieste di supporto.",
  },
  {
    valore: "contenuti",
    label: "Contenuti social",
    esempio: "Genera post, bozze e calendario editoriale per i social dell'azienda.",
  },
  {
    valore: "clienti",
    label: "Gestione clienti",
    esempio: "Analizza la relazione con un cliente, riassume storico e suggerisce follow-up.",
  },
  { valore: "custom", label: "Personalizzato", esempio: "Uso libero: descrivi il compito nel prompt." },
];

const RUOLO_LABEL: Record<RuoloAgente, string> = Object.fromEntries(
  RUOLI.map((r) => [r.valore, r.label])
) as Record<RuoloAgente, string>;

const STATO_LABEL: Record<string, string> = {
  in_corso: "In corso",
  completata: "Completata",
  errore: "Errore",
};

function dataBreve(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AgentiPage() {
  const seqRef = useRef(0);

  const [agenti, setAgenti] = useState<Agente[]>([]);
  // Backend che servirà le esecuzioni: "hermes" (memoria persistente) o
  // "openrouter". Letto dal server, mostrato nel footer.
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Pannello di prova: invocazione reale + storico esecuzioni.
  const [prova, setProva] = useState<Agente | null>(null);
  const [provaInput, setProvaInput] = useState("");
  const [provaEsecuzione, setProvaEsecuzione] = useState(false);
  const [ultimaEsecuzione, setUltimaEsecuzione] = useState<AgenteEsecuzione | null>(null);
  const [storico, setStorico] = useState<AgenteEsecuzione[]>([]);
  const [storicoLoading, setStoricoLoading] = useState(false);

  const { operatore: sessione, caricamento: caricamentoSessione } = useOperatore();
  const isAdmin = sessione?.ruolo === "admin";

  const fetchAgenti = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/agenti");
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      if (seq === seqRef.current) {
        setAgenti(data.agenti ?? []);
        setProvider(typeof data.provider === "string" ? data.provider : null);
      }
    } catch {
      if (seq === seqRef.current) setError("Impossibile caricare gli agenti.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAgenti();
  }, [isAdmin, fetchAgenti]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const fetchStorico = useCallback(async (agenteId: string) => {
    setStoricoLoading(true);
    try {
      const res = await fetch(`/api/agenti/${agenteId}/esecuzioni?limit=20`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStorico(data.esecuzioni ?? []);
    } catch {
      // Lo storico è secondario: non si blocca il pannello.
      setStorico([]);
    } finally {
      setStoricoLoading(false);
    }
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (a: Agente) => {
    setForm({
      nome: a.nome,
      descrizione: a.descrizione ?? "",
      ruolo: a.ruolo,
      modello: a.modello,
      system_prompt: a.system_prompt,
      attivo: a.attivo,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/agenti/${editingId}` : "/api/agenti", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nel salvataggio.");
      setSuccess(editingId ? "Agente aggiornato." : "Agente creato.");
      resetForm();
      await fetchAgenti();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/agenti/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nell'eliminazione.");
      setSuccess("Agente eliminato (con il suo storico).");
      setConfirmDelete(null);
      if (prova?.id === id) setProva(null);
      await fetchAgenti();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione.");
    }
  };

  const apriProva = (a: Agente) => {
    setProva(a);
    setProvaInput("");
    setUltimaEsecuzione(null);
    setStorico([]);
    void fetchStorico(a.id);
  };

  const esegui = async () => {
    if (!prova || !provaInput.trim()) return;
    setProvaEsecuzione(true);
    setError(null);
    setUltimaEsecuzione(null);
    try {
      const res = await fetch(`/api/agenti/${prova.id}/esegui`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: provaInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Esecuzione fallita.");
      setUltimaEsecuzione(data.esecuzione);
      void fetchStorico(prova.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Esecuzione fallita.");
    } finally {
      setProvaEsecuzione(false);
    }
  };

  if (caricamentoSessione) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!sessione || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stato-attesa-bordo bg-stato-attesa-bg">
            <LockClosedIcon className="h-6 w-6 text-stato-attesa-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            La gestione degli agenti AI è accessibile solo con un account amministratore.
          </p>
          <a
            href="/login?redirect=/admin/agenti"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Agenti AI"
          sottotitolo="Crea e prova assistenti AI: ogni agente è un prompt + un modello, con storico completo delle esecuzioni."
          azioni={
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
            >
              <PlusIcon className="h-4 w-4" />
              Nuovo Agente
            </button>
          }
        />

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
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {showForm && (
          <div className="mb-6 overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo={editingId ? "Modifica Agente" : "Nuovo Agente"} icona={SparklesIcon}>
              <button
                onClick={resetForm}
                aria-label="Chiudi il modulo"
                className="cursor-pointer text-xl leading-none text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
              >
                &times;
              </button>
            </SectionBar>
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Nome *</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="Es. Assistente risposte, Redattore social…"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Ruolo</label>
                  <select
                    value={form.ruolo}
                    onChange={(e) => setForm({ ...form, ruolo: e.target.value as RuoloAgente })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  >
                    {RUOLI.map((r) => (
                      <option key={r.valore} value={r.valore}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-caldo-testo">
                    {RUOLI.find((r) => r.valore === form.ruolo)?.esempio}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Descrizione</label>
                  <input
                    type="text"
                    maxLength={2000}
                    value={form.descrizione ?? ""}
                    onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="A cosa serve questo agente (opzionale)"
                  />
                </div>

                <div className="sm:col-span-2 border-t border-crema-bordo pt-4">
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">
                    Prompt di sistema *
                  </label>
                  <textarea
                    required
                    rows={7}
                    value={form.system_prompt}
                    onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder={"Sei un assistente di supporto tecnico...\nRispondi sempre in italiano, in modo conciso."}
                  />
                  <p className="mt-1 text-xs text-caldo-testo">
                    Istruzioni permanenti dell&apos;agente: identità, compito, vincoli di stile.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Modello</label>
                  <input
                    type="text"
                    value={form.modello ?? ""}
                    onChange={(e) => setForm({ ...form, modello: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 font-mono text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="deepseek/deepseek-v4.1-flash-1017"
                  />
                  <p className="mt-1 text-xs text-caldo-testo">
                    ID modello OpenRouter (vuoto = predefinito).
                  </p>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-caldo-testo">
                    <input
                      type="checkbox"
                      checked={form.attivo !== false}
                      onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-inchiostro"
                    />
                    Attivo (utilizzabile)
                  </label>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {editingId ? "Salva Modifiche" : "Crea Agente"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Agenti configurati" icona={SparklesIcon} conteggio={agenti.length} />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : agenti.length === 0 ? (
            <div className="py-12 text-center text-sm text-caldo-testo">
              Nessun agente ancora. Crialene uno per iniziare a usare l&apos;AI nella tua attività.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-crema-bordo bg-crema-scuro">
                    <th className="px-5 py-3 font-medium text-caldo-testo">Nome</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Ruolo</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Modello</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Stato</th>
                    <th className="px-5 py-3 text-right font-medium text-caldo-testo">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {agenti.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-crema-bordo transition-colors duration-200 last:border-0 hover:bg-crema-scuro"
                    >
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-medium text-inchiostro">
                          {a.nome}
                          {prova?.id === a.id && (
                            <span className="inline-flex items-center rounded-full border border-stato-info-bordo bg-stato-info-bg px-2 py-0.5 text-[11px] font-medium text-stato-info-testo">
                              In prova
                            </span>
                          )}
                        </span>
                        {a.descrizione && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-caldo-testo">{a.descrizione}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-caldo-testo">
                        {RUOLO_LABEL[a.ruolo] ?? a.ruolo}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-caldo-testo">{a.modello}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            a.attivo
                              ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                              : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"
                          }`}
                        >
                          {a.attivo ? "Attivo" : "Disattivato"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => apriProva(a)}
                            className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:border-stato-info-bordo hover:bg-stato-info-bg hover:text-stato-info-testo"
                            title="Prova l'agente"
                          >
                            <SendIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleEdit(a)}
                            className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-info-bordo hover:bg-stato-info-bg hover:text-stato-info-testo"
                            title="Modifica"
                            aria-label={`Modifica ${a.nome}`}
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>
                          {confirmDelete === a.id ? (
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1.5 text-xs font-semibold text-stato-urgenza-testo"
                              title="Conferma eliminazione"
                            >
                              Conferma
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(a.id)}
                              className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-urgenza-bordo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                              title="Elimina"
                              aria-label={`Elimina ${a.nome}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* --- Pannello di prova + storico esecuzioni -------------------- */}
        {prova && (
          <div className="mt-6 overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo={`Prova: ${prova.nome}`} icona={SparklesIcon}>
              <button
                onClick={() => setProva(null)}
                aria-label="Chiudi il pannello di prova"
                className="cursor-pointer text-xl leading-none text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
              >
                &times;
              </button>
            </SectionBar>
            <div className="p-5">
              <label className="mb-1 block text-sm font-medium text-caldo-testo">
                Messaggio di prova
              </label>
              <textarea
                rows={3}
                value={provaInput}
                onChange={(e) => setProvaInput(e.target.value)}
                placeholder="Scrivi qui un messaggio da inviare all'agente…"
                className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={esegui}
                  disabled={provaEsecuzione || !provaInput.trim() || !prova.attivo}
                  className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {provaEsecuzione ? (
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendIcon className="h-4 w-4" />
                  )}
                  Esegui
                </button>
                {!prova.attivo && (
                  <span className="text-xs text-caldo-testo">Agente disattivato: attivalo per eseguirlo.</span>
                )}
              </div>

              {ultimaEsecuzione && (
                <div
                  className={`mt-4 rounded-control border p-4 ${
                    ultimaEsecuzione.stato === "completata"
                      ? "border-stato-ok-bordo bg-stato-ok-bg"
                      : "border-stato-urgenza-bordo bg-stato-urgenza-bg"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${
                        ultimaEsecuzione.stato === "completata"
                          ? "border-stato-ok-bordo bg-white text-stato-ok-testo"
                          : "border-stato-urgenza-bordo bg-white text-stato-urgenza-testo"
                      }`}
                    >
                      {STATO_LABEL[ultimaEsecuzione.stato] ?? ultimaEsecuzione.stato}
                    </span>
                    {ultimaEsecuzione.durata_ms != null && (
                      <span className="text-caldo-testo">{ultimaEsecuzione.durata_ms} ms</span>
                    )}
                    {ultimaEsecuzione.prompt_tokens != null && (
                      <span className="text-caldo-testo">
                        {ultimaEsecuzione.prompt_tokens}+{ultimaEsecuzione.completion_tokens ?? 0} token
                      </span>
                    )}
                    <span className="text-caldo-testo">{dataBreve(ultimaEsecuzione.data_creazione)}</span>
                  </div>
                  <div className="whitespace-pre-wrap rounded-control bg-white p-3 text-sm text-inchiostro">
                    {ultimaEsecuzione.stato === "completata"
                      ? ultimaEsecuzione.output
                      : ultimaEsecuzione.errore}
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-crema-bordo pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                    Storico esecuzioni
                  </p>
                  <button
                    onClick={() => void fetchStorico(prova.id)}
                    className="flex cursor-pointer items-center gap-1 text-xs text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                  >
                    <RefreshIcon className="h-3.5 w-3.5" />
                    Aggiorna
                  </button>
                </div>
                {storicoLoading ? (
                  <div className="flex justify-center py-6">
                    <LoaderIcon className="h-5 w-5 animate-spin text-inchiostro" />
                  </div>
                ) : storico.length === 0 ? (
                  <p className="py-4 text-center text-sm text-caldo-testo">
                    Nessuna esecuzione registrata.
                  </p>
                ) : (
                  <ul className="divide-y divide-crema-bordo">
                    {storico.map((es) => (
                      <li key={es.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${
                              es.stato === "completata"
                                ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                                : es.stato === "errore"
                                  ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
                                  : "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo"
                            }`}
                          >
                            {STATO_LABEL[es.stato] ?? es.stato}
                          </span>
                          <span className="text-caldo-testo">{dataBreve(es.data_creazione)}</span>
                          {es.durata_ms != null && (
                            <span className="text-caldo-testo">{es.durata_ms} ms</span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm text-inchiostro">
                          <span className="text-caldo-testo">In: </span>
                          {es.input_utente}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-caldo-testo">
                          <span className="font-medium">Out: </span>
                          {es.stato === "completata" ? es.output : es.errore}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-caldo-testo">
          Ogni esecuzione viene registrata con input, output, modello e durata.{" "}
          {provider === "hermes" ? (
            <>
              Provider attivo: <strong className="text-inchiostro">Hermes</strong> — gli agenti
              girano con memoria persistente, skills e tool di Hermes (memoria per-agente,
              continua tra le esecuzioni).
            </>
          ) : provider === "openrouter" ? (
            <>
              Provider attivo: <strong className="text-inchiostro">OpenRouter</strong> —
              invocazioni dirette, senza memoria di sessione. Per attivare la memoria persistente
              configura <code className="rounded border border-crema-contorno bg-white px-1">HERMES_BASE_URL</code>{" "}
              e <code className="rounded border border-crema-contorno bg-white px-1">HERMES_API_KEY</code>.
            </>
          ) : (
            <>
              Le invocazioni usano la chiave{" "}
              <code className="rounded border border-crema-contorno bg-white px-1">OPENROUTER_API_KEY</code>{" "}
              già configurata per la classificazione email.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
