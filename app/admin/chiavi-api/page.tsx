"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import { LoaderIcon, LockClosedIcon, RefreshIcon, TrashIcon } from "@/components/icons";

interface ChiaveApi {
  id: string;
  nome: string;
  prefisso: string;
  ambiti: string[];
  attiva: boolean;
  ultimo_uso: string | null;
  data_creazione: string;
}

const AMBITI: Array<{ id: string; label: string }> = [
  { id: "tickets:read", label: "Leggere lo stato dei ticket" },
  { id: "tickets:write", label: "Creare ticket e aggiungere messaggi" },
  { id: "clienti:read", label: "Cercare l'anagrafica del numero chiamante" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function quando(iso: string | null): string {
  if (!iso) return "mai";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ChiaviApiPage() {
  const { operatore, caricamento } = useOperatore();

  const [chiavi, setChiavi] = useState<ChiaveApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [nome, setNome] = useState("");
  const [ambiti, setAmbiti] = useState<string[]>(["tickets:read", "tickets:write", "clienti:read"]);
  const [creando, setCreando] = useState(false);
  const [chiaveNuova, setChiaveNuova] = useState<string | null>(null);
  const [copia, setCopia] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chiavi-api", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel caricamento.");
      setChiavi((data as { chiavi?: ChiaveApi[] }).chiavi ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!operatore) return;
    void carica();
  }, [operatore, carica]);

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError("");
    setSuccess("");
    setChiaveNuova(null);
    try {
      const res = await fetch("/api/chiavi-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ambiti }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Creazione non riuscita.");
      setChiaveNuova(String((data as { chiave?: string }).chiave ?? ""));
      setSuccess("Chiave creata. Copiala ora: non verrà mostrata di nuovo.");
      setNome("");
      await carica();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creazione non riuscita.");
    } finally {
      setCreando(false);
    }
  }

  async function revoca(id: string) {
    if (!confirm("Revocare questa chiave? Il bot che la usa smetterà di funzionare.")) return;
    setError("");
    try {
      const res = await fetch(`/api/chiavi-api/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Revoca non riuscita.");
      await carica();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoca non riuscita.");
    }
  }

  async function copiaChiave() {
    if (!chiaveNuova) return;
    try {
      await navigator.clipboard.writeText(chiaveNuova);
      setCopia(true);
      setTimeout(() => setCopia(false), 2000);
    } catch {
      setError("Copia non disponibile: seleziona la chiave a mano.");
    }
  }

  if (caricamento) {
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
          <Link href="/login?redirect=/admin/chiavi-api" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          titolo="Chiavi API"
          sottotitolo="Accesso macchina per il bot WhatsApp su Hermes. Ogni chiave ha ambiti limitati e può essere revocata in ogni momento."
          azioni={
            <button
              type="button"
              onClick={carica}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon className="h-4 w-4" />
              {loading ? "Caricamento..." : "Aggiorna"}
            </button>
          }
        />

        <AreaTabs areaId="admin" />

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

        {chiaveNuova && (
          <div className="mb-4 rounded-card border border-stato-urgenza-bordo bg-white p-4">
            <p className="text-sm font-semibold text-inchiostro">Chiave creata</p>
            <p className="mt-1 text-xs text-caldo-testo">
              Copiala adesso e consegnala al bot. Nel database resta solo l&apos;hash: non potrà essere
              recuperata.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-control border border-crema-contorno bg-crema-scuro px-3 py-2 text-xs text-inchiostro">
                {chiaveNuova}
              </code>
              <button
                type="button"
                onClick={copiaChiave}
                className="cursor-pointer rounded-control bg-inchiostro px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
              >
                {copia ? "Copiata" : "Copia"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={crea} className="mb-6 rounded-card border border-crema-contorno bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Nuova chiave</p>
          <label htmlFor="chiave-nome" className="mb-1 block text-sm font-medium text-caldo-testo">
            Nome (a cosa serve)
          </label>
          <input
            id="chiave-nome"
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Bot WhatsApp Hermes"
            className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          />
          <fieldset className="mt-3">
            <legend className="mb-2 text-sm font-medium text-caldo-testo">Ambiti</legend>
            <div className="space-y-1.5">
              {AMBITI.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-caldo-testo">
                  <input
                    type="checkbox"
                    checked={ambiti.includes(a.id)}
                    onChange={(e) =>
                      setAmbiti((prev) =>
                        e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)
                      )
                    }
                    className="h-4 w-4 cursor-pointer accent-inchiostro"
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={creando || !nome.trim() || ambiti.length === 0}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creando && <LoaderIcon className="h-4 w-4 animate-spin" />}
            Crea chiave
          </button>
        </form>

        <div className="rounded-card border border-crema-contorno bg-white">
          <p className="border-b border-crema-contorno px-4 py-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Chiavi esistenti
          </p>
          {chiavi.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <LockClosedIcon className="h-7 w-7 text-caldo-testo" />
              <p className="text-sm text-caldo-testo">Nessuna chiave creata.</p>
            </div>
          ) : (
            <ul className="divide-y divide-crema-contorno">
              {chiavi.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-inchiostro">
                      {k.nome}{" "}
                      <span className="tabular font-normal text-caldo-testo">({k.prefisso}…)</span>
                      {!k.attiva && (
                        <span className="ml-2 rounded border border-stato-neutro-bordo bg-stato-neutro-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stato-neutro-testo">
                          revocata
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-caldo-testo">{k.ambiti.join(" · ") || "nessun ambito"}</p>
                    <p className="mt-0.5 text-[11px] text-caldo-testo">Ultimo uso: {quando(k.ultimo_uso)}</p>
                  </div>
                  {k.attiva && (
                    <button
                      type="button"
                      onClick={() => revoca(k.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-2.5 py-1 text-xs font-medium text-stato-urgenza-testo transition-colors duration-200 hover:bg-stato-urgenza-bg"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Revoca
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-xs text-caldo-testo">
          Istruzioni per Hermes: <code>docs/hermes-api.md</code>.
        </p>
      </div>
    </div>
  );
}
