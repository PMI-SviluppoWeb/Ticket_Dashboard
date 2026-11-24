"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderIcon, RefreshIcon, SparklesIcon } from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import SectionBar from "@/components/SectionBar";
import { useOperatore } from "@/lib/operatore-client";
import { usePolling } from "@/lib/usePolling";
import type { AgenteAttivita, AgentePerOperatore } from "@/lib/types";

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
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function linkContesto(contesto: Record<string, unknown> | null): string | null {
  if (!contesto) return null;
  const tipo = typeof contesto.tipo === "string" ? contesto.tipo : null;
  const id = typeof contesto.id === "string" ? contesto.id : null;
  if (!tipo || !id) return null;
  if (tipo === "ticket") return `/tickets/${id}`;
  if (tipo === "cliente") return `/clienti/${id}`;
  if (tipo === "progetto") return `/progetti/${id}`;
  return null;
}

export default function AttivitaAgentiPage() {
  const { operatore } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";

  const [agenti, setAgenti] = useState<AgentePerOperatore[]>([]);
  const [esecuzioni, setEsecuzioni] = useState<AgenteAttivita[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [tutti, setTutti] = useState(false);
  const [agenteId, setAgenteId] = useState("");
  const [stato, setStato] = useState("");
  const [aperta, setAperta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (isAdmin && tutti) params.set("tutti", "1");
      if (agenteId) params.set("agente_id", agenteId);
      if (stato) params.set("stato", stato);
      const res = await fetch(`/api/agenti/attivita?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { esecuzioni?: AgenteAttivita[] };
      setEsecuzioni(data.esecuzioni ?? []);
      setErrore(null);
    } catch {
      setErrore("Impossibile caricare le esecuzioni.");
    } finally {
      setLoading(false);
    }
  }, [agenteId, isAdmin, stato, tutti]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const res = await fetch("/api/agenti?vista=miei", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { agenti?: AgentePerOperatore[] };
          if (!annullato) setAgenti(data.agenti ?? []);
        }
      } catch {
        // il filtro agente resta vuoto: la pagina funziona lo stesso
      }
      await carica();
    })();
    return () => {
      annullato = true;
    };
  }, [carica]);

  const inCorso = useMemo(
    () => esecuzioni.some((e) => e.stato === "in_corso"),
    [esecuzioni]
  );
  usePolling(() => void carica(), 5000, inCorso);

  const riepilogo = useMemo(() => {
    const conta = { completata: 0, errore: 0, in_corso: 0 };
    for (const e of esecuzioni) {
      if (e.stato === "completata") conta.completata += 1;
      else if (e.stato === "errore") conta.errore += 1;
      else conta.in_corso += 1;
    }
    return conta;
  }, [esecuzioni]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          titolo="Attività agenti"
          sottotitolo="Cosa hanno fatto gli agenti: ogni esecuzione con stato, durata, token e traccia delle azioni sui dati."
          azioni={
            <button
              onClick={() => void carica()}
              className="flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
            >
              <RefreshIcon className="h-4 w-4" />
              Aggiorna
            </button>
          }
        />

        <AreaTabs areaId="ai" />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={agenteId}
            onChange={(e) => setAgenteId(e.target.value)}
            aria-label="Filtra per agente"
            className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            <option value="">Tutti gli agenti</option>
            {agenti.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
          <select
            value={stato}
            onChange={(e) => setStato(e.target.value)}
            aria-label="Filtra per stato"
            className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            <option value="">Tutti gli stati</option>
            <option value="completata">Completata</option>
            <option value="errore">Errore</option>
            <option value="in_corso">In corso</option>
          </select>
          {isAdmin && (
            <label className="flex items-center gap-2 rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-caldo-testo">
              <input
                type="checkbox"
                checked={tutti}
                onChange={(e) => setTutti(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-inchiostro"
              />
              Tutti gli operatori
            </label>
          )}
          <span className="ml-auto text-[11px] text-caldo-testo">
            {riepilogo.completata} completate · {riepilogo.errore} errori ·{" "}
            {riepilogo.in_corso} in corso
          </span>
        </div>

        {errore && (
          <p
            role="alert"
            className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
          >
            {errore}
          </p>
        )}

        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar
            titolo="Esecuzioni"
            icona={SparklesIcon}
            conteggio={esecuzioni.length}
          />
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : esecuzioni.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-caldo-testo">
              Nessuna esecuzione con questi filtri.
            </p>
          ) : (
            <ul className="divide-y divide-crema-bordo">
              {esecuzioni.map((es) => {
                const espansa = aperta === es.id;
                const href = linkContesto(es.contesto);
                return (
                  <li key={es.id}>
                    <button
                      onClick={() => setAperta(espansa ? null : es.id)}
                      aria-expanded={espansa}
                      className="flex w-full cursor-pointer flex-col gap-1 px-5 py-3 text-left transition-colors duration-200 hover:bg-crema-scuro"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
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
                        <span className="font-medium text-inchiostro">
                          {es.agente_nome ?? "Agente"}
                        </span>
                        {es.operatore_nome && (
                          <span className="text-caldo-testo">· {es.operatore_nome}</span>
                        )}
                        <span className="text-caldo-testo">{dataBreve(es.data_creazione)}</span>
                        {es.durata_ms != null && (
                          <span className="text-caldo-testo">{es.durata_ms} ms</span>
                        )}
                        {es.provider && (
                          <span className="text-caldo-testo">{es.provider}</span>
                        )}
                        {es.traccia && es.traccia.length > 0 && (
                          <span className="rounded-full border border-stato-ok-bordo bg-stato-ok-bg px-2 py-0.5 font-medium text-stato-ok-testo">
                            {es.traccia.length} azioni
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-1 text-sm text-inchiostro">
                        <span className="text-caldo-testo">In: </span>
                        {es.input_utente}
                      </p>
                      {!espansa && (
                        <p className="line-clamp-1 text-xs text-caldo-testo">
                          <span className="font-medium">Out: </span>
                          {es.stato === "completata" ? es.output : es.errore}
                        </p>
                      )}
                    </button>

                    {espansa && (
                      <div className="space-y-3 px-5 pb-4">
                        <div className="whitespace-pre-wrap rounded-control border border-crema-contorno bg-crema-scuro p-3 text-xs leading-relaxed text-inchiostro">
                          {es.stato === "completata" ? es.output : es.errore}
                        </div>
                        {es.traccia && es.traccia.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                              Azioni sui dati
                            </p>
                            <ul className="space-y-1">
                              {es.traccia.map((v, i) => (
                                <li
                                  key={i}
                                  className="rounded-control border border-crema-contorno bg-white px-2 py-1.5 font-mono text-[10px] leading-snug text-caldo-testo"
                                >
                                  <span className="font-semibold text-inchiostro">
                                    turno {v.turno}: {v.tool}
                                  </span>{" "}
                                  {v.argomenti} → {v.esito}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-caldo-testo">
                          {es.prompt_tokens != null && (
                            <span>
                              {es.prompt_tokens}+{es.completion_tokens ?? 0} token
                            </span>
                          )}
                          {es.conversazione_id && <span>thread Copilot</span>}
                          {href && (
                            <Link
                              href={href}
                              className="font-medium text-inchiostro underline-offset-2 hover:underline"
                            >
                              Apri contesto
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
