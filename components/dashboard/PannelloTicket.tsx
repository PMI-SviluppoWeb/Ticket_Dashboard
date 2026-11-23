import type { TicketListRow } from "@/lib/types";
import FiltersBar, { OrdinaPill, type Filters } from "@/components/FiltersBar";
import SectionBar from "@/components/SectionBar";
import TicketTable from "@/components/TicketTable";
import Pannello from "./Pannello";
import { TicketIcon } from "@/components/icons";

interface PannelloTicketProps {
  tickets: TicketListRow[];
  totale: number;
  pagina: number;
  paginaSize: number;
  loading: boolean;
  error: string;
  filters: Filters;
  moduli: string[];
  operatori: string[];
  onFiltersChange: (patch: Partial<Filters>) => void;
  onPageChange: (pagina: number) => void;
  onAzzera: () => void;
  onTakeTicket?: (id: string) => void;
  onReleaseTicket?: (id: string) => void;
  currentOperator?: string;
  className?: string;
}

// Colonna sinistra alta: i ticket con tutti i filtri. La tabella usa la
// variante compatta: in una cella da 7/12 le colonne a larghezza fissa non
// entrano e andrebbero a capo.
export default function PannelloTicket({
  tickets,
  totale,
  pagina,
  paginaSize,
  loading,
  error,
  filters,
  moduli,
  operatori,
  onFiltersChange,
  onPageChange,
  onAzzera,
  onTakeTicket,
  onReleaseTicket,
  currentOperator = "",
  className = "",
}: PannelloTicketProps) {
  return (
    <Pannello ariaLabel="Ticket" className={className}>
      <SectionBar titolo="Ticket" icona={TicketIcon} conteggio={totale}>
        <OrdinaPill
          value={filters.ordina}
          onChange={(ordina) => onFiltersChange({ ordina })}
        />
        <button
          type="button"
          onClick={onAzzera}
          className="cursor-pointer text-xs font-semibold text-inchiostro underline-offset-2 hover:underline"
        >
          Azzera filtri
        </button>
      </SectionBar>

      <FiltersBar
        filters={filters}
        moduli={moduli}
        operatori={operatori}
        onChange={onFiltersChange}
      />

      {error && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
        >
          {error}
        </p>
      )}

      {loading && tickets.length === 0 ? (
        <Scheletro />
      ) : (
        <TicketTable
          tickets={tickets}
          pagina={pagina}
          totale={totale}
          paginaSize={paginaSize}
          onPageChange={onPageChange}
          onTakeTicket={onTakeTicket}
          onReleaseTicket={onReleaseTicket}
          currentOperator={currentOperator}
          variante="compatto"
        />
      )}
    </Pannello>
  );
}

function Scheletro() {
  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-16 rounded-full bg-crema-scuro" />
            <div className="h-2.5 w-1/3 rounded-full bg-crema-scuro" />
            <div className="ml-auto h-5 w-20 rounded-full bg-crema-scuro" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-1/2 rounded-full bg-crema-scuro" />
            <div className="ml-auto h-2 w-16 rounded-full bg-crema-scuro" />
          </div>
        </div>
      ))}
    </div>
  );
}
