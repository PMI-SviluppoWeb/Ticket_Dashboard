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
} from "@/components/icons";

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
  const [currentOperator, setCurrentOperator] = useState<{ nome: string; email: string; ruolo: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Switch admin state
  const [switchEmail, setSwitchEmail] = useState("");
  const [switchPassword, setSwitchPassword] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

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
  const seqRef = useRef(0);

  // Check current user on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setChecking(false);
          return;
        }
        const data = await res.json();
        setCurrentOperator(data.operator);
        setIsAdmin(data.operator?.ruolo === "admin");
      } catch {
        // Not logged in
      } finally {
        setChecking(false);
      }
    };
    checkUser();
  }, []);

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

  const handleSwitchAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch("/api/auth/switch-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: switchEmail, password: switchPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Errore durante il login admin.");
      }
      setCurrentOperator(data.operator);
      setIsAdmin(true);
      setSwitchEmail("");
      setSwitchPassword("");
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setSwitching(false);
    }
  };

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
        <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Not logged in
  if (!currentOperator) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <HeadsetIcon className="h-6 w-6 text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-slate-500">
            Devi effettuare il login per accedere a questa pagina.
          </p>
          <a
            href="/login?redirect=/admin"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
          >
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  // Not admin → show switch modal
  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <LockClosedIcon className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-center text-lg font-semibold text-slate-900">Area riservata agli amministratori</h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            La gestione operatori è accessibile solo con le credenziali di amministratore.
            Inserisci la password admin per accedere.
          </p>

          {switchError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {switchError}
            </div>
          )}

          <form onSubmit={handleSwitchAdmin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email Admin</label>
              <input
                type="email"
                required
                value={switchEmail}
                onChange={(e) => setSwitchEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="email@admin.it"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password Admin</label>
              <input
                type="password"
                required
                value={switchPassword}
                onChange={(e) => setSwitchPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Password admin"
              />
            </div>
            <button
              type="submit"
              disabled={switching}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition disabled:opacity-50"
            >
              {switching ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <LockClosedIcon className="h-4 w-4" />}
              Accedi come Admin
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Sei loggato come <strong>{currentOperator.nome}</strong> ({currentOperator.email})
          </p>
        </div>
      </div>
    );
  }

  // Admin view
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestione Operatori</h1>
            <p className="text-sm text-slate-500">
              Crea, modifica e gestisci gli account degli operatori.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Sessione admin: <strong>{currentOperator.nome}</strong>
            </span>
            <button
              onClick={handleExitAdmin}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Esci da Admin
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
            >
              <UserPlusIcon className="h-4 w-4" />
              Nuovo Operatore
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Create/Edit Form */}
        {showForm && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? "Modifica Operatore" : "Nuovo Operatore"}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nome *</label>
                  <input
                    type="text"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="email@esempio.it"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Password {editingId ? "(lascia vuoto per non cambiare)" : "*"}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Minimo 8 caratteri"
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Ruolo *</label>
                  <select
                    required
                    value={form.ruolo}
                    onChange={(e) => setForm({ ...form, ruolo: e.target.value as "admin" | "operatore" })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition disabled:opacity-50"
                >
                  {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {editingId ? "Salva Modifiche" : "Crea Operatore"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Operators Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Operatori ({operatori.length})
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : operatori.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">Nessun operatore trovato.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 font-medium text-slate-600">Nome</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Email</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Ruolo</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Stato</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Creato il</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Ultimo accesso</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {operatori.map((op) => {
                    const isActive = !!op.attivo;
                    return (
                      <tr key={op.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold ${isActive ? "bg-blue-600" : "bg-slate-400"}`}>
                              {op.nome.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-900">{op.nome}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{op.email}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${op.ruolo === "admin" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>
                            {op.ruolo === "admin" ? "Admin" : "Operatore"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {isActive ? "Attivo" : "Inattivo"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{formatDate(op.data_creazione)}</td>
                        <td className="px-5 py-3 text-slate-500">{formatDate(op.ultimo_accesso)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(op)}
                              className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                              title="Modifica"
                            >
                              <EditIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(op.id, op.attivo)}
                              className={`rounded p-1.5 transition ${isActive ? "text-slate-400 hover:bg-red-50 hover:text-red-600" : "text-slate-400 hover:bg-green-50 hover:text-green-600"}`}
                              title={isActive ? "Disattiva" : "Riattiva"}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
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
            <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Conferma disattivazione</h3>
              <p className="mt-2 text-sm text-slate-600">
                Sei sicuro di voler disattivare questo operatore? Non potrà più accedere al sistema.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Annulla
                </button>
                <button
                  onClick={confirmDeactivate}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
                >
                  Disattiva
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
