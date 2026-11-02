"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EditIcon,
  TrashIcon,
  UserPlusIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  LockClosedIcon,
  HeadsetIcon,
  BarChartIcon,
} from "@/components/icons";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import { useOperatore } from "@/lib/operatore-client";

interface Operator {
  id: string;
  nome: string;
  email: string;
  ruolo: "admin" | "operatore";
  attivo: boolean | number;
  data_creazione: string;
  ultimo_accesso: string | null;
}

type FormData = {
  nome: string;
  email: string;
  password: string;
  ruolo: "admin" | "operatore";
};

const EMPTY_FORM: FormData = { nome: "", email: "", password: "", ruolo: "operatore" };

export default function AdminPage() {
  const seqRef = useRef(0);

  // Admin panel state
  const [operatori, setOperatori] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<string | null>(null);

  // Check current user on mount
  const { operatore: sessione, caricamento: caricamentoSessione } = useOperatore();
  const currentOperator = sessione;
  const checking = caricamentoSessione;
  const isAdmin = sessione?.ruolo === "admin";

  const fetchOperators = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await fetch("/api/operatori?all=true");
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      if (seq === seqRef.current) setOperatori(data.operatori);
    } catch {
      if (seq === seqRef.current) setError("Impossibile caricare gli operatori.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchOperators();
  }, [isAdmin, fetchOperators]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const handleExitAdmin = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      // Ignore
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (op: Operator) => {
    setForm({ nome: op.nome, email: op.email, password: "", ruolo: op.ruolo });
    setEditingId(op.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const body: Record<string, string> = {
          nome: form.nome,
          email: form.email,
          ruolo: form.ruolo,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/operatori/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Errore durante l'aggiornamento.");
        }
        setSuccess("Operatore aggiornato con successo.");
      } else {
        if (!form.password) {
          setError("La password è obbligatoria per un nuovo operatore.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Errore durante la creazione.");
        }
        setSuccess("Operatore creato con successo.");
      }
      resetForm();
      fetchOperators();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean | number) => {
    const isActive = !!currentActive;
    if (isActive) {
      setConfirmDelete(id);
      return;
    }
    try {
      const res = await fetch(`/api/operatori/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: true }),
      });
      if (!res.ok) throw new Error("Errore durante l'attivazione.");
      setSuccess("Operatore riattivato.");
      fetchOperators();
    } catch {
      setError("Impossibile riattivare l'operatore.");
    }
  };

  const confirmDeactivate = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/operatori/${confirmDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore durante la disattivazione.");
      setSuccess("Operatore disattivato.");
      setConfirmDelete(null);
      fetchOperators();
    } catch {
      setError("Impossibile disattivare l'operatore.");
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setConfirmPermanentDelete(id);
  };

  const confirmPermanentDeleteAction = async () => {
    if (!confirmPermanentDelete) return;
    try {
      const res = await fetch(`/api/operatori/${confirmPermanentDelete}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permanente: true }),
      });
      if (!res.ok) throw new Error("Errore durante l'eliminazione.");
      setSuccess("Operatore eliminato definitivamente.");
      setConfirmPermanentDelete(null);
      fetchOperators();
    } catch {
      setError("Impossibile eliminare l'operatore.");
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Mai";
    return new Date(d).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Loading
  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  // Not logged in
  if (!currentOperator) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-crema-scuro">
            <HeadsetIcon className="h-6 w-6 text-caldo-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            Devi effettuare il login per accedere a questa pagina.
          </p>
          <a
            href="/login?redirect=/admin"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  // Not admin → show access denied
  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stato-attesa-bordo bg-stato-attesa-bg">
            <LockClosedIcon className="h-6 w-6 text-stato-attesa-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            La gestione operatori è accessibile solo con un account amministratore.
            Effettua il login con le credenziali admin per accedere a questa pagina.
          </p>
          <a
            href="/login?redirect=/admin"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al Login
          </a>
          <p className="mt-4 text-xs text-caldo-testo">
            Sei loggato come <strong>{currentOperator.nome}</strong> ({currentOperator.email})
          </p>
        </div>
      </div>
    );
  }

  // Admin view. Il padding passa da `p-6` a `px-6 py-5` come le altre pagine:
  // il valore non cambia la sostanza ma la cornice si muove tutta insieme.
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Gestione Operatori"
          sottotitolo="Crea, modifica e gestisci gli account degli operatori."
          azioni={
            <div className="flex items-center gap-3">
              <span className="text-xs text-caldo-testo">
                Sessione admin: <strong>{currentOperator.nome}</strong>
              </span>
              <Link
                href="/admin/dashboard"
                className="flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                <BarChartIcon className="h-4 w-4" />
                Dashboard
              </Link>
              <button
                onClick={handleExitAdmin}
                className="flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Esci da Admin
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
              >
                <UserPlusIcon className="h-4 w-4" />
                Nuovo Operatore
              </button>
            </div>
          }
        />

        {/* Alerts */}
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

        {/* Create/Edit Form */}
        {showForm && (
          <div className="mb-6 overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo={editingId ? "Modifica Operatore" : "Nuovo Operatore"} icona={UserPlusIcon}>
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
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="email@esempio.it"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">
                    Password {editingId ? "(lascia vuoto per non cambiare)" : "*"}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    placeholder="Minimo 8 caratteri"
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-caldo-testo">Ruolo *</label>
                  <select
                    required
                    value={form.ruolo}
                    onChange={(e) => setForm({ ...form, ruolo: e.target.value as "admin" | "operatore" })}
                    className="w-full cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  >
                    <option value="operatore">Operatore</option>
                    <option value="admin">Amministratore</option>
                  </select>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {editingId ? "Salva Modifiche" : "Crea Operatore"}
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

        {/* Operators Table */}
        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo="Operatori" icona={UserPlusIcon} conteggio={operatori.length} />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : operatori.length === 0 ? (
            <div className="py-12 text-center text-sm text-caldo-testo">Nessun operatore trovato.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-crema-bordo bg-crema-scuro">
                    <th className="px-5 py-3 font-medium text-caldo-testo">Nome</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Email</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Ruolo</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Stato</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Creato il</th>
                    <th className="px-5 py-3 font-medium text-caldo-testo">Ultimo accesso</th>
                    <th className="px-5 py-3 text-right font-medium text-caldo-testo">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {operatori.map((op) => {
                    const isActive = !!op.attivo;
                    return (
                      <tr key={op.id} className="border-b border-crema-bordo transition-colors duration-200 last:border-0 hover:bg-crema-scuro">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${isActive ? "bg-inchiostro text-white" : "bg-stato-neutro-bg text-stato-neutro-testo"}`}>
                              {op.nome.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-inchiostro">{op.nome}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-caldo-testo">{op.email}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${op.ruolo === "admin" ? "border-stato-malva-bordo bg-stato-malva-bg text-stato-malva-testo" : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"}`}>
                            {op.ruolo === "admin" ? "Admin" : "Operatore"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${isActive ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo" : "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"}`}>
                            {isActive ? "Attivo" : "Inattivo"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-caldo-testo">{formatDate(op.data_creazione)}</td>
                        <td className="px-5 py-3 text-caldo-testo">{formatDate(op.ultimo_accesso)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(op)}
                              className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-info-bordo hover:bg-stato-info-bg hover:text-stato-info-testo"
                              title="Modifica"
                              aria-label={`Modifica ${op.nome}`}
                            >
                              <EditIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(op.id, op.attivo)}
                              className={`cursor-pointer rounded-control border p-1.5 transition-colors duration-200 ${isActive ? "border-crema-contorno text-caldo-testo hover:border-stato-attesa-bordo hover:bg-stato-attesa-bg hover:text-stato-attesa-testo" : "border-crema-contorno text-caldo-testo hover:border-stato-ok-bordo hover:bg-stato-ok-bg hover:text-stato-ok-testo"}`}
                              title={isActive ? "Disattiva" : "Riattiva"}
                              aria-label={isActive ? `Disattiva ${op.nome}` : `Riattiva ${op.nome}`}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                            {isActive && (
                              <button
                                onClick={() => handlePermanentDelete(op.id)}
                                className="cursor-pointer rounded-control border border-crema-contorno p-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-urgenza-bordo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                                title="Elimina definitivamente"
                                aria-label={`Elimina definitivamente ${op.nome}`}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deactivate Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-card border border-crema-contorno bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-inchiostro">Conferma disattivazione</h3>
              <p className="mt-2 text-sm text-caldo-testo">
                Sei sicuro di voler disattivare questo operatore? Non potrà più accedere al sistema.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Annulla
                </button>
                <button
                  onClick={confirmDeactivate}
                  className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-4 py-2 text-sm font-semibold text-stato-urgenza-testo transition-colors duration-200 hover:bg-stato-urgenza-bordo"
                >
                  Disattiva
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permanent Delete Confirmation Modal */}
        {confirmPermanentDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-card border border-crema-contorno bg-white p-6 shadow-lg">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-stato-urgenza-bordo bg-stato-urgenza-bg">
                <TrashIcon className="h-6 w-6 text-stato-urgenza-testo" />
              </div>
              <h3 className="text-center text-lg font-semibold text-inchiostro">Elimina definitivamente?</h3>
              <p className="mt-2 text-center text-sm text-caldo-testo">
                Questa azione è <strong className="text-inchiostro">irreversibile</strong>. L'operatore verrà eliminato permanentemente dal sistema e non potrà più essere recuperato.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmPermanentDelete(null)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Annulla
                </button>
                <button
                  onClick={confirmPermanentDeleteAction}
                  className="cursor-pointer rounded-control bg-pericolo px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-pericolo-scuro"
                >
                  Elimina Definitivamente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
