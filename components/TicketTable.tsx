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
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-8">
            <p className="text-sm font-medium text-inchiostro">
              Nessun ticket corrisponde ai filtri
            </p>
            {/* Uno stato vuoto deve dire come uscirne: senza questa riga
                l'utente non sa se il vuoto dipende dai filtri o dai dati. */}
            <p className="text-xs text-caldo-testo">
              Prova ad allargare i filtri o a cambiare modulo.
            </p>
          </div>
        )}

        {tickets.map((t) => (
          <Link
            key={t.id}
            href={`/tickets/${t.id}`}
            className="flex items-center gap-3 border-b border-crema-bordo px-4 py-3 transition-colors duration-200 hover:bg-crema-scuro"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-stato-neutro-bg text-caldo-testo">
              <TicketIcon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 truncate">
                <span className="tabular shrink-0 text-xs font-bold text-caldo-testo">
                  {t.numero}
                </span>
                <span className="truncate text-sm font-semibold text-inchiostro">{t.cliente}</span>
              </p>
              <p className="truncate text-xs text-caldo-testo">{t.sommario_problema}</p>
              <p className="mt-0.5 truncate text-[11px] text-caldo-testo/80">
                {t.modulo_software}
              </p>
            </div>

            {/* Operatore assegnato */}
            <div className="w-32 shrink-0">
              {t.operatore ? (
                <div
                  className={`flex items-center gap-1.5 rounded-control border px-2 py-1.5 text-xs font-semibold ${
                    isAssignedToMe(t)
                      ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                      : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"
                  }`}
                >
                  <UserIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{isAssignedToMe(t) ? "Tu" : t.operatore}</span>
                </div>
              ) : (
                // "Disponibile" e' uno stato ATTIVO, non un avviso: usa la
                // famiglia attesa (peach), non l'ambra generica di prima.
                <span className="inline-flex items-center gap-1 rounded-control border border-dashed border-stato-attesa-bordo bg-stato-attesa-bg px-2 py-1.5 text-xs font-semibold text-stato-attesa-testo">
                  <span className="h-1.5 w-1.5 rounded-full bg-stato-attesa-testo/50" />
                  Disponibile
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <PriorityBadge priorita={t.priorita} />
              <StatusBadge stato={t.stato} />
            </div>

            <span className="tabular w-24 shrink-0 text-right text-xs text-caldo-testo">
              {t.data_creazione}
            </span>

            {(onTakeTicket || onReleaseTicket) && (
              <div className="ml-2 flex shrink-0 items-center gap-1">
                {isUnassigned(t) && onTakeTicket && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTakeTicket(t.id);
                    }}
                    // 28px non e' un bersaglio comodo al tocco, ma questa
                    // tabella e' una vista desktop: sotto md la sidebar
                    // sparisce e il layout passa a colonna singola.
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo transition-colors duration-200 hover:bg-stato-ok-bordo focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
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
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo transition-colors duration-200 hover:bg-stato-attesa-bordo focus:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
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
        <div className="flex items-center justify-between border-t border-crema-bordo px-4 py-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => onPageChange(pagina - 1)}
            className="cursor-pointer rounded-full border border-crema-contorno bg-white px-3 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Prec
          </button>
          <span className="tabular text-xs text-caldo-testo">
            Pagina {pagina} di {pagine}
          </span>
          <button
            type="button"
            disabled={pagina >= pagine}
            onClick={() => onPageChange(pagina + 1)}
            className="cursor-pointer rounded-full border border-crema-contorno bg-white px-3 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-40"
          >
            Succ ›
          </button>
        </div>
      )}
    </div>
  );
}
