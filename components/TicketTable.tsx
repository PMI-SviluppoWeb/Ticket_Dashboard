import Link from "next/link";
import type { TicketRow } from "@/lib/types";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { TicketIcon, UserPlusIcon, UserMinusIcon, UserIcon } from "@/components/icons";

interface TicketTableProps {
  tickets: TicketRow[];
  pagina: number;
  totale: number;
  paginaSize: number;
  onPageChange: (p: number) => void;
  onTakeTicket?: (id: string) => void;
  onReleaseTicket?: (id: string) => void;
  currentOperator?: string;
}

export default function TicketTable({
  tickets,
  pagina,
  totale,
  paginaSize,
  onPageChange,
  onTakeTicket,
  onReleaseTicket,
  currentOperator = "",
}: TicketTableProps) {
  const pagine = Math.max(1, Math.ceil(totale / paginaSize));

  const isAssignedToMe = (ticket: TicketRow) => ticket.operatore === currentOperator;
  const isUnassigned = (ticket: TicketRow) => !ticket.operatore;

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
              </p>
            </div>

            {/* Assigned Operator - Prominent */}
            <div className="shrink-0 w-32">
              {t.operatore ? (
                <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  isAssignedToMe(t) 
                    ? "bg-green-100 text-green-700" 
                    : "bg-slate-100 text-slate-700"
                }`}>
                  <UserIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {isAssignedToMe(t) ? "Tu" : t.operatore}
                  </span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Disponibile
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <PriorityBadge priorita={t.priorita} />
              <StatusBadge stato={t.stato} />
            </div>

            <span className="w-24 shrink-0 text-right text-xs text-slate-400">
              {t.data_creazione}
            </span>

            {(onTakeTicket || onReleaseTicket) && (
              <div className="flex shrink-0 items-center gap-1 ml-2">
                {isUnassigned(t) && onTakeTicket && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTakeTicket(t.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition"
                    title="Prendi in carico"
                    aria-label="Prendi in carico questo ticket"
                  >
                    <UserPlusIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {isAssignedToMe(t) && onReleaseTicket && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onReleaseTicket(t.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                    title="Rilascia ticket"
                    aria-label="Rilascia questo ticket"
                  >
                    <UserMinusIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
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