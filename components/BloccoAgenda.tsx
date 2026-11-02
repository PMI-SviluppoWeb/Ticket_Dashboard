import Link from "next/link";
import type { EventoAgendaDashboard } from "@/lib/types";
import {
  etichettaGiorno,
  etichettaOrigine,
  formatOra,
  giorniOrdinati,
  raggruppaPerGiorno,
} from "@/lib/calendario";
import { AttivitaStatusBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import { CalendarIcon } from "@/components/icons";

interface BloccoAgendaProps {
  eventi: EventoAgendaDashboard[];
  caricamento: boolean;
  className?: string;
}

// Agenda compatta: oggi intero + i prossimi sette giorni.
//
// Non duplica il calendario: mostra solo gli eventi con scadenza (la stessa
// regola di `listEventiCalendario`) e riusa `raggruppaPerGiorno`/`etichettaGiorno`
// per non avere una seconda idea di "giorno" nell'app.
//
// L'altezza e' fissa e lo scorrimento e' interno: la sintesi non deve spingere
// la tabella ticket fuori dallo schermo.
export default function BloccoAgenda({
  eventi,
  caricamento,
  className = "",
}: BloccoAgendaProps) {
  const perGiorno = raggruppaPerGiorno(eventi);
  const giorni = giorniOrdinati(perGiorno);

  return (
    <section
      className={`flex h-[320px] min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white ${className}`}
    >
      <SectionBar
        titolo="Agenda"
        icona={CalendarIcon}
        conteggio={caricamento ? undefined : eventi.length}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {caricamento ? (
          <Scheletro />
        ) : giorni.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-caldo-testo">
            Nessun evento nei prossimi 7 giorni.
          </p>
        ) : (
          giorni.map((giorno) => (
            <div key={giorno}>
              {/* Intestazione di giorno appiccicata in alto: scorrendo una
                  settimana piena si continua a sapere che giorno si sta
                  guardando. */}
              <p className="sticky top-0 z-10 border-b border-crema-bordo bg-white/95 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo backdrop-blur">
                {etichettaGiorno(giorno)}
              </p>
              <div className="divide-y divide-crema-bordo">
                {perGiorno.get(giorno)?.map((e) => (
                  <RigaEvento key={e.id} evento={e} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RigaEvento({ evento }: { evento: EventoAgendaDashboard }) {
  const href = evento.progetto_id
    ? `/progetti/${evento.progetto_id}`
    : "/calendario";

  return (
    <Link
      href={href}
      className="flex items-start gap-3 px-5 py-2.5 transition-colors duration-200 hover:bg-crema-scuro"
    >
      <span
        className={`tabular w-10 shrink-0 pt-0.5 text-xs ${
          evento.in_ritardo
            ? "font-semibold text-stato-urgenza-testo"
            : "text-caldo-testo"
        }`}
      >
        {formatOra(evento.data_scadenza)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-inchiostro">
          {evento.titolo}
        </p>
        <p className="truncate text-[11px] text-caldo-testo">
          {etichettaOrigine(evento)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {/* Etichette personalizzate: pallini colore accanto allo stato. */}
        {(evento.etichette ?? []).map((et) => (
          <span
            key={et.id}
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: et.colore }}
            title={et.nome}
            aria-label={`Etichetta ${et.nome}`}
          />
        ))}
        {/* Il pallino lime e' l'unico segno "mio" nella lista: stesso
            significato dell'avatar lime nelle board (ProgettoTaskBoard). */}
        {evento.mia && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-lime ring-2 ring-lime/30"
            title="Assegnata a te"
            aria-label="Assegnata a te"
          />
        )}
        <AttivitaStatusBadge stato={evento.stato} />
      </div>
    </Link>
  );
}

function Scheletro() {
  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <div className="h-2.5 w-8 rounded-full bg-crema-scuro" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 rounded-full bg-crema-scuro" />
            <div className="h-2 w-1/3 rounded-full bg-crema-scuro" />
          </div>
          <div className="h-5 w-16 rounded-full bg-crema-scuro" />
        </div>
      ))}
    </div>
  );
}
