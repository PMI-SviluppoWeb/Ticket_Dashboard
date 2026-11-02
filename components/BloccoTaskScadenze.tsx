import Link from "next/link";
import type { TaskScadenzaDashboard } from "@/lib/types";
import { chiaveGiorno } from "@/lib/calendario";
import { PriorityBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import { ListChecksIcon } from "@/components/icons";

interface BloccoTaskScadenzeProps {
  task: TaskScadenzaDashboard[];
  caricamento: boolean;
  className?: string;
}

// Le MIE task non completate con scadenza entro sette giorni, piu' quelle gia'
// scadute (che il server include nello stesso intervallo e marca in_ritardo).
//
// Il filtro per assegnatario e' nel server: qui non si conosce il nome
// dell'operatore e non serve. La riga porta al progetto, non alla task: la
// board del progetto e' il posto dove la task si sposta e si completa.
export default function BloccoTaskScadenze({
  task,
  caricamento,
  className = "",
}: BloccoTaskScadenzeProps) {
  return (
    <section
      className={`flex h-[320px] min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white ${className}`}
    >
      <SectionBar
        titolo="Le mie task"
        icona={ListChecksIcon}
        conteggio={caricamento ? undefined : task.length}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {caricamento ? (
          <Scheletro />
        ) : task.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-caldo-testo">
            Nessuna task in scadenza.
          </p>
        ) : (
          <div className="divide-y divide-crema-bordo">
            {task.map((t) => (
              <RigaTask key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RigaTask({ task }: { task: TaskScadenzaDashboard }) {
  const contesto =
    task.progetto_codice && task.progetto_nome
      ? `${task.progetto_codice} · ${task.progetto_nome}`
      : task.progetto_nome ??
        task.cliente_ragione_sociale ??
        "Senza progetto";
  const scadenza = etichettaScadenza(task.data_scadenza, task.in_ritardo);

  return (
    <Link
      href={task.progetto_id ? `/progetti/${task.progetto_id}` : "/progetti"}
      className="flex items-start gap-3 px-5 py-2.5 transition-colors duration-200 hover:bg-crema-scuro"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-inchiostro">{task.titolo}</p>
        <p className="truncate text-[11px] text-caldo-testo">{contesto}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`tabular text-[11px] ${scadenza.classe}`}>
          {scadenza.testo}
        </span>
        <PriorityBadge priorita={task.priorita} />
      </div>
    </Link>
  );
}

// "In ritardo" invece della data: e' l'informazione che cambia il comporta-
// mento, e la data di una cosa gia' scaduta non aggiunge niente. Per oggi e
// domani la parola basta; per il resto, giorno e mese in forma breve.
function etichettaScadenza(
  data: string,
  inRitardo: boolean
): { testo: string; classe: string } {
  if (inRitardo) {
    return { testo: "In ritardo", classe: "font-semibold text-stato-urgenza-testo" };
  }
  const d = new Date(data);
  if (!Number.isFinite(d.getTime())) {
    return { testo: data, classe: "text-caldo-testo" };
  }
  const oggi = new Date();
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);
  const chiave = chiaveGiorno(d);
  if (chiave === chiaveGiorno(oggi)) {
    return { testo: "Oggi", classe: "font-semibold text-inchiostro" };
  }
  if (chiave === chiaveGiorno(domani)) {
    return { testo: "Domani", classe: "font-medium text-inchiostro" };
  }
  return {
    testo: d.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    classe: "text-caldo-testo",
  };
}

function Scheletro() {
  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-3/4 rounded-full bg-crema-scuro" />
            <div className="h-2 w-1/2 rounded-full bg-crema-scuro" />
          </div>
          <div className="h-5 w-14 rounded-full bg-crema-scuro" />
        </div>
      ))}
    </div>
  );
}
