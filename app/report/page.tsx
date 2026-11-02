"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import { formatDurata } from "@/lib/durata";
import PageHeader from "@/components/PageHeader";
import {
  DownloadIcon,
  LoaderIcon,
  RefreshIcon,
  UserIcon,
} from "@/components/icons";
import type { ReportOre } from "@/lib/report-ore";

const pad = (n: number) => String(n).padStart(2, "0");

function meseCorrente(): { da: string; a: string } {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    da: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
    a: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(ultimo)}`,
  };
}

function quando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportOrePage() {
  const { operatore, caricamento } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";

  const predefinito = useMemo(() => meseCorrente(), []);
  const [da, setDa] = useState(predefinito.da);
  const [a, setA] = useState(predefinito.a);
  const [cliente, setCliente] = useState("");
  const [operatoreId, setOperatoreId] = useState("");

  const [report, setReport] = useState<ReportOre | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [clienti, setClienti] = useState<{ ragione_sociale: string }[]>([]);
  const [operatori, setOperatori] = useState<{ id: string; nome: string }[]>([]);

  const caricaReport = useCallback(
    async (f?: { da?: string; a?: string; cliente?: string; operatore?: string }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          da: f?.da ?? da,
          a: f?.a ?? a,
        });
        const c = f?.cliente ?? cliente;
        const o = f?.operatore ?? operatoreId;
        if (c) params.set("cliente", c);
        if (o) params.set("operatore", o);
        const res = await fetch(`/api/report/ore?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel report.");
        setReport(data as ReportOre);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel report.");
      } finally {
        setLoading(false);
      }
    },
    [da, a, cliente, operatoreId]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void caricaReport();
    fetch("/api/clienti?limit=500")
      .then((r) => r.json())
      .then((d) => setClienti((d as { clienti?: { ragione_sociale: string }[] }).clienti ?? []))
      .catch(() => {});
    fetch("/api/operatori")
      .then((r) => r.json())
      .then((d) => setOperatori((d as { operatori?: { id: string; nome: string }[] }).operatori ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const hrefCsv = useMemo(() => {
    const params = new URLSearchParams({ da, a, format: "csv" });
    if (cliente) params.set("cliente", cliente);
    if (operatoreId) params.set("operatore", operatoreId);
    return `/api/report/ore?${params.toString()}`;
  }, [da, a, cliente, operatoreId]);

  // Le opzioni del cliente vengono da ERP + dai nomi presenti nel report:
  // un ticket libero (senza cliente in anagrafica) compare comunque.
  const opzioniCliente = useMemo(() => {
    const set = new Set(clienti.map((c) => c.ragione_sociale));
    for (const c of report?.perCliente ?? []) set.add(c.cliente);
    return Array.from(set).sort((x, y) => x.localeCompare(y, "it"));
  }, [clienti, report]);

  if (caricamento) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-inchiostro">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-caldo-testo">Devi effettuare il login per accedere a questa pagina.</p>
          <Link href="/login?redirect=/report" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-crema-scuro">
            <UserIcon className="h-6 w-6 text-caldo-testo" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata agli amministratori</h2>
          <p className="mt-2 text-sm text-caldo-testo">Questa pagina è accessibile solo con le credenziali di amministratore.</p>
        </div>
      </div>
    );
  }

  const campo =
    "rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";

  const dettaglioLimitato = report ? report.dettaglio.slice(0, 300) : [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          titolo="Report Ore"
          sottotitolo="Ore registrate per cliente, operatore e periodo — la base della fatturazione."
          azioni={
            <a
              href={hrefCsv}
              download
              className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
            >
              <DownloadIcon className="h-4 w-4" />
              Esporta CSV
            </a>
          }
        />

        {/* Filtri */}
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-crema-contorno bg-white p-4">
          <div>
            <label htmlFor="rep-da" className="mb-1 block text-xs font-semibold text-caldo-testo">Da</label>
            <input id="rep-da" type="date" value={da} onChange={(e) => setDa(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="rep-a" className="mb-1 block text-xs font-semibold text-caldo-testo">A</label>
            <input id="rep-a" type="date" value={a} onChange={(e) => setA(e.target.value)} className={campo} />
          </div>
          <div className="min-w-48">
            <label htmlFor="rep-cliente" className="mb-1 block text-xs font-semibold text-caldo-testo">Cliente</label>
            <select id="rep-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={campo}>
              <option value="">Tutti i clienti</option>
              {opzioniCliente.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="min-w-44">
            <label htmlFor="rep-operatore" className="mb-1 block text-xs font-semibold text-caldo-testo">Operatore</label>
            <select id="rep-operatore" value={operatoreId} onChange={(e) => setOperatoreId(e.target.value)} className={campo}>
              <option value="">Tutti gli operatori</option>
              {operatori.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => caricaReport()}
            disabled={loading}
            className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className="h-4 w-4" />
            {loading ? "Calcolo..." : "Applica"}
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-6 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo">
            {error}
          </div>
        )}

        {report && (
          <>
            {/* Sintesi */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-panel border border-stato-ok-bordo bg-stato-ok-bg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stato-ok-testo">Ore totali</p>
                <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{formatDurata(report.totaleMinuti)}</p>
              </div>
              <div className="rounded-panel border border-crema-contorno bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-caldo-testo">Voci di tempo</p>
                <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{report.vociTotali}</p>
              </div>
              <div className="rounded-panel border border-crema-contorno bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-caldo-testo">Clienti coinvolti</p>
                <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{report.perCliente.length}</p>
              </div>
              <div className="rounded-panel border border-stato-info-bordo bg-stato-info-bg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stato-info-testo">Voci in corso</p>
                <p className="tabular mt-1 text-2xl font-bold text-inchiostro">{report.vociAperte}</p>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Per cliente */}
              <section className="rounded-card border border-crema-contorno bg-white p-5">
                <h2 className="mb-3 text-base font-semibold text-inchiostro">Ore per cliente</h2>
                {report.perCliente.length === 0 ? (
                  <p className="text-sm text-caldo-testo">Nessuna ora nel periodo selezionato.</p>
                ) : (
                  <div className="space-y-1.5">
                    {report.perCliente.map((c) => (
                      <div key={c.cliente} className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-crema-scuro">
                        <span className="min-w-0 truncate text-sm text-inchiostro">{c.cliente}</span>
                        <span className="shrink-0 tabular text-sm font-semibold text-inchiostro">
                          {formatDurata(c.minuti)}
                          <span className="ml-2 text-xs font-normal text-caldo-testo">{c.voci} voci</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Per operatore */}
              <section className="rounded-card border border-crema-contorno bg-white p-5">
                <h2 className="mb-3 text-base font-semibold text-inchiostro">Ore per operatore</h2>
                {report.perOperatore.length === 0 ? (
                  <p className="text-sm text-caldo-testo">Nessuna ora nel periodo selezionato.</p>
                ) : (
                  <div className="space-y-1.5">
                    {report.perOperatore.map((o) => (
                      <div key={o.operatore} className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-crema-scuro">
                        <span className="min-w-0 truncate text-sm text-inchiostro">{o.operatore}</span>
                        <span className="shrink-0 tabular text-sm font-semibold text-inchiostro">
                          {formatDurata(o.minuti)}
                          <span className="ml-2 text-xs font-normal text-caldo-testo">{o.voci} voci</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Dettaglio */}
            <section className="rounded-card border border-crema-contorno bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-inchiostro">Dettaglio voci</h2>
                {report.dettaglio.length > dettaglioLimitato.length && (
                  <span className="text-xs text-caldo-testo">
                    Mostrate {dettaglioLimitato.length} di {report.dettaglio.length} — il CSV le contiene tutte.
                  </span>
                )}
              </div>
              {dettaglioLimitato.length === 0 ? (
                <p className="text-sm text-caldo-testo">Nessuna voce nel periodo selezionato.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-crema-bordo text-xs uppercase tracking-wide text-caldo-testo">
                        <th className="px-2 py-2 font-semibold">Inizio</th>
                        <th className="px-2 py-2 font-semibold">Fine</th>
                        <th className="px-2 py-2 font-semibold">Operatore</th>
                        <th className="px-2 py-2 font-semibold">Cliente</th>
                        <th className="px-2 py-2 font-semibold">Bersaglio</th>
                        <th className="px-2 py-2 text-right font-semibold">Durata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dettaglioLimitato.map((v) => (
                        <tr key={v.id} className="border-b border-crema-bordo last:border-0">
                          <td className="whitespace-nowrap px-2 py-2 tabular text-caldo-testo">{quando(v.inizio)}</td>
                          <td className="whitespace-nowrap px-2 py-2 tabular text-caldo-testo">
                            {v.aperta ? (
                              <span className="rounded bg-stato-info-bg px-1.5 py-0.5 text-[11px] font-semibold text-stato-info-testo">in corso</span>
                            ) : (
                              quando(v.fine)
                            )}
                          </td>
                          <td className="px-2 py-2 text-inchiostro">{v.operatore}</td>
                          <td className="px-2 py-2 text-inchiostro">{v.cliente}</td>
                          <td className="max-w-64 truncate px-2 py-2 text-caldo-testo" title={v.bersaglio ?? undefined}>
                            {v.bersaglio ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular font-semibold text-inchiostro">{formatDurata(v.minuti)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
