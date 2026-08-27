import type { Priorita, StatoTicket } from "@/lib/types";

export interface Filters {
  stato: StatoTicket | "TUTTI";
  priorita: Priorita | "TUTTE";
  q: string;
  modulo: string;
  ordina: string;
}

export const DEFAULT_FILTERS: Filters = {
  stato: "TUTTI",
  priorita: "TUTTE",
  q: "",
  modulo: "",
  ordina: "data_desc",
};

interface FiltersBarProps {
  filters: Filters;
  moduli: string[];
  visibili: number;
  totale: number;
  onChange: (patch: Partial<Filters>) => void;
}

const STATUS_OPTIONS: Array<StatoTicket | "TUTTI"> = ["TUTTI", "NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];
const PRIORITY_OPTIONS: Array<Priorita | "TUTTE"> = ["TUTTE", "ALTA", "MEDIA", "BASSA"];

export default function FiltersBar({ filters, moduli, visibili, totale, onChange }: FiltersBarProps) {
  return (
    <div className="space-y-2 border-b border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Elenco ticket</h2>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          {visibili}/{totale}
        </span>
      </div>

      <input
        value={filters.q}
        onChange={(e) => onChange({ q: e.target.value })}
        placeholder="Cerca numero, cliente, modulo, sommario…"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={filters.stato}
          onChange={(e) => onChange({ stato: e.target.value as Filters["stato"] })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "TUTTI" ? "Stato: tutti" : s}
            </option>
          ))}
        </select>
        <select
          value={filters.priorita}
          onChange={(e) => onChange({ priorita: e.target.value as Filters["priorita"] })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "TUTTE" ? "Priorità: tutte" : p}
            </option>
          ))}
        </select>
        <select
          value={filters.modulo}
          onChange={(e) => onChange({ modulo: e.target.value })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="">Modulo: tutti</option>
          {moduli.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={filters.ordina}
          onChange={(e) => onChange({ ordina: e.target.value })}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="data_desc">Più recenti</option>
          <option value="data_asc">Più vecchi</option>
          <option value="priorita">Priorità (alta → bassa)</option>
        </select>
      </div>
    </div>
  );
}
