import type { Stats } from "@/lib/types";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  HourglassIcon,
} from "@/components/icons";

interface StatsCardsProps {
  stats: Stats;
}

// Statistiche della dashboard — una sola superficie tinta, due cifre nude.
//
// Prima erano TRE card tinte identiche (peach, bianco, salvia): tre superfici
// dello stesso peso visivo per tre metriche che NON hanno lo stesso peso. Con
// tutto colorato, il colore smetteva di segnalare qualcosa — l'occhio non
// aveva modo di sapere dove guardare per primo.
//
// Ora la gerarchia e' dichiarata dall'anatomia, non dalla tinta:
//
//   Ticket Aperti   superficie peach + pastiglia icona  -> la metrica che pesa
//   In Lavorazione  nessuna superficie, filetto a sinistra
//   Risolti         nessuna superficie, filetto a sinistra
//
// Il filetto (`sm:border-l`) al posto di un'altra card e' la mossa
// editoriale: separa senza incorniciare, quindi le due cifre nude restano
// leggibili come parte della stessa riga di misure invece che come due
// riquadri vuoti. Il colore adesso segnala UNA cosa sola: cio' che richiede
// attenzione.
//
// `tabular` sui numeri non e' un dettaglio: senza cifre a larghezza fissa il
// valore balla a ogni aggiornamento (la dashboard si ricarica ogni 30s) e la
// riga sembra muoversi da sola.
export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-3">
      {/* La metrica d'accento. */}
      <div className="rounded-panel bg-peach p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
            Ticket Aperti
          </p>
          {/* Pastiglia icona circolare: e' il segno che nel mockup chiude in
              alto a destra ogni superficie. Su fondo tinto va in inchiostro
              pieno, altrimenti l'icona si perde nella tinta. */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-inchiostro text-white">
            <AlertTriangleIcon className="h-3.5 w-3.5" />
          </span>
        </div>

        <p className="tabular mt-3 font-display text-5xl font-medium leading-none tracking-tight text-inchiostro">
          {stats.aperti}
        </p>

        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-caldo-testo">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-inchiostro/30"
            aria-hidden="true"
          />
          {stats.nuovi} nuovi
        </p>
      </div>

      {/* Le due cifre nude. Stessa taglia di numero della metrica d'accento,
          cosi' i tre valori restano confrontabili: a distinguerli e' la
          superficie, non la dimensione del carattere. */}
      <CifraNuda
        icona={HourglassIcon}
        label="In Lavorazione"
        valore={stats.inCorso}
        nota="Monitorati"
      />
      <CifraNuda
        icona={CheckCircleIcon}
        label="Risolti"
        valore={stats.risolti}
        nota={`${stats.chiusi} chiusi`}
      />
    </div>
  );
}

interface CifraNudaProps {
  icona: (props: { className?: string }) => JSX.Element;
  label: string;
  valore: number;
  nota: string;
}

// Blocco senza superficie: etichetta piccola, numero grande, nota col puntino.
// Replica l'anatomia della tile d'accento (stesse tre righe, stessa spaziatura)
// perche' le tre misure si leggano come una serie; a cambiare e' solo
// l'assenza di fondo e di pastiglia.
//
// Il `py-5` NON e' decorativo: senza, la tile (che ha `p-5`) comincia 20px
// piu' in basso di questi blocchi e le tre etichette finiscono su baseline
// diverse — si vede subito e sembra un errore di stampa. Qui serve pareggiare
// il ritmo interno, non disegnare un bordo.
//
// Il filetto a sinistra compare solo da `sm` in su: sotto il breakpoint i
// blocchi sono impilati e un filetto verticale su una riga sola sarebbe un
// segno senza significato.
function CifraNuda({ icona: Icona, label, valore, nota }: CifraNudaProps) {
  return (
    <div className="py-5 sm:border-l sm:border-crema-bordo sm:pl-6">
      {/* Niente pastiglia: l'icona sta in linea con l'etichetta, in tinta
          tenue, come una nota a margine. Una seconda pastiglia in inchiostro
          pieno avrebbe dato a questi blocchi lo stesso peso dell'accento. */}
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
        <Icona className="h-3.5 w-3.5 shrink-0" />
        {label}
      </p>

      <p className="tabular mt-3 font-display text-5xl font-medium leading-none tracking-tight text-inchiostro">
        {valore}
      </p>

      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-caldo-testo">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-inchiostro/30"
          aria-hidden="true"
        />
        {nota}
      </p>
    </div>
  );
}
