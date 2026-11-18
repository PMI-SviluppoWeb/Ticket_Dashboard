"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import { LoaderIcon, CheckCircleIcon } from "@/components/icons";
import type { ConfigSla } from "@/lib/sla";

const GIORNI = [
  { n: 1, label: "Lun" },
  { n: 2, label: "Mar" },
  { n: 3, label: "Mer" },
  { n: 4, label: "Gio" },
  { n: 5, label: "Ven" },
  { n: 6, label: "Sab" },
  { n: 0, label: "Dom" },
];

export default function SlaPage() {
  const { operatore, caricamento } = useOperatore();
  const [config, setConfig] = useState<ConfigSla | null>(null);
  const [festivi, setFestivi] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sla", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel caricamento.");
      const c = (data as { config: ConfigSla }).config;
      setConfig(c);
      setFestivi(c.festivi.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (operatore?.ruolo === "admin") void carica();
  }, [operatore, carica]);

  function setObiettivo(p: "ALTA" | "MEDIA" | "BASSA", campo: "presaMinuti" | "risoluzioneMinuti", valore: number) {
    setConfig((c) =>
      c
        ? {
            ...c,
            priorita: { ...c.priorita, [p]: { ...c.priorita[p], [campo]: valore } },
          }
        : c
    );
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const festiviPuliti = festivi
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
      const res = await fetch("/api/sla", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, festivi: festiviPuliti }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Salvataggio non riuscito.");
      setConfig((data as { config: ConfigSla }).config);
      setSuccess("Configurazione SLA salvata.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  if (caricamento || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore || operatore.ruolo !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-inchiostro">Accesso riservato</h2>
          <p className="mt-2 text-sm text-caldo-testo">Questa pagina è riservata agli amministratori.</p>
          <Link href="/login?redirect=/admin/sla" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          titolo="SLA"
          sottotitolo="Obiettivi di presa in carico e risoluzione per priorità, calcolati in minuti lavorativi sull'orario d'ufficio."
        />

        {error && (
          <div role="alert" className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-4 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm font-medium text-stato-ok-testo">
            {success}
          </div>
        )}

        <form onSubmit={salva} className="space-y-4">
          <section className="rounded-card border border-crema-contorno bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
              Obiettivi per priorità (minuti lavorativi)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(["ALTA", "MEDIA", "BASSA"] as const).map((p) => (
                <fieldset key={p} className="rounded-control border border-crema-contorno p-3">
                  <legend className="px-1 text-sm font-semibold text-inchiostro">{p}</legend>
                  <label className="mt-1 block text-xs text-caldo-testo">
                    Presa in carico
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={config.priorita[p].presaMinuti}
                      onChange={(e) => setObiettivo(p, "presaMinuti", Number(e.target.value))}
                      className="mt-1 w-full rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    />
                  </label>
                  <label className="mt-2 block text-xs text-caldo-testo">
                    Risoluzione
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={config.priorita[p].risoluzioneMinuti}
                      onChange={(e) => setObiettivo(p, "risoluzioneMinuti", Number(e.target.value))}
                      className="mt-1 w-full rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    />
                  </label>
                </fieldset>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-crema-contorno bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
              Orario d&apos;ufficio
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm text-caldo-testo">
                Inizio
                <input
                  type="time"
                  value={config.orario.inizio}
                  onChange={(e) =>
                    setConfig({ ...config, orario: { ...config.orario, inizio: e.target.value } })
                  }
                  className="ml-2 rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
                />
              </label>
              <label className="text-sm text-caldo-testo">
                Fine
                <input
                  type="time"
                  value={config.orario.fine}
                  onChange={(e) =>
                    setConfig({ ...config, orario: { ...config.orario, fine: e.target.value } })
                  }
                  className="ml-2 rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
                />
              </label>
              <label className="text-sm text-caldo-testo">
                Pausa
                <input
                  type="time"
                  value={config.orario.pausa?.inizio ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      orario: {
                        ...config.orario,
                        pausa: {
                          inizio: e.target.value,
                          fine: config.orario.pausa?.fine ?? "14:00",
                        },
                      },
                    })
                  }
                  className="ml-2 rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
                />
                <span className="mx-1">–</span>
                <input
                  type="time"
                  value={config.orario.pausa?.fine ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      orario: {
                        ...config.orario,
                        pausa: {
                          inizio: config.orario.pausa?.inizio ?? "13:00",
                          fine: e.target.value,
                        },
                      },
                    })
                  }
                  className="rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {GIORNI.map((g) => (
                <label key={g.n} className="flex items-center gap-1.5 text-sm text-caldo-testo">
                  <input
                    type="checkbox"
                    checked={config.orario.giorni.includes(g.n)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        orario: {
                          ...config.orario,
                          giorni: e.target.checked
                            ? [...config.orario.giorni, g.n]
                            : config.orario.giorni.filter((x) => x !== g.n),
                        },
                      })
                    }
                    className="h-4 w-4 cursor-pointer accent-inchiostro"
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-crema-contorno bg-white p-4">
            <label htmlFor="festivi" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-caldo-testo">
              Festivi (una data YYYY-MM-DD per riga)
            </label>
            <textarea
              id="festivi"
              rows={4}
              value={festivi}
              onChange={(e) => setFestivi(e.target.value)}
              placeholder="2026-12-25&#10;2026-12-26"
              className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            />
          </section>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
            Salva
          </button>
        </form>
      </div>
    </div>
  );
}
