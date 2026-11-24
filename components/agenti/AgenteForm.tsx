"use client";

import { useState } from "react";
import { CheckCircleIcon, LoaderIcon } from "@/components/icons";
import {
  GRUPPI_STRUMENTI,
  gruppiDaStrumenti,
  strumentiDaGruppi,
} from "@/lib/agenti-tools-def";
import type { Agente, AgenteInput, ProviderAgente, RuoloAgente } from "@/lib/types";

const RUOLI: Array<{ valore: RuoloAgente; label: string }> = [
  { valore: "assistente", label: "Assistente ticket" },
  { valore: "contenuti", label: "Contenuti social" },
  { valore: "clienti", label: "Gestione clienti" },
  { valore: "custom", label: "Personalizzato" },
];

interface Props {
  // Se presente, il form e' in modifica; altrimenti crea un agente personale.
  agente?: Agente | null;
  onSalvato: () => void;
  onAnnulla: () => void;
}

// Form compatto per lo spazio /agenti:qui si creano/modificano solo agenti
// PERSONALI. La libreria condivisa resta nella configurazione admin.
export default function AgenteForm({ agente, onSalvato, onAnnulla }: Props) {
  const [form, setForm] = useState<AgenteInput>({
    nome: agente?.nome ?? "",
    descrizione: agente?.descrizione ?? "",
    ruolo: agente?.ruolo ?? "assistente",
    modello: agente?.modello ?? "",
    system_prompt: agente?.system_prompt ?? "",
    strumenti: agente?.strumenti ?? [],
    provider: agente?.provider ?? "auto",
    attivo: agente?.attivo ?? true,
  });
  const [gruppiSel, setGruppiSel] = useState<string[]>(
    agente ? gruppiDaStrumenti(agente.strumenti) : []
  );
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const salva = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrore(null);
    try {
      const strumenti = strumentiDaGruppi(gruppiSel);
      const body: AgenteInput = {
        ...form,
        strumenti,
        // Con strumenti attivi il backend e' forzato a OpenRouter (regola:
        // il loop dei dati vive nell'app, Hermes non riceve i tool).
        provider: strumenti.length > 0 ? "openrouter" : form.provider ?? "auto",
        visibilita: "personale",
      };
      const res = await fetch(agente ? `/api/agenti/${agente.id}` : "/api/agenti", {
        method: agente ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Errore nel salvataggio.");
      onSalvato();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={salva}
      className="overflow-hidden rounded-card border border-crema-contorno bg-white"
    >
      <div className="border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
          {agente ? "Modifica agente personale" : "Nuovo agente personale"}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-caldo-testo">Nome *</label>
          <input
            required
            maxLength={200}
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            placeholder="Es. Assistente risposte"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-caldo-testo">Ruolo</label>
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
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-caldo-testo">Descrizione</label>
          <input
            maxLength={2000}
            value={form.descrizione ?? ""}
            onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
            className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            placeholder="A cosa serve questo agente (opzionale)"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-caldo-testo">
            Prompt di sistema *
          </label>
          <textarea
            required
            rows={6}
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            placeholder={"Sei un assistente di supporto tecnico...\nRispondi sempre in italiano, in modo conciso."}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
            Dati dell&apos;app (strumenti, sola lettura)
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {GRUPPI_STRUMENTI.map((g) => (
              <label key={g.id} className="flex items-start gap-2 text-xs text-caldo-testo">
                <input
                  type="checkbox"
                  checked={gruppiSel.includes(g.id)}
                  onChange={(e) =>
                    setGruppiSel((prev) =>
                      e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id)
                    )
                  }
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-inchiostro"
                />
                <span>
                  <span className="font-medium text-inchiostro">{g.label}</span>
                  <span className="block text-[11px]">{g.descrizione}</span>
                </span>
              </label>
            ))}
          </div>
          {gruppiSel.length > 0 && (
            <p className="mt-2 text-[11px] text-caldo-testo">
              Con strumenti attivi il backend è forzato a OpenRouter.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-caldo-testo">
            Backend
          </label>
          <select
            value={form.provider ?? "auto"}
            onChange={(e) => setForm({ ...form, provider: e.target.value as ProviderAgente })}
            disabled={gruppiSel.length > 0}
            className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="auto">Automatico</option>
            <option value="hermes">Hermes (memoria)</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-caldo-testo">Modello</label>
          <input
            value={form.modello ?? ""}
            onChange={(e) => setForm({ ...form, modello: e.target.value })}
            className="w-full rounded-control border border-crema-contorno px-3 py-2 font-mono text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            placeholder="vuoto = default di sistema"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-caldo-testo sm:col-span-2">
          <input
            type="checkbox"
            checked={form.attivo !== false}
            onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-inchiostro"
          />
          Attivo (utilizzabile nel Copilot)
        </label>
      </div>

      {errore && (
        <p role="alert" className="px-4 pb-2 text-xs text-stato-urgenza-testo">
          {errore}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-crema-bordo px-4 py-3">
        <button
          type="submit"
          disabled={saving}
          className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <LoaderIcon className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-4 w-4" />
          )}
          {agente ? "Salva" : "Crea agente"}
        </button>
        <button
          type="button"
          onClick={onAnnulla}
          className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
