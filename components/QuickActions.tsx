import Link from "next/link";
import {
  BookIcon,
  ChevronRightIcon,
  FlameIcon,
  RefreshIcon,
  RotateCcwIcon,
} from "@/components/icons";

interface QuickActionsProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
  onFilterUrgenti: () => void;
  onResetFilters: () => void;
}

export default function QuickActions({
  lastUpdate,
  onRefresh,
  onFilterUrgenti,
  onResetFilters,
}: QuickActionsProps) {
  const actions = [
    {
      label: "Aggiorna dati",
      icon: RefreshIcon,
      onClick: onRefresh,
    },
    {
      label: "Ticket urgenti",
      icon: FlameIcon,
      onClick: onFilterUrgenti,
    },
    {
      label: "Reset filtri",
      icon: RotateCcwIcon,
      onClick: onResetFilters,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Azioni Rapide</h3>
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <a.icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">{a.label}</span>
              <ChevronRightIcon className="h-4 w-4 text-slate-300" />
            </button>
          ))}
          <Link
            href="/knowledge"
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <BookIcon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">Knowledge Base</span>
            <ChevronRightIcon className="h-4 w-4 text-slate-300" />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Stato del Sistema
        </h3>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Tutti i sistemi operativi
        </p>
        <p className="mt-1.5 text-xs text-slate-400">
          Aggiornamento automatico ogni 30s
          {lastUpdate
            ? ` · ultimo controllo ${lastUpdate.toLocaleTimeString("it-IT")}`
            : ""}
        </p>
      </div>
    </div>
  );
}
