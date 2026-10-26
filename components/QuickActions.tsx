import Link from "next/link";
import {
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FlameIcon,
  RefreshIcon,
  RotateCcwIcon,
  UserIcon,
} from "@/components/icons";

interface QuickActionsProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
  onFilterUrgenti: () => void;
  onFilterChiusi?: () => void;
  onResetFilters: () => void;
  currentOperator?: string;
}

export default function QuickActions({
  lastUpdate,
  onRefresh,
  onFilterUrgenti,
  onFilterChiusi,
  onResetFilters,
  currentOperator = "",
}: QuickActionsProps) {
  // Icona SVG, non un carattere "✓": un glifo di testo non ha lo stesso peso
  // ottico delle altre icone, non eredita stroke e colore come loro, e su
  // alcuni sistemi viene reso come emoji a colori.
  const actions = [
    { label: "Aggiorna dati", icon: RefreshIcon, onClick: onRefresh },
    { label: "Ticket urgenti", icon: FlameIcon, onClick: onFilterUrgenti },
    { label: "Ticket chiusi", icon: CheckCircleIcon, onClick: onFilterChiusi },
    { label: "Reset filtri", icon: RotateCcwIcon, onClick: onResetFilters },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-panel border border-crema-contorno bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-inchiostro">Azioni Rapide</h3>
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-control border border-crema-contorno px-3 py-2.5 text-left text-sm font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-crema-scuro text-caldo-testo transition-colors duration-200 group-hover:bg-inchiostro group-hover:text-white">
                <a.icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">{a.label}</span>
              {/* La freccia si muove al passaggio: e' l'unico movimento della
                  card, e indica che la riga e' cliccabile. */}
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-caldo-testo/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-inchiostro" />
            </button>
          ))}
          <Link
            href="/knowledge"
            className="group flex w-full items-center gap-3 rounded-control border border-crema-contorno px-3 py-2.5 text-left text-sm font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-crema-scuro text-caldo-testo transition-colors duration-200 group-hover:bg-inchiostro group-hover:text-white">
              <BookIcon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">Knowledge Base</span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-caldo-testo/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-inchiostro" />
          </Link>
        </div>
      </div>

      <div className="rounded-panel border border-crema-contorno bg-white p-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
          Stato del Sistema
        </h3>
        <p className="flex items-center gap-2 text-sm font-medium text-inchiostro">
          {/* Il puntino verde non pulsa piu'. `animate-pulse` su un elemento
              permanente e' rumore: attira l'occhio in continuazione su
              un'informazione che non cambia 30 volte al minuto. */}
          <span className="h-2 w-2 shrink-0 rounded-full bg-stato-ok-testo" aria-hidden="true" />
          Tutti i sistemi operativi
        </p>
        <p className="mt-1.5 text-xs text-caldo-testo">
          Aggiornamento automatico ogni 30s
          {lastUpdate
            ? ` · ultimo controllo ${lastUpdate.toLocaleTimeString("it-IT")}`
            : ""}
        </p>
        {currentOperator && (
          <div className="mt-3 border-t border-crema-bordo pt-3">
            <p className="flex items-center gap-2 text-xs text-caldo-testo">
              <UserIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Operatore: {currentOperator}</span>
            </p>
            <p className="mt-1 text-xs text-caldo-testo/80">
              I tuoi ticket sono filtrati automaticamente
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
