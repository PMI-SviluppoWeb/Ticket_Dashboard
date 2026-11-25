"use client";

import { useState } from "react";
import { CheckCircleIcon, LoaderIcon } from "@/components/icons";
import type {
  ClienteCommerciale,
  ClienteCommercialeInput,
  PrioritaCommerciale,
  StatoClienteCommerciale,
} from "@/lib/types";

const STATI: Array<{ valore: StatoClienteCommerciale; label: string }> = [
  { valore: "attivo", label: "Attivo" },
  { valore: "prospect", label: "Prospect" },
  { valore: "a_rischio", label: "A rischio" },
  { valore: "perso", label: "Perso" },
];

const PRIORITA: Array<{ valore: PrioritaCommerciale; label: string }> = [
  { valore: "alta", label: "Alta" },
  { valore: "media", label: "Media" },
  { valore: "bassa", label: "Bassa" },
];

interface Props {
  clienteId: string;
  commerciale: ClienteCommerciale | null;
  onSalvato: (commerciale: ClienteCommerciale) => void;
}

// Scheda commerciale LOCALE del cliente: non tocca l'anagrafica Arca.
export default function CommercialeForm({
  clienteId,
  commerciale,
  onSalvato,
}: Props) {
  const [form, setForm] = useState<ClienteCommercialeInput>({
    referente_tecnico: commerciale?.referente_tecnico ?? "",
    referente_decisionale: commerciale?.referente_decisionale ?? "",
    email_decisionale: commerciale?.email_decisionale ?? "",
    telefono_decisionale: commerciale?.telefono_decisionale ?? "",
    stato_cliente: commerciale?.stato_cliente ?? "attivo",
    settore: commerciale?.settore ?? "",
    dimensione_aziendale: commerciale?.dimensione_aziendale ?? "",
    priorita_commerciale: commerciale?.priorita_commerciale ?? "media",
    note_commerciali: commerciale?.note_commerciali ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const salva = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErrore(null);
    setSalvato(false);
    try {
      const res = await fetch(`/api/clienti/${clienteId}/commerciale`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        commerciale?: ClienteCommerciale;
        error?: string;
      };
      if (!res.ok || !data.commerciale) {
        throw new Error(data.error ?? "Errore nel salvataggio.");
      }
      onSalvato(data.commerciale);
      setSalvato(true);
      setTimeout(() => setSalvato(false), 2500);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form
      onSubmit={salva}
      className="overflow-hidden rounded-card border border-crema-contorno bg-white"
    >
      <div className="flex items-center justify-between border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
          Scheda commerciale
        </p>
        {salvato && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stato-ok-testo">
            <CheckCircleIcon className="h-3.5 w-3.5" /> Salvato
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Campo label="Referente tecnico">
          <input
            value={form.referente_tecnico ?? ""}
            onChange={(e) => setForm({ ...form, referente_tecnico: e.target.value })}
            className={inputClasse}
          />
        </Campo>
        <Campo label="Referente decisionale">
          <input
            value={form.referente_decisionale ?? ""}
            onChange={(e) =>
              setForm({ ...form, referente_decisionale: e.target.value })
            }
            className={inputClasse}
          />
        </Campo>
        <Campo label="Email decisionale">
          <input
            type="email"
            value={form.email_decisionale ?? ""}
            onChange={(e) => setForm({ ...form, email_decisionale: e.target.value })}
            className={inputClasse}
          />
        </Campo>
        <Campo label="Telefono decisionale">
          <input
            value={form.telefono_decisionale ?? ""}
            onChange={(e) =>
              setForm({ ...form, telefono_decisionale: e.target.value })
            }
            className={inputClasse}
          />
        </Campo>
        <Campo label="Stato cliente">
          <select
            value={form.stato_cliente ?? "attivo"}
            onChange={(e) =>
              setForm({
                ...form,
                stato_cliente: e.target.value as StatoClienteCommerciale,
              })
            }
            className={inputClasse}
          >
            {STATI.map((s) => (
              <option key={s.valore} value={s.valore}>
                {s.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Priorità commerciale">
          <select
            value={form.priorita_commerciale ?? "media"}
            onChange={(e) =>
              setForm({
                ...form,
                priorita_commerciale: e.target.value as PrioritaCommerciale,
              })
            }
            className={inputClasse}
          >
            {PRIORITA.map((p) => (
              <option key={p.valore} value={p.valore}>
                {p.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Settore">
          <input
            value={form.settore ?? ""}
            onChange={(e) => setForm({ ...form, settore: e.target.value })}
            className={inputClasse}
          />
        </Campo>
        <Campo label="Dimensione aziendale">
          <input
            value={form.dimensione_aziendale ?? ""}
            onChange={(e) =>
              setForm({ ...form, dimensione_aziendale: e.target.value })
            }
            placeholder="es. 10-50 dipendenti"
            className={inputClasse}
          />
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Note commerciali">
            <textarea
              rows={3}
              value={form.note_commerciali ?? ""}
              onChange={(e) => setForm({ ...form, note_commerciali: e.target.value })}
              className={`${inputClasse} resize-none`}
            />
          </Campo>
        </div>
      </div>

      {errore && (
        <p role="alert" className="px-4 pb-2 text-xs text-stato-urgenza-testo">
          {errore}
        </p>
      )}

      <div className="border-t border-crema-bordo px-4 py-3">
        <button
          type="submit"
          disabled={salvando}
          className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
          Salva scheda commerciale
        </button>
      </div>
    </form>
  );
}

const inputClasse =
  "w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
        {label}
      </span>
      {children}
    </label>
  );
}
