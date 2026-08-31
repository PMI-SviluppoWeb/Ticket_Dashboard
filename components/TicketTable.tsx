import Link from "next/link";
import type { TicketRow } from "@/lib/types";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { TicketIcon } from "@/components/icons";

interface TicketTableProps {
  tickets: TicketRow[];
  pagina: number;
  totale: number;
  paginaSize: number;
  onPageChange: (p: number) => void;
}

export default function TicketTable({
  tickets,
  pagina,
  totale,
  paginaSize,
  onPageChange,
}: TicketTableProps) {
  const pagine = Math.max(1, Math.ceil(totale / paginaSize));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="max-h-[480px] flex-1 overflow-y-auto">
        {tickets.length === 0 && (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-sm text-slate-400">
              Nessun ticket corrisponde ai filtri selezionati.
            </p>
          </div>
        )}

        {tickets.map((t) => (
          <Link
            key={t.id}
            href={`/tickets/${t.id}`}
            className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TicketIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 truncate">
                <span className="shrink-0 text-xs font-bold text-slate-500">{t.numero}</span>
                <span className="truncate text-sm font-semibold text-slate-800">{t.cliente}</span>
              </p>
              <p className="truncate text-xs text-slate-500">{t.sommario_problema}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {t.modulo_software}
                {t.operatore ? ` · ${t.operatore}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <PriorityBadge priorita={t.priorita} />
              <StatusBadge stato={t.stato} />
            </div>

            <span className="w-24 shrink-0 text-right text-xs text-slate-400">
              {t.data_creazione}
            </span>
          </Link>
        ))}
      </div>

      {totale > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => onPageChange(pagina - 1)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ‹ Prec
          </button>
          <span className="text-xs text-slate-500">
            Pagina {pagina} di {pagine}
          </span>
          <button
            type="button"
            disabled={pagina >= pagine}
            onClick={() => onPageChange(pagina + 1)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Succ ›
          </button>
        </div>
      )}
    </div>
  );
}
