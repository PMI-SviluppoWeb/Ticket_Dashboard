import type { DashboardSintesi } from "@/lib/types";
import { formatDurataZero } from "@/lib/durata";

interface BarraSintesiProps {
  sintesi: DashboardSintesi | null;
  // ISO: mostrato come "aggiornato alle HH:mm". Dice che il numero non e' un
  // fotogramma fermo, senza aggiungere un secondo orologio alla pagina.
  generatoIl: string | null;
  // Distingue "sto ancora caricando" da "la richiesta e' fallita": nel secondo
  // caso le celle mostrano un trattino invece di pulsare per sempre.
  caricamento: boolean;
}

// La fascia delle misure: sei celle in UNA superficie.
//
// Prima c'erano tre card tinte (StatsCards) per tre metriche di ticket. Ora le
// metriche sono sei e vengono da domini diversi: sei card sarebbero state un
// muro. Una sola superficie divisa da filetti tiene la fascia a ~100px e
// lascia il posto alla tabella ticket, che sta sotto.
//
// "Prima io, poi il team" e' dichiarato dalla TINTA, non dalla posizione: solo
// le due celle personali hanno un fondo (peach, l'accento del sistema; attesa
// quando c'e' qualcosa in ritardo). Le altre sono cifre nude separate dal
// filetto, come le `CifraNuda` di StatsCards.
export default function BarraSintesi({
  sintesi,
  generatoIl,
  caricamento,
}: BarraSintesiProps) {
  const aggiornato = generatoIl
    ? new Date(generatoIl).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section
      aria-label="Sintesi del workspace"
      className="overflow-hidden rounded-card border border-crema-contorno"
    >
      <div className="flex items-center justify-between gap-3 bg-white px-5 pt-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
          Sintesi
        </h2>
        <p className="tabular text-[11px] text-caldo-testo">
          {aggiornato ? `aggiornato alle ${aggiornato}` : " "}
        </p>
      </div>

      {/* gap-px su fondo crema-bordo = filetti da 1px che restano corretti
          anche quando la griglia va a capo (2 colonne su mobile). Con
          `divide-x` la terza cella di ogni riga avrebbe un bordo a sinistra
          che non separa niente. */}
      <div className="mt-3 grid grid-cols-2 gap-px bg-crema-bordo sm:grid-cols-3 xl:grid-cols-6">
        {sintesi ? (
          <>
            <Cella
              tinta="peach"
              label="I miei ticket"
              valore={sintesi.ticket.miei.aperti}
              nota={`${sintesi.ticket.miei.nuovi} nuovi`}
            />
            <Cella
              label="Da prendere"
              valore={sintesi.ticket.tutti.da_prendere}
              nota="non assegnati"
            />
            <Cella
              label="Ticket aperti"
              valore={sintesi.ticket.tutti.aperti}
              nota={`${sintesi.ticket.tutti.in_corso} in corso`}
            />
            <Cella
              tinta={sintesi.task_miei.in_ritardo > 0 ? "attesa" : undefined}
              label="Task in scadenza"
              valore={sintesi.task_miei.in_scadenza}
              nota={
                sintesi.task_miei.in_ritardo > 0
                  ? `${sintesi.task_miei.in_ritardo} in ritardo`
                  : "prossimi 7 giorni"
              }
            />
            <Cella
              label="Progetti attivi"
              valore={sintesi.progetti_attivi}
              nota="in corso o in pausa"
            />
            <Cella
              label="Ore oggi"
              valore={formatDurataZero(sintesi.tempo.mio.minuti_oggi)}
              nota={`team ${formatDurataZero(sintesi.tempo.tutti.minuti_oggi)}`}
            />
          </>
        ) : caricamento ? (
          // Primo caricamento: la fascia tiene l'ingombro, cosi' la pagina non
          // salta quando i numeri arrivano.
          Array.from({ length: 6 }).map((_, i) => <CellaScheletro key={i} />)
        ) : (
          // Nessun dato e nessun caricamento in corso: la richiesta e' fallita
          // (il banner in pagina lo dice). Un trattino e' piu' onesto di uno
          // zero, e non pulsa come se stesse ancora arrivando.
          Array.from({ length: 6 }).map((_, i) => (
            <Cella key={i} label={ETICHETTE[i]} valore="—" nota="non disponibile" />
          ))
        )}
      </div>
    </section>
  );
}

// Stesse etichette delle celle con i dati, nell'ordine in cui compaiono: la
// fascia non cambia forma quando la richiesta fallisce, cambia solo il valore.
const ETICHETTE = [
  "I miei ticket",
  "Da prendere",
  "Ticket aperti",
  "Task in scadenza",
  "Progetti attivi",
  "Ore oggi",
];

interface CellaProps {
  label: string;
  valore: number | string;
  nota: string;
  tinta?: "peach" | "attesa";
}

const TINTE = {
  peach: "bg-peach",
  attesa: "bg-stato-attesa-bg",
} as const;

function Cella({ label, valore, nota, tinta }: CellaProps) {
  return (
    <div className={`px-4 py-3.5 ${tinta ? TINTE[tinta] : "bg-white"}`}>
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-caldo-testo">
        {label}
      </p>
      <p className="tabular mt-2 font-display text-3xl font-medium leading-none tracking-tight text-inchiostro">
        {valore}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-tight text-caldo-testo">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-inchiostro/30"
          aria-hidden="true"
        />
        <span className="truncate">{nota}</span>
      </p>
    </div>
  );
}

function CellaScheletro() {
  return (
    <div className="animate-pulse bg-white px-4 py-3.5">
      <div className="h-2 w-16 rounded-full bg-crema-scuro" />
      <div className="mt-2.5 h-7 w-10 rounded-control bg-crema-scuro" />
      <div className="mt-2.5 h-2 w-20 rounded-full bg-crema-scuro" />
    </div>
  );
}
