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
  onChange: (patch: Partial<Filters>) => void;
}

const STATUS_OPTIONS: Array<StatoTicket | "TUTTI"> = ["TUTTI", "NUOVO", "IN_CORSO", "RISOLTO", "CHIUSO"];
const PRIORITY_OPTIONS: Array<Priorita | "TUTTE"> = ["TUTTE", "ALTA", "MEDIA", "BASSA"];

interface PillSelectProps {
  value: string;
  onChange: (value: string) => void;
  variant: "primary" | "neutral";
  ariaLabel: string;
  children: React.ReactNode;
}

function PillSelect({ value, onChange, variant, ariaLabel, children }: PillSelectProps) {
  // La pillola attiva e' in inchiostro pieno, non in un colore d'accento:
  // il blu non esiste piu' in questa palette e il nero e' gia' il colore
  // delle azioni primarie (bottoni, voce di sidebar attiva).
  const styles =
    variant === "primary"
      ? "border-inchiostro bg-inchiostro text-white hover:bg-inchiostro-profondo"
      : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro";

  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`cursor-pointer appearance-none rounded-full border py-1.5 pl-3 pr-7 text-xs font-semibold transition-colors duration-200 focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro ${styles}`}
      >
        {children}
      </select>
      <ChevronDownIcon
        className={`pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 ${
          variant === "primary" ? "text-white/70" : "text-caldo-testo"
        }`}
      />
    </span>
  );
}

// Ordinamento come pillola pronta, da mettere nella barra di sezione.
//
// Sta qui e non nella FiltersBar per una ragione misurata: l'elenco sta in una
// colonna da 750px, e ricerca + quattro select ne chiedono 890. Vanno a capo,
// e con un solo controllo a capo la barra sembra rotta invece che adattata.
//
// La separazione ha anche senso in se': l'ordinamento dice COME guardo i dati,
// non QUALI dati vedo — quindi appartiene alla testata della sezione, accanto
// al conteggio; i filtri restano nella barra sopra l'elenco. E' la stessa
// divisione della reference, dove i "tab" di vista stanno in testa.
export function OrdinaPill({
  value,
  onChange,
}: {
  value: string;
  onChange: (ordina: string) => void;
}) {
  return (
    <PillSelect
      variant="neutral"
      ariaLabel="Ordina i ticket"
      value={value}
      onChange={onChange}
    >
      <option value="data_desc">Più recenti</option>
      <option value="data_asc">Più vecchi</option>
      <option value="priorita">Priorità (alta → bassa)</option>
    </PillSelect>
  );
}

// Barra dei filtri — UNA riga sola, non due.
//
// Prima era `space-y-3` su due righe: sopra ricerca + ordinamento + contatore,
// sotto le tre pillole. Due righe per quattro controlli significava che la
// ricerca cominciava a meta' della card e i filtri sembravano appartenere a
// un'altra sezione. Ora tutto sta sulla stessa riga, come nella reference
// (`[ricerca] [tab] [contatore]`), e la barra si legge come un unico blocco
// di comandi.
//
// Il contatore `{visibili}/{totale}` NON e' piu' qui: e' passato alla
// `SectionBar` come `conteggio`. Era duplicato — lo stesso numero compariva
// nella barra e nella paginazione in fondo — e un dato ripetuto in due punti
// della stessa card fa dubitare che siano lo stesso dato.
//
// Ordine deliberato da sinistra a destra: prima cosa si cerca (campo largo),
// poi i filtri che restringono. La pillola "Priorità" resta `primary` perche'
// e' il filtro che si usa di piu' — gli urgenti.
export default function FiltersBar({ filters, moduli, onChange }: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-crema-bordo px-5 py-3">
      <div className="relative min-w-[10rem] flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
        <input
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="Cerca cliente, numero, modulo…"
          className="w-full rounded-full border border-crema-contorno bg-white py-1.5 pl-9 pr-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
        />
      </div>

      <PillSelect
        variant="primary"
        ariaLabel="Filtra per priorità"
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
        ariaLabel="Filtra per stato"
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
        ariaLabel="Filtra per modulo"
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
  );
}
