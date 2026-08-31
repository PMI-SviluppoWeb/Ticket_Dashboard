import type { Priorita, StatoTicket } from "@/lib/types";
import { ChevronDownIcon, SearchIcon } from "@/components/icons";

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

interface PillSelectProps {
  value: string;
  onChange: (value: string) => void;
  variant: "primary" | "neutral";
  children: React.ReactNode;
}

function PillSelect({ value, onChange, variant, children }: PillSelectProps) {
  const styles =
    variant === "primary"
      ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-800"
      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-full border py-1 pl-3 pr-7 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${styles}`}
      >
        {children}
      </select>
      <ChevronDownIcon
        className={`pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 ${
          variant === "primary" ? "text-blue-100" : "text-slate-400"
        }`}
      />
    </span>
  );
}

export default function FiltersBar({ filters, moduli, visibili, totale, onChange }: FiltersBarProps) {
  return (
    <div className="space-y-3 border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Cerca cliente, numero, modulo…"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Ordina:
          <select
            value={filters.ordina}
            onChange={(e) => onChange({ ordina: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="data_desc">Più recenti</option>
            <option value="data_asc">Più vecchi</option>
            <option value="priorita">Priorità (alta → bassa)</option>
          </select>
        </label>
        <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:inline">
          {visibili}/{totale}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Filtri:
        </span>
        <PillSelect
          variant="primary"
          value={filters.priorita}
          onChange={(priorita) => onChange({ priorita: priorita as Filters["priorita"] })}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "TUTTE" ? "Priorità: tutte" : `Priorità ${p.toLowerCase()}`}
            </option>
          ))}
        </PillSelect>
        <PillSelect
          variant="neutral"
          value={filters.stato}
          onChange={(stato) => onChange({ stato: stato as Filters["stato"] })}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "TUTTI" ? "Stato: tutti" : s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </PillSelect>
        <PillSelect
          variant="neutral"
          value={filters.modulo}
          onChange={(modulo) => onChange({ modulo })}
        >
          <option value="">Modulo: tutti</option>
          {moduli.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </PillSelect>
      </div>
    </div>
  );
}
