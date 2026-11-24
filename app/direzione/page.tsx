"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import { usePolling } from "@/lib/usePolling";
import PageHeader from "@/components/PageHeader";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BarChartIcon,
  ClockIcon,
  EyeIcon,
  FolderIcon,
  ListChecksIcon,
  LoaderIcon,
  MailIcon,
  PlusIcon,
  RefreshIcon,
  TicketIcon,
} from "@/components/icons";
import type {
  DirezioneData,
  PresenzaOperatore,
  SquadraOperatore,
  TaskScadenzaDashboard,
} from "@/lib/types";

const PRESENZA_LABEL: Record<PresenzaOperatore, string> = {
  al_lavoro: "Al lavoro",
  attivo: "Attivo",
  non_attivo: "Non attivo",
};

const PRESENZA_CLASSE: Record<PresenzaOperatore, string> = {
  al_lavoro: "border-lime-scuro bg-lime text-lime-testo",
  attivo: "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo",
  non_attivo: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
};

function minutiLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function etaLabel(ore: number): string {
  if (ore < 24) return `${ore}h`;
  const g = Math.floor(ore / 24);
  const h = ore % 24;
  return h === 0 ? `${g}g` : `${g}g ${h}h`;
}

function quando(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24) return `${ore}h fa`;
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
}

function oraLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function hrefCosaFa(o: SquadraOperatore): string | null {
  const a = o.attivita_aperta;
  if (!a) return null;
  if (a.tipo === "ticket" && a.id) return `/tickets/${a.id}`;
  if (a.tipo === "attivita") {
    return a.progetto_id ? `/progetti/${a.progetto_id}` : "/calendario";
  }
  return null;
}

function hrefTask(task: TaskScadenzaDashboard): string {
  return task.progetto_id ? `/progetti/${task.progetto_id}` : "/progetti";
}

