import type { Stats } from "@/lib/types";

interface StatsCardsProps {
  stats: Stats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Aperti",
      value: stats.aperti,
      sub: `${stats.nuovi} nuovi · ${stats.inCorso} in corso`,
      accent: "border-blue-500",
      valueClass: "text-blue-700",
    },
    {
      label: "Priorità alta",
      value: stats.prioritaAlta,
      sub: "Da gestire con urgenza",
      accent: "border-red-500",
      valueClass: "text-red-600",
    },
    {
      label: "Risolti",
      value: stats.risolti,
      sub: `${stats.chiusi} chiusi`,
      accent: "border-emerald-500",
      valueClass: "text-emerald-600",
    },
    {
      label: "Totali",
      value: stats.totale,
      sub: `${stats.prioritaMedia} media · ${stats.prioritaBassa} bassa`,
      accent: "border-slate-400",
      valueClass: "text-slate-800",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border border-t-2 ${c.accent} bg-white p-4 shadow-sm`}
        >
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className={`mt-1 text-3xl font-bold ${c.valueClass}`}>{c.value}</p>
          <p className="mt-1 text-xs text-slate-400">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
