import type { Priorita, StatoTicket } from "@/lib/types";

export const PRIORITY_STYLES: Record<Priorita, string> = {
  ALTA: "bg-red-100 text-red-700 border-red-200",
  MEDIA: "bg-amber-100 text-amber-700 border-amber-200",
  BASSA: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const STATUS_STYLES: Record<StatoTicket, string> = {
  NUOVO: "bg-blue-100 text-blue-700",
  IN_CORSO: "bg-violet-100 text-violet-700",
  RISOLTO: "bg-emerald-100 text-emerald-700",
  CHIUSO: "bg-slate-200 text-slate-600",
};

export function PriorityBadge({ priorita }: { priorita: Priorita }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[priorita]}`}
    >
      {priorita}
    </span>
  );
}

export function StatusBadge({ stato }: { stato: StatoTicket }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[stato]}`}
    >
      {stato}
    </span>
  );
}
