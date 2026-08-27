import Link from "next/link";
import type { TicketRow } from "@/lib/types";
import { PriorityBadge, StatusBadge } from "@/components/badges";

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
      <div className="flex-1 overflow-y-auto">
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
            className="block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">{t.numero}</span>
              <div className="flex items-center gap-1.5">
                <PriorityBadge priorita={t.priorita} />
                <StatusBadge stato={t.stato} />
              </div>
            </div>
            <p className="truncate text-sm font-semibold text-slate-800">{t.cliente}</p>
            <p className="mb-1 truncate text-xs text-slate-500">{t.sommario_problema}</p>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">
                {t.modulo_software}
                {t.operatore ? ` · ${t.operatore}` : ""}
              </span>
              <span>{t.data_creazione}</span>
            </div>
          </Link>
        ))}
      </div>

      {totale > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => onPageChange(pagina - 1)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
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
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Succ ›
          </button>
        </div>
      )}
    </div>
  );
}
