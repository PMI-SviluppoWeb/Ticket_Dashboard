import type { Stats } from "@/lib/types";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  HourglassIcon,
} from "@/components/icons";

interface StatsCardsProps {
  stats: Stats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Ticket Aperti",
      value: stats.aperti,
      icon: AlertTriangleIcon,
      iconClass: "bg-red-50 text-red-500",
      badge: `${stats.nuovi} nuovi`,
      badgeClass: "bg-red-50 text-red-600",
    },
    {
      label: "In Lavorazione",
      value: stats.inCorso,
      icon: HourglassIcon,
      iconClass: "bg-violet-50 text-violet-500",
      badge: "Monitorati",
      badgeClass: "bg-slate-100 text-slate-500",
    },
    {
      label: "Risolti",
      value: stats.risolti,
      icon: CheckCircleIcon,
      iconClass: "bg-emerald-50 text-emerald-600",
      badge: `${stats.chiusi} chiusi`,
      badgeClass: "bg-emerald-50 text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.iconClass}`}
            >
              <c.icon className="h-5 w-5" />
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.badgeClass}`}
            >
              {c.badge}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-slate-500">{c.label}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-800">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
