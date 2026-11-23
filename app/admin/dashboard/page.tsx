"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import { LoaderIcon, RefreshIcon, AlertTriangleIcon } from "@/components/icons";

interface PuntoTrend {
  giorno: string;
  n: number;
}

interface DatiCruscotto {
  periodo: { da: string; a: string };
  kpi: {
    creati: number;
    chiusi: number;
    backlog: number;
    anzianita_media_ore: number;
    presa_media_minuti: number | null;
    risoluzione_media_minuti: number | null;
    sla_presa_percento: number | null;
    sla_risoluzione_percento: number | null;
    tasso_riapertura_percento: number;
  };
  trend: { aperti: PuntoTrend[]; chiusi: PuntoTrend[] };
  perModulo: Array<{ nome: string; n: number }>;
  perCanale: Array<{ nome: string; n: number }>;
  perOperatore: Array<{ operatore: string; ore: number }>;
  triage: { esiti: Record<string, number>; correzioni: Record<string, number> };
  ai: { esecuzioni: number; prompt_tokens: number; completion_tokens: number };
}

const pad = (n: number) => String(n).padStart(2, "0");

function dataIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataIso(d);
}

function meseCorrente(): { da: string; a: string } {
  const d = new Date();
  return {
    da: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
    a: dataIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

function formattaMinuti(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function unisciTrend(aperti: PuntoTrend[], chiusi: PuntoTrend[]) {
  const mappa = new Map<string, { aperti: number; chiusi: number }>();
  for (const p of aperti) {
    const v = mappa.get(p.giorno) ?? { aperti: 0, chiusi: 0 };
    v.aperti = p.n;
    mappa.set(p.giorno, v);
  }
  for (const p of chiusi) {
    const v = mappa.get(p.giorno) ?? { aperti: 0, chiusi: 0 };
    v.chiusi = p.n;
    mappa.set(p.giorno, v);
  }
  return Array.from(mappa.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([giorno, v]) => ({ giorno, ...v }));
}

function pathSerie(valori: number[], larghezza: number, altezza: number, max: number): string {
  if (valori.length === 0) return "";
  const passo = valori.length > 1 ? larghezza / (valori.length - 1) : 0;
  return valori
    .map((n, i) => `${(i * passo).toFixed(1)},${(altezza - (max > 0 ? (n / max) * altezza : 0)).toFixed(1)}`)
    .join(" ");
}

function Tessera({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-card border border-crema-contorno bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">{etichetta}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-inchiostro">{valore}</p>
      {nota && <p className="mt-1 text-[11px] text-caldo-testo">{nota}</p>}
    </div>
  );
}

export default function DashboardAdminPage() {
  const { operatore, caricamento } = useOperatore();
  const [da, setDa] = useState(meseCorrente().da);
  const [a, setA] = useState(meseCorrente().a);
  const [dati, setDati] = useState<DatiCruscotto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/dashboard?da=${da}&a=${a}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel caricamento.");
      setDati(data as DatiCruscotto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [da, a]);

  useEffect(() => {
    if (operatore?.ruolo === "admin") void carica();
  }, [operatore, carica]);

  const trend = useMemo(
    () => (dati ? unisciTrend(dati.trend.aperti, dati.trend.chiusi) : []),
    [dati]
  );
  const maxTrend = useMemo(
    () => Math.max(1, ...trend.map((t) => Math.max(t.aperti, t.chiusi))),
    [trend]
  );

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
          <Link href="/login?redirect=/admin/dashboard" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          titolo="Cruscotto"
          sottotitolo="Andamento, SLA e carico di lavoro. I tempi sono in minuti lavorativi secondo l'orario d'ufficio."
          azioni={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const m = meseCorrente();
                  setDa(m.da);
                  setA(m.a);
                }}
                className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Mese corrente
              </button>
              <button
                type="button"
                onClick={() => {
                  setDa(giorniFa(30));
                  setA(dataIso(new Date()));
                }}
                className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Ultimi 30 giorni
              </button>
              <button
                type="button"
                onClick={() => {
                  setDa(giorniFa(90));
                  setA(dataIso(new Date()));
                }}
                className="cursor-pointer rounded-control border border-crema-contorno px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Ultimi 90 giorni
              </button>
              <button
                type="button"
                onClick={carica}
                disabled={loading}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}
                Aggiorna
              </button>
            </div>
          }
        />

        <AreaTabs areaId="report" />

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-crema-contorno bg-white p-4">
          <label className="text-xs font-semibold text-caldo-testo">
            Da
            <input
              type="date"
              value={da}
              onChange={(e) => setDa(e.target.value)}
              className="ml-2 rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
            />
          </label>
          <label className="text-xs font-semibold text-caldo-testo">
            A
            <input
              type="date"
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="ml-2 rounded-control border border-crema-contorno px-2 py-1.5 text-sm text-inchiostro"
            />
          </label>
          <Link href="/admin/sla" className="text-xs font-medium text-inchiostro underline underline-offset-2">
            Configura obiettivi SLA
          </Link>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo">
            <AlertTriangleIcon className="h-4 w-4" />
            {error}
          </div>
        )}

        {dati && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tessera etichetta="Ticket creati" valore={String(dati.kpi.creati)} nota={`dal ${dati.periodo.da} al ${dati.periodo.a}`} />
              <Tessera etichetta="Ticket chiusi" valore={String(dati.kpi.chiusi)} />
              <Tessera etichetta="Arretrato aperto" valore={String(dati.kpi.backlog)} nota="NUOVO + IN_CORSO" />
              <Tessera
                etichetta="Anzianità media"
                valore={`${dati.kpi.anzianita_media_ore}h`}
                nota="dei ticket ancora aperti"
              />
              <Tessera etichetta="Presa in carico media" valore={formattaMinuti(dati.kpi.presa_media_minuti)} />
              <Tessera etichetta="Risoluzione media" valore={formattaMinuti(dati.kpi.risoluzione_media_minuti)} />
              <Tessera
                etichetta="SLA presa"
                valore={dati.kpi.sla_presa_percento === null ? "—" : `${dati.kpi.sla_presa_percento}%`}
                nota="entro l'obiettivo"
              />
              <Tessera
                etichetta="SLA risoluzione"
                valore={dati.kpi.sla_risoluzione_percento === null ? "—" : `${dati.kpi.sla_risoluzione_percento}%`}
                nota={`riaperture ${dati.kpi.tasso_riapertura_percento}%`}
              />
            </div>

            <section className="mt-4 rounded-card border border-crema-contorno bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                  Andamento aperti / chiusi
                </p>
                <div className="flex items-center gap-4 text-[11px] text-caldo-testo">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-inchiostro" /> Aperti
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-stato-ok-testo" /> Chiusi
                  </span>
                </div>
              </div>
              {trend.length === 0 ? (
                <p className="py-6 text-center text-sm text-caldo-testo">Nessun dato nel periodo.</p>
              ) : (
                <svg viewBox="0 0 600 180" className="h-48 w-full" role="img" aria-label="Andamento ticket aperti e chiusi">
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <line
                      key={f}
                      x1={0}
                      x2={600}
                      y1={150 - f * 130}
                      y2={150 - f * 130}
                      className="stroke-crema-contorno"
                      strokeWidth={1}
                      strokeDasharray={f === 0 ? "0" : "3 4"}
                    />
                  ))}
                  <polyline
                    points={pathSerie(trend.map((t) => t.aperti), 600, 130, maxTrend)}
                    transform="translate(0,20)"
                    fill="none"
                    className="stroke-inchiostro"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={pathSerie(trend.map((t) => t.chiusi), 600, 130, maxTrend)}
                    transform="translate(0,20)"
                    fill="none"
                    className="stroke-stato-ok-testo"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {trend.length > 0 && (
                <div className="mt-1 flex justify-between text-[10px] text-caldo-testo">
                  <span>{trend[0]?.giorno}</span>
                  <span>max {maxTrend}</span>
                  <span>{trend[trend.length - 1]?.giorno}</span>
                </div>
              )}
            </section>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Ticket per modulo</p>
                <Barre dati={dati.perModulo} />
              </section>
              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Canale di ingresso</p>
                <Barre dati={dati.perCanale} />
              </section>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Ore lavorate</p>
                {dati.perOperatore.length === 0 ? (
                  <p className="text-sm text-caldo-testo">Nessuna voce nel periodo.</p>
                ) : (
                  <ul className="space-y-2">
                    {dati.perOperatore.map((o) => (
                      <li key={o.operatore} className="flex items-center justify-between text-sm">
                        <span className="truncate text-inchiostro">{o.operatore}</span>
                        <span className="tabular font-semibold text-inchiostro">{o.ore}h</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Qualità del triage</p>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span className="text-caldo-testo">Ticket</span><span className="tabular font-semibold text-inchiostro">{dati.triage.esiti.ticket ?? 0}</span></li>
                  <li className="flex justify-between"><span className="text-caldo-testo">Da verificare</span><span className="tabular font-semibold text-inchiostro">{dati.triage.esiti.da_verificare ?? 0}</span></li>
                  <li className="flex justify-between"><span className="text-caldo-testo">Ignorate</span><span className="tabular font-semibold text-inchiostro">{dati.triage.esiti.ignora ?? 0}</span></li>
                </ul>
                {Object.keys(dati.triage.correzioni).length > 0 && (
                  <p className="mt-3 text-[11px] text-caldo-testo">
                    Correzioni umane:{" "}
                    {Object.entries(dati.triage.correzioni)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                  </p>
                )}
              </section>

              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Consumo AI</p>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span className="text-caldo-testo">Esecuzioni</span><span className="tabular font-semibold text-inchiostro">{dati.ai.esecuzioni}</span></li>
                  <li className="flex justify-between"><span className="text-caldo-testo">Token input</span><span className="tabular font-semibold text-inchiostro">{dati.ai.prompt_tokens.toLocaleString("it-IT")}</span></li>
                  <li className="flex justify-between"><span className="text-caldo-testo">Token output</span><span className="tabular font-semibold text-inchiostro">{dati.ai.completion_tokens.toLocaleString("it-IT")}</span></li>
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Barre({ dati }: { dati: Array<{ nome: string; n: number }> }) {
  const max = Math.max(1, ...dati.map((d) => d.n));
  if (dati.length === 0) {
    return <p className="text-sm text-caldo-testo">Nessun dato nel periodo.</p>;
  }
  return (
    <ul className="space-y-2">
      {dati.map((d) => (
        <li key={d.nome}>
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-caldo-testo">{d.nome || "—"}</span>
            <span className="tabular font-semibold text-inchiostro">{d.n}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-crema-scuro">
            <div className="h-full rounded-full bg-inchiostro" style={{ width: `${(d.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
