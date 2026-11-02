"use client";

import { useSecondi, useTempiStato } from "@/components/TempiContext";
import type { TempoDashboard, VoceApertaDashboard } from "@/lib/types";
import { formatCronometro, formatDurata, formatDurataZero } from "@/lib/durata";
import { formatOra } from "@/lib/calendario";
import { iniziali } from "@/lib/task-local";
import SectionBar from "@/components/SectionBar";
import { TimerIcon } from "@/components/icons";

interface BloccoTempoProps {
  // { mio, tutti } oppure null al primo caricamento.
  tempo: { mio: TempoDashboard; tutti: TempoDashboard } | null;
  // null = utente non admin: la sezione "Adesso al lavoro" non esiste proprio.
  // [] = admin senza cronometri attivi.
  inCorsoOra: VoceApertaDashboard[] | null;
  caricamento: boolean;
  className?: string;
}

// "Ore oggi" e' la prima domanda che uno si fa sulla giornata, quindi e' la
// cifra grande. Il team e la settimana stanno sotto, in piccolo: sono contesto,
// non obiettivo. Il numero del server NON contiene la voce aperta (somma solo
// `fine IS NOT NULL`); quella la aggiunge `CronometroOggi`, che e' un componente
// foglia: il tick da un secondo ridisegna solo il suo `<span>`.
export default function BloccoTempo({
  tempo,
  inCorsoOra,
  caricamento,
  className = "",
}: BloccoTempoProps) {
  return (
    <section
      className={`flex h-[320px] min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white ${className}`}
    >
      <SectionBar titolo="Tempo" icona={TimerIcon} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {caricamento ? (
          <Scheletro />
        ) : !tempo ? (
          // Richiesta fallita (il banner in pagina dice perche'): non si resta
          // in scheletro, che sembrerebbe un caricamento ancora in corso.
          <p className="px-5 py-10 text-center text-sm text-caldo-testo">
            Tempo non disponibile.
          </p>
        ) : (
          <>
            <div className="px-5 pb-4 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
                Oggi
              </p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="tabular font-display text-4xl font-medium leading-none tracking-tight text-inchiostro">
                  {formatDurataZero(tempo.mio.minuti_oggi)}
                </span>
                {/* Il "+" e il numero che scorre compaiono da soli quando c'e'
                    una voce aperta: il genitore non si iscrive al tick. */}
                <CronometroOggi />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px border-t border-crema-bordo bg-crema-bordo">
              <Misura
                label="Questa settimana"
                valore={formatDurataZero(tempo.mio.minuti_settimana)}
              />
              <Misura
                label="Oggi team"
                valore={formatDurataZero(tempo.tutti.minuti_oggi)}
              />
            </dl>

            {inCorsoOra && (
              <div className="border-t border-crema-bordo">
                <p className="px-5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
                  Adesso al lavoro
                </p>
                {inCorsoOra.length === 0 ? (
                  <p className="px-5 pb-4 text-[11px] text-caldo-testo">
                    Nessun cronometro attivo.
                  </p>
                ) : (
                  <ul className="pb-2">
                    {inCorsoOra.map((v) => (
                      <li
                        key={v.operatore_id}
                        className="flex items-center gap-2.5 px-5 py-1.5"
                      >
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-crema-scuro text-[9px] font-semibold uppercase text-caldo-testo"
                          aria-hidden="true"
                        >
                          {iniziali(v.operatore)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-inchiostro">
                            {v.operatore}
                          </p>
                          <p className="truncate text-[10px] text-caldo-testo">
                            dalle {formatOra(v.inizio)}
                            {v.bersaglio ? ` · ${v.bersaglio}` : ""}
                          </p>
                        </div>
                        <span className="tabular shrink-0 text-[11px] font-semibold text-avanzamento">
                          {formatDurata(v.minuti_finora)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Misura({ label, valore }: { label: string; valore: string }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
        {label}
      </dt>
      <dd className="tabular mt-1 font-display text-lg font-medium leading-none text-inchiostro">
        {valore}
      </dd>
    </div>
  );
}

// Solo la parte di voce che cade DENTRO oggi. Una voce aperta ieri sera alle
// 22:00 e ancora in corsa stamattina deve aggiungere alle ore di oggi solo il
// tempo dopo mezzanotte, altrimenti il totale sballa proprio nel caso che il
// numero fisso del server non copre.
function CronometroOggi() {
  const secondi = useSecondi();
  const { aperta } = useTempiStato();
  if (!aperta) return null;

  const inizio = new Date(aperta.inizio).getTime();
  const mezzanotte = new Date();
  mezzanotte.setHours(0, 0, 0, 0);
  if (!Number.isFinite(inizio)) return null;

  const primaDiOggi = Math.max(
    0,
    Math.floor((mezzanotte.getTime() - inizio) / 1000)
  );

  return (
    <span className="tabular text-sm font-semibold text-avanzamento">
      + {formatCronometro(Math.max(0, secondi - primaDiOggi))}
    </span>
  );
}

function Scheletro() {
  return (
    <div className="animate-pulse px-5 py-4">
      <div className="h-2 w-10 rounded-full bg-crema-scuro" />
      <div className="mt-3 h-8 w-24 rounded-control bg-crema-scuro" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="h-10 rounded-control bg-crema-scuro" />
        <div className="h-10 rounded-control bg-crema-scuro" />
      </div>
    </div>
  );
}