function percorsoTrend(valori: number[], max: number): string {
  if (valori.length === 0) return "";
  const larghezza = 600;
  const altezza = 120;
  const passo = valori.length > 1 ? larghezza / (valori.length - 1) : 0;
  return valori
    .map((n, i) => {
      const y = altezza - (max > 0 ? (n / max) * altezza : 0);
      return `${(i * passo).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function DirezionePage() {
  const { operatore, caricamento: caricamentoSessione } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";

  const [dati, setDati] = useState<DirezioneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      const res = await fetch("/api/direzione", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Errore nel caricamento."
        );
      }
      setDati(data as DirezioneData);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void carica();
  }, [isAdmin, carica]);

  usePolling(() => void carica(), 30000, isAdmin);

  const maxTrend = useMemo(
    () =>
      Math.max(
        1,
        ...(dati?.trend ?? []).map((t) => Math.max(t.creati, t.chiusi))
      ),
    [dati]
  );

  if (caricamentoSessione) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-crema-scuro text-caldo-testo">
            <EyeIcon className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-inchiostro">Area riservata</h2>
          <p className="mt-2 text-sm text-caldo-testo">
            La Direzione è accessibile solo con un account amministratore.
          </p>
          <Link
            href="/login?redirect=/direzione"
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  const k = dati?.kpi;
  const miei = dati?.miei;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="w-full">
        <PageHeader
          titolo="Direzione"
          sottotitolo="La situazione di oggi: chi sta lavorando e su cosa, ticket aperti, impegni personali e andamento della settimana."
          azioni={
            <div className="flex items-center gap-2">
              {dati && (
                <span className="text-[11px] text-caldo-testo">
                  Aggiornato alle {oraLabel(dati.generato_il)}
                </span>
              )}
              <button
                type="button"
                onClick={() => void carica()}
                disabled={loading}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshIcon className="h-4 w-4" />
                )}
                Aggiorna
              </button>
            </div>
          }
        />

        {errore && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo"
          >
            <AlertTriangleIcon className="h-4 w-4 shrink-0" />
            {errore}
          </p>
        )}

        {/* Operazioni rapide: in alto e ben visibili, sono le azioni che il
            capo usa davvero ogni giorno. */}
        <section
          aria-label="Operazioni rapide"
          className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <AzioneRapida
            href="/?nuovo=1"
            icona={<PlusIcon className="h-5 w-5" />}
            titolo="Nuovo ticket"
            nota="Apri una richiesta"
            primaria
          />
          <AzioneRapida
            href="/inbox"
            icona={<MailIcon className="h-5 w-5" />}
            titolo="Inbox"
            nota="Email da verificare"
          />
          <AzioneRapida
            href="/admin/dashboard"
            icona={<BarChartIcon className="h-5 w-5" />}
            titolo="Andamento"
            nota="SLA e trend"
          />
          <AzioneRapida
            href="/report"
            icona={<FolderIcon className="h-5 w-5" />}
            titolo="Report ore"
            nota="Ore e fatturazione"
          />
        </section>

        {!dati && loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
          </div>
        ) : dati && k && miei ? (
          <>
            {/* 1. KPI di oggi */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Tessera
                etichetta="Ticket aperti"
                valore={String(k.ticket.aperti)}
                nota={`${k.ticket.nuovi} nuovi · ${k.ticket.in_corso} in corso`}
                icona={<TicketIcon className="h-4 w-4" />}
              />
              <Tessera
                etichetta="Da prendere"
                valore={String(k.ticket.da_prendere)}
                nota="NUOVO senza operatore"
                tinta={
                  k.ticket.da_prendere > 0
                    ? "border-stato-attesa-bordo bg-stato-attesa-bg"
                    : undefined
                }
              />
              <Tessera
                etichetta="SLA a rischio"
                valore={`${k.sla.scaduti + k.sla.in_scadenza}`}
                nota={`${k.sla.scaduti} scaduti · ${k.sla.in_scadenza} in scadenza`}
                tinta={
                  k.sla.scaduti > 0
                    ? "border-stato-urgenza-bordo bg-stato-urgenza-bg"
                    : undefined
                }
              />
              <Tessera
                etichetta="Ore oggi (team)"
                valore={minutiLabel(k.tempo.oggi_minuti)}
                nota={`Settimana ${minutiLabel(k.tempo.settimana_minuti)}`}
                icona={<ClockIcon className="h-4 w-4" />}
              />
              <Tessera
                etichetta="Squadra"
                valore={`${k.squadra.al_lavoro}/${k.squadra.totale}`}
                nota={`${k.squadra.attivi} attivi · ${k.squadra.al_lavoro} al lavoro`}
              />
              <Tessera
                etichetta="Email da verificare"
                valore={String(k.inbox_da_verificare)}
                nota={`${k.progetti_attivi} progetti attivi`}
                icona={<MailIcon className="h-4 w-4" />}
              />
            </div>

            {/* 2. Squadra ora */}
            <section className="mt-5 rounded-card border border-crema-contorno bg-white">
              <div className="flex items-center justify-between border-b border-crema-bordo px-4 py-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-inchiostro">
                  <EyeIcon className="h-4 w-4 text-caldo-testo" />
                  Squadra ora
                </h2>
                <span className="text-[11px] text-caldo-testo">
                  Presenza dedotta da timer e ultima azione (30 min)
                </span>
              </div>

              {dati.squadra.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-caldo-testo">
                  Nessun operatore attivo.
                </p>
              ) : (
                <>
                  {/* Tabella desktop */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-crema-bordo bg-crema-scuro text-[11px] uppercase tracking-wide text-caldo-testo">
                          <th className="px-4 py-2 font-medium">Operatore</th>
                          <th className="px-4 py-2 font-medium">Stato</th>
                          <th className="px-4 py-2 font-medium">Cosa sta facendo</th>
                          <th className="px-4 py-2 text-right font-medium">Da</th>
                          <th className="px-4 py-2 text-right font-medium">Oggi</th>
                          <th className="px-4 py-2 text-right font-medium">Ticket</th>
                          <th className="px-4 py-2 text-right font-medium">Ritardi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dati.squadra.map((o) => (
                          <RigaSquadra key={o.id} operatore={o} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Card mobile */}
                  <ul className="divide-y divide-crema-bordo md:hidden">
                    {dati.squadra.map((o) => (
                      <li key={o.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-inchiostro">
                              {o.nome}
                            </p>
                            <p className="mt-0.5 text-[11px] text-caldo-testo">
                              {o.ultima_attivita
                                ? `Ultima azione ${quando(o.ultima_attivita)}`
                                : o.ultimo_accesso
                                  ? `Accesso ${quando(o.ultimo_accesso)}`
                                  : "Nessuna attività recente"}
                            </p>
                          </div>
                          <BadgePresenza presenza={o.presenza} />
                        </div>
                        <CosaFa operatore={o} className="mt-2" />
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-caldo-testo">
                          <span>
                            Oggi <strong className="text-inchiostro">{minutiLabel(o.minuti_oggi)}</strong>
                          </span>
                          <span>
                            Settimana{" "}
                            <strong className="text-inchiostro">
                              {minutiLabel(o.minuti_settimana)}
                            </strong>
                          </span>
                          <span>
                            Ticket aperti{" "}
                            <strong className="text-inchiostro">{o.ticket_aperti}</strong>
                          </span>
                          <span>
                            Task in ritardo{" "}
                            <strong
                              className={
                                o.task_in_ritardo > 0
                                  ? "text-stato-urgenza-testo"
                                  : "text-inchiostro"
                              }
                            >
                              {o.task_in_ritardo}
                            </strong>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* 3. Ticket aperti */}
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="rounded-card border border-crema-contorno bg-white xl:col-span-2">
                <div className="flex items-center justify-between border-b border-crema-bordo px-4 py-3">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-inchiostro">
                    <TicketIcon className="h-4 w-4 text-caldo-testo" />
                    Ticket aperti in evidenza
                  </h2>
                  <span className="text-[11px] text-caldo-testo">
                    SLA, priorità, età
                  </span>
                </div>
                {dati.ticket_aperti.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-caldo-testo">
                    Nessun ticket aperto.
                  </p>
                ) : (
                  <ul className="divide-y divide-crema-bordo">
                    {dati.ticket_aperti.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/tickets/${t.id}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors duration-200 hover:bg-crema-scuro"
                        >
                          <span className="tabular shrink-0 font-mono text-xs font-semibold text-inchiostro">
                            {t.numero}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-caldo-testo">
                            {t.cliente} · {t.sommario}
                          </span>
                          <PriorityBadge priorita={t.priorita} />
                          <StatusBadge stato={t.stato} />
                          {t.sla && (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                t.sla === "scaduto"
                                  ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
                                  : "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo"
                              }`}
                            >
                              {t.sla === "scaduto" ? "SLA scaduto" : "SLA in scadenza"}
                            </span>
                          )}
                          <span className="tabular shrink-0 text-[11px] text-caldo-testo">
                            {t.operatore ?? "Non assegnato"} · {etaLabel(t.eta_ore)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 4. I miei impegni */}
              <section className="rounded-card border border-crema-contorno bg-white">
                <div className="flex items-center justify-between border-b border-crema-bordo px-4 py-3">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-inchiostro">
                    <ListChecksIcon className="h-4 w-4 text-caldo-testo" />
                    I miei impegni
                  </h2>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat etichetta="Ticket aperti" valore={miei.ticket.aperti} />
                    <MiniStat etichetta="In corso" valore={miei.ticket.in_corso} />
                    <MiniStat etichetta="Task in scadenza" valore={miei.task.in_scadenza} />
                    <MiniStat
                      etichetta="Task in ritardo"
                      valore={miei.task.in_ritardo}
                      allarme={miei.task.in_ritardo > 0}
                    />
                  </div>

                  <div className="rounded-control border border-crema-contorno bg-crema-scuro p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                      Il mio tempo
                    </p>
                    {miei.attivita_aperta ? (
                      <div className="mt-1.5">
                        <p className="text-xs font-medium text-inchiostro">
                          {miei.attivita_aperta.bersaglio ?? "Lavoro in corso"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-caldo-testo">
                          Timer aperto da {minutiLabel(miei.attivita_aperta.minuti_finora)} ·
                          oggi {minutiLabel(miei.tempo.minuti_oggi)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs text-caldo-testo">
                        Nessun timer attivo · oggi{" "}
                        <strong className="text-inchiostro">
                          {minutiLabel(miei.tempo.minuti_oggi)}
                        </strong>{" "}
                        · settimana{" "}
                        <strong className="text-inchiostro">
                          {minutiLabel(miei.tempo.minuti_settimana)}
                        </strong>
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                      Le mie task
                    </p>
                    {miei.task_lista.length === 0 ? (
                      <p className="text-xs text-caldo-testo">Nessuna task aperta.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {miei.task_lista.slice(0, 5).map((t) => (
                          <li key={t.id}>
                            <Link
                              href={hrefTask(t)}
                              className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 transition-colors duration-200 hover:bg-crema-scuro"
                            >
                              <span className="min-w-0 truncate text-xs text-inchiostro">
                                {t.titolo}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {t.in_ritardo && (
                                  <span className="text-[10px] font-semibold text-stato-urgenza-testo">
                                    in ritardo
                                  </span>
                                )}
                                <PriorityBadge priorita={t.priorita} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* 5. Trend 7 giorni */}
            <section className="mt-5 rounded-card border border-crema-contorno bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-inchiostro">
                  <BarChartIcon className="h-4 w-4 text-caldo-testo" />
                  Trend 7 giorni
                </h2>
                <div className="flex items-center gap-4 text-[11px] text-caldo-testo">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-inchiostro" /> Creati
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-stato-ok-testo" /> Chiusi
                  </span>
                </div>
              </div>
              <svg
                viewBox="0 0 600 140"
                className="h-36 w-full"
                role="img"
                aria-label="Ticket creati e chiusi negli ultimi 7 giorni"
              >
                {[0, 0.5, 1].map((f) => (
                  <line
                    key={f}
                    x1={0}
                    x2={600}
                    y1={130 - f * 120}
                    y2={130 - f * 120}
                    className="stroke-crema-contorno"
                    strokeWidth={1}
                    strokeDasharray={f === 0 ? "0" : "3 4"}
                  />
                ))}
                <polyline
                  points={percorsoTrend(
                    dati.trend.map((t) => t.creati),
                    maxTrend
                  )}
                  transform="translate(0,10)"
                  fill="none"
                  className="stroke-inchiostro"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={percorsoTrend(
                    dati.trend.map((t) => t.chiusi),
                    maxTrend
                  )}
                  transform="translate(0,10)"
                  fill="none"
                  className="stroke-stato-ok-testo"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <div className="mt-1 flex justify-between text-[10px] text-caldo-testo">
                <span>{dati.trend[0]?.giorno}</span>
                <span>max {maxTrend}</span>
                <span>{dati.trend[dati.trend.length - 1]?.giorno}</span>
              </div>
            </section>

          </>
        ) : (
          <p className="py-10 text-center text-sm text-caldo-testo">
            Nessun dato disponibile.
          </p>
        )}
      </div>
    </div>
  );
}

function Tessera({
  etichetta,
  valore,
  nota,
  icona,
  tinta,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  icona?: React.ReactNode;
  tinta?: string;
}) {
  return (
    <div
      className={`rounded-card border p-4 ${
        tinta ?? "border-crema-contorno bg-white"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
        {icona}
        {etichetta}
      </p>
      <p className="tabular mt-1 text-2xl font-semibold text-inchiostro">{valore}</p>
      {nota && <p className="mt-1 text-[11px] text-caldo-testo">{nota}</p>}
    </div>
  );
}

function MiniStat({
  etichetta,
  valore,
  allarme,
}: {
  etichetta: string;
  valore: number;
  allarme?: boolean;
}) {
  return (
    <div className="rounded-control border border-crema-contorno px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-caldo-testo">{etichetta}</p>
      <p
        className={`tabular text-lg font-semibold ${
          allarme && valore > 0 ? "text-stato-urgenza-testo" : "text-inchiostro"
        }`}
      >
        {valore}
      </p>
    </div>
  );
}

function BadgePresenza({ presenza }: { presenza: PresenzaOperatore }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRESENZA_CLASSE[presenza]}`}
    >
      {PRESENZA_LABEL[presenza]}
    </span>
  );
}

function CosaFa({
  operatore,
  className = "",
}: {
  operatore: SquadraOperatore;
  className?: string;
}) {
  const a = operatore.attivita_aperta;
  if (!a) {
    return <span className={`text-xs text-caldo-testo ${className}`}>—</span>;
  }
  const href = hrefCosaFa(operatore);
  const contenuto = (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-inchiostro">
      <span className="truncate">{a.etichetta}</span>
      {href && <ArrowRightIcon className="h-3 w-3 shrink-0 text-caldo-testo" />}
    </span>
  );
  return href ? (
    <Link href={href} className={`${className} hover:underline`}>
      {contenuto}
    </Link>
  ) : (
    <span className={className}>{contenuto}</span>
  );
}

function RigaSquadra({ operatore }: { operatore: SquadraOperatore }) {
  return (
    <tr className="border-b border-crema-bordo last:border-0 hover:bg-crema-scuro">
      <td className="px-4 py-2.5">
        <p className="text-sm font-medium text-inchiostro">{operatore.nome}</p>
        <p className="text-[10px] uppercase tracking-wide text-caldo-testo">
          {operatore.ruolo === "admin" ? "Admin" : "Operatore"}
        </p>
      </td>
      <td className="px-4 py-2.5">
        <BadgePresenza presenza={operatore.presenza} />
        <p className="mt-0.5 text-[10px] text-caldo-testo">
          {operatore.ultima_attivita
            ? `Ultima azione ${quando(operatore.ultima_attivita)}`
            : operatore.ultimo_accesso
              ? `Accesso ${quando(operatore.ultimo_accesso)}`
              : "Nessuna attività"}
        </p>
      </td>
      <td className="max-w-[280px] px-4 py-2.5">
        <CosaFa operatore={operatore} />
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs text-caldo-testo">
        {operatore.attivita_aperta
          ? minutiLabel(operatore.attivita_aperta.minuti_finora)
          : "—"}
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs text-inchiostro">
        {minutiLabel(operatore.minuti_oggi)}
        <span className="block text-[10px] text-caldo-testo">
          {minutiLabel(operatore.minuti_settimana)} sett.
        </span>
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs text-inchiostro">
        {operatore.ticket_aperti}
      </td>
      <td
        className={`tabular px-4 py-2.5 text-right text-xs ${
          operatore.task_in_ritardo > 0
            ? "font-semibold text-stato-urgenza-testo"
            : "text-caldo-testo"
        }`}
      >
        {operatore.task_in_ritardo}
      </td>
    </tr>
  );
}

function AzioneRapida({
  href,
  icona,
  titolo,
  nota,
  primaria = false,
}: {
  href: string;
  icona: React.ReactNode;
  titolo: string;
  nota: string;
  primaria?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-card border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft ${
        primaria
          ? "border-inchiostro bg-inchiostro text-white"
          : "border-crema-contorno bg-white text-inchiostro hover:border-inchiostro/30"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-200 ${
          primaria
            ? "bg-lime text-lime-testo"
            : "bg-crema-scuro text-caldo-testo group-hover:text-inchiostro"
        }`}
      >
        {icona}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{titolo}</span>
        <span
          className={`block truncate text-[11px] ${
            primaria ? "text-white/70" : "text-caldo-testo"
          }`}
        >
          {nota}
        </span>
      </span>
    </Link>
  );
}
