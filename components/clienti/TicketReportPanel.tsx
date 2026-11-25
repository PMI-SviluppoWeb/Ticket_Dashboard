"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { ClockIcon, TicketIcon } from "@/components/icons";
import type { ClienteSchedaTicket } from "@/lib/types";

type Periodo = "tutti" | "30" | "90" | "365";

const PERIODI: Array<{ id: Periodo; label: string }> = [
  { id: "tutti", label: "Tutti" },
  { id: "30", label: "Ultimi 30 giorni" },
  { id: "90", label: "Ultimi 90 giorni" },
  { id: "365", label: "Ultimo anno" },
];

function data(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function minutiLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function TicketReportPanel({
  tickets,
  ore,
}: {
  tickets: ClienteSchedaTicket[];
  ore: { voci: number; minuti: number };
}) {
  const [periodo, setPeriodo] = useState<Periodo>("tutti");

  const filtrati = useMemo(() => {
    if (periodo === "tutti") return tickets;
    const giorni = Number(periodo);
    const limite = Date.now() - giorni * 86_400_000;
    return tickets.filter((t) => {
      if (!t.creato_il) return false;
      const ts = new Date(t.creato_il).getTime();
      return Number.isFinite(ts) && ts >= limite;
    });
  }, [tickets, periodo]);

  const conteggi = useMemo(() => {
    let aperti = 0;
    let chiusi = 0;
    const perStato: Record<string, number> = {};
    const perPriorita: Record<string, number> = {};
    const perModulo = new Map<string, number>();
    for (const t of filtrati) {
      if (t.stato === "NUOVO" || t.stato === "IN_CORSO") aperti += 1;
      if (t.stato === "CHIUSO" || t.stato === "RISOLTO") chiusi += 1;
      perStato[t.stato] = (perStato[t.stato] ?? 0) + 1;
      perPriorita[t.priorita] = (perPriorita[t.priorita] ?? 0) + 1;
      const modulo = t.modulo_software || "—";
      perModulo.set(modulo, (perModulo.get(modulo) ?? 0) + 1);
    }
    return {
      aperti,
      chiusi,
      perStato,
      perPriorita,
      perModulo: Array.from(perModulo.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
    };
  }, [filtrati]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-inchiostro">
            Ticket e ore
          </h2>
          <p className="text-xs text-caldo-testo">
            Volumi e lavoro svolto per questo cliente (fino a 100 ticket
            recenti).
          </p>
        </div>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as Periodo)}
          aria-label="Filtra per periodo"
          className="rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
        >
          {PERIODI.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tessera etichetta="Ticket" valore={String(filtrati.length)} />
        <Tessera etichetta="Aperti" valore={String(conteggi.aperti)} />
        <Tessera etichetta="Chiusi" valore={String(conteggi.chiusi)} />
        <Tessera
          etichetta="Ore registrate"
          valore={minutiLabel(ore.minuti)}
          nota={`${ore.voci} voci`}
          icona={<ClockIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Per priorità
          </p>
          <div className="flex flex-wrap gap-2">
            {(["ALTA", "MEDIA", "BASSA"] as const).map((p) => (
              <span
                key={p}
                className="rounded-control border border-crema-contorno px-2.5 py-1 text-xs text-caldo-testo"
              >
                {p}: <strong className="text-inchiostro">{conteggi.perPriorita[p] ?? 0}</strong>
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Moduli ricorrenti
          </p>
          {conteggi.perModulo.length === 0 ? (
            <p className="text-xs text-caldo-testo">Nessun ticket nel periodo.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {conteggi.perModulo.map(([nome, n]) => (
                <li key={nome} className="flex items-center justify-between gap-2">
                  <span className="truncate text-caldo-testo">{nome}</span>
                  <span className="tabular font-semibold text-inchiostro">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
        <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
          <TicketIcon className="h-4 w-4 text-caldo-testo" />
          <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Ticket ({filtrati.length})
          </p>
        </div>
        {filtrati.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-caldo-testo">
            Nessun ticket nel periodo selezionato.
          </p>
        ) : (
          <ul className="divide-y divide-crema-bordo">
            {filtrati.map((t) => (
              <li key={t.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="truncate text-sm font-semibold text-inchiostro underline-offset-2 hover:underline"
                    >
                      {t.numero} · {t.sommario_problema}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-caldo-testo">
                      {t.modulo_software} · aperto {data(t.creato_il)}
                      {t.chiuso_il ? ` · chiuso ${data(t.chiuso_il)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priorita={t.priorita} />
                    <StatusBadge stato={t.stato} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  icona?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-crema-contorno bg-white p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">
        {icona}
        {etichetta}
      </p>
      <p className="tabular mt-1 text-xl font-semibold text-inchiostro">{valore}</p>
      {nota && <p className="text-[10px] text-caldo-testo">{nota}</p>}
    </div>
  );
}
