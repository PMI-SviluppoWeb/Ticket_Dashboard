import Link from "next/link";
import type { ProgettoDashboard } from "@/lib/types";
import {
  RIEMPIMENTO_CARD,
  TRACCIA_CARD,
  percentualeCompletamento,
} from "@/lib/progetto-card";
import { ProgettoStatusBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import { FolderIcon } from "@/components/icons";

interface BloccoProgettiAttiviProps {
  progetti: ProgettoDashboard[];
  caricamento: boolean;
}

const GIORNI_IN_EVIDENZA = 14;

// Striscia orizzontale, non uno dei tre blocchi alti: qui si guarda "su cosa
// stiamo lavorando e a che punto siamo", un dato per progetto, non una lista
// da scorrere. Massimo sei progetti (li limita il server), quindi due righe su
// desktop e niente scroll.
export default function BloccoProgettiAttivi({
  progetti,
  caricamento,
}: BloccoProgettiAttiviProps) {
  return (
    <section className="mt-4 overflow-hidden rounded-card border border-crema-contorno bg-white">
      <SectionBar
        titolo="Progetti attivi"
        icona={FolderIcon}
        conteggio={caricamento ? undefined : progetti.length}
      />

      {caricamento ? (
        <Scheletro />
      ) : progetti.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-caldo-testo">
          Nessun progetto in corso.
        </p>
      ) : (
        /* Filetti come bordi delle card, non `gap-px` su un fondo colorato:
           con meno di sei progetti l'ultima riga resta incompleta, e con la
           tecnica del fondo i posti vuoti sarebbero celle grigie visibili.
           Le due classi negative sporgono l'ultimo bordo destro/inferiore
           oltre la sezione, che ha `overflow-hidden` e lo taglia. */
        <div className="-mb-px -mr-px grid bg-white md:grid-cols-2 xl:grid-cols-3">
          {progetti.map((p) => (
            <CardProgetto key={p.id} progetto={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardProgetto({ progetto }: { progetto: ProgettoDashboard }) {
  const totali = progetto.num_attivita;
  const completate = progetto.num_attivita_completate;
  const percentuale = percentualeCompletamento(totali, completate);
  const consegna = etichettaConsegna(progetto.data_fine);

  return (
    <Link
      href={`/progetti/${progetto.id}`}
      className="group flex flex-col gap-2.5 border-b border-r border-crema-bordo bg-white px-5 py-4 transition-colors duration-200 hover:bg-crema-scuro"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
            {progetto.codice}
          </p>
          <p className="mt-0.5 truncate font-display text-sm font-semibold text-inchiostro">
            {progetto.nome}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-caldo-testo">
            {progetto.cliente_ragione_sociale}
          </p>
        </div>
        <ProgettoStatusBadge stato={progetto.stato} />
      </div>

      {/* La barra e' l'unico elemento grafico della card: prima delle cifre,
          perche' il colpo d'occhio deve arrivare prima della lettura. */}
      <div>
        <div
          className={`h-1.5 w-full overflow-hidden rounded-full ${TRACCIA_CARD}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentuale ?? 0}
          aria-label={`Avanzamento di ${progetto.nome}`}
        >
          <div
            className={`h-full rounded-full ${RIEMPIMENTO_CARD}`}
            style={{ width: `${percentuale ?? 0}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="tabular text-[11px] text-caldo-testo">
            {/* Nessuna attivita' non e' "0% fatto": la percentuale si omette. */}
            {percentuale === null
              ? "Nessuna task"
              : `${completate}/${totali} task`}
            {progetto.num_ticket > 0 && ` · ${progetto.num_ticket} ticket`}
          </span>
          <span
            className={`shrink-0 text-[11px] ${
              consegna.urgente
                ? "font-semibold text-stato-urgenza-testo"
                : "text-caldo-testo"
            }`}
          >
            {consegna.testo}
          </span>
        </div>
      </div>
    </Link>
  );
}

// "consegna 12 nov", e in urgenza quando mancano due settimane: e' il margine
// in cui un progetto si puo' ancora raddrizzare. La data e' naive (ora di
// Roma), quindi si confronta con l'ora locale del browser e non con UTC.
function etichettaConsegna(
  dataFine: string | null
): { testo: string; urgente: boolean } {
  if (!dataFine) return { testo: "senza scadenza", urgente: false };
  const d = new Date(dataFine);
  if (!Number.isFinite(d.getTime())) {
    return { testo: "senza scadenza", urgente: false };
  }
  const oggi = new Date();
  const giorni = Math.ceil(
    (d.getTime() - oggi.getTime()) / (24 * 60 * 60 * 1000)
  );
  const testo = `consegna ${d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  })}`;
  return { testo, urgente: giorni <= GIORNI_IN_EVIDENZA };
}

function Scheletro() {
  return (
    <div className="grid animate-pulse gap-px bg-crema-bordo md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2.5 bg-white px-5 py-4">
          <div className="h-2 w-12 rounded-full bg-crema-scuro" />
          <div className="h-3 w-2/3 rounded-full bg-crema-scuro" />
          <div className="h-1.5 w-full rounded-full bg-crema-scuro" />
        </div>
      ))}
    </div>
  );
}
