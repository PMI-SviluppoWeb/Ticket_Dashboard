"use client";

import { useEffect, useRef, useState } from "react";
import { useTempi } from "@/components/TempiContext";
import { ChevronDownIcon, ClockIcon, TimerIcon, XIcon } from "@/components/icons";
import { formatCronometro, formatDurata, ORE_AVVISO_TIMER, timerDimenticato } from "@/lib/durata";
import type { VoceTempoEstesa } from "@/lib/types";

// ===========================================================================
// Cronometro globale.
//
// Vive nell'header di ogni pagina e parla con lo stato condiviso (TempiContext):
// qui si vede sempre cosa sta correndo, su cosa, e da quanto. Fermo, si riduce a
// una pillola che dice solo la verita' — "Nessun timer" — invece di occupare
// spazio per un controllo che non serve.
//
// Tre stati, tre aspetti:
//   fermo      -> pillola discreta, apre il pannello dove scegliere il bersaglio
//   in corso   -> cifra grande a cifre fisse, "Ferma" sempre a portata di mano
//   dimenticato-> oltre ORE_AVVISO_TIMER il bordo diventa d'avviso: il numero
//                 di ore non e' credibile e va guardato prima che finisca nei totali
//
// Il pannello e' un popover ancorato, non un modal: avviare un timer non deve
// togliere la pagina da sotto gli occhi.
// ===========================================================================

interface CronometroHeaderProps {
  // Sopra la barra nera (pagine con AppHeader) la palette e' quella del fondo
  // scuro; sulle pagine con header chiaro serve l'inverso. Un solo componente
  // per non avere due cronometri che divergono.
  tema?: "scuro" | "chiaro";
  // Bersaglio suggerito dal contesto in cui si trova l'utente: sulla pagina di
  // un progetto il pulsante propone "questo progetto" invece di chiedere di
  // pescarlo da un elenco. E' un suggerimento, non un vincolo.
  bersaglio?: { attivita_id?: string; ticket_id?: string; etichetta: string } | null;
}

export default function CronometroHeader({ tema = "scuro", bersaglio = null }: CronometroHeaderProps) {
  const { aperta, voci, secondi, avvia, ferma, elimina, caricamento, errore } = useTempi();
  const [aperto, setAperto] = useState(false);
  const [descrizione, setDescrizione] = useState("");
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);
  const pannello = useRef<HTMLDivElement>(null);

  const scuro = tema === "scuro";
  const dimenticato = aperta ? timerDimenticato(aperta) : false;

  // Chiusura su click fuori. Solo il click sinistro: un click destro sul
  // pannello non deve farlo sparire mentre si apre un menu contestuale.
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (pannello.current && !pannello.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, [aperto]);

  // Esc chiude il pannello, come ogni popover. La voce aperta continua: Esc
  // chiude l'elenco, non ferma il lavoro.
  useEffect(() => {
    if (!aperto) return;
    const tastiera = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperto(false);
    };
    document.addEventListener("keydown", tastiera);
    return () => document.removeEventListener("keydown", tastiera);
  }, [aperto]);

  const etichetta = aperta
    ? aperta.bersaglio ?? "Tempo generico"
    : "Nessun timer in corso";

  // Le ultime voci chiuse, per riavere in un clic il bersaglio di prima.
  // Si esclude quella in corso e si tengono le ultime 5: un elenco lungo in un
  // popover si legge male.
  const recenti = voci.filter((v) => v.id !== aperta?.id).slice(0, 5);

  // Riparte sul bersaglio di una voce chiusa. Una voce agganciata a una task
  // o a un ticket che non esiste piu' (bersaglio NULL) non si puo' riprendere:
  // il server rifiuterebbe l'id. In quel caso resta solo l'eliminazione.
  const riprendi = (v: VoceTempoEstesa) => {
    if (v.attivita_id) {
      setAperto(false);
      avvia({ attivita_id: v.attivita_id, descrizione: v.descrizione ?? undefined });
    } else if (v.ticket_id) {
      setAperto(false);
      avvia({ ticket_id: v.ticket_id, descrizione: v.descrizione ?? undefined });
    } else {
      setAperto(false);
      avvia({ descrizione: v.descrizione ?? undefined });
    }
  };

  return (
    <div ref={pannello} className="relative shrink-0">
      <div
        className={`flex items-center gap-1 rounded-full py-1 pl-3 pr-1 transition ${
          aperta
            ? dimenticato
              ? "bg-stato-attesa-bg text-stato-attesa-testo ring-1 ring-stato-attesa-bordo"
              : scuro
                ? "bg-lime text-lime-testo"
                : "bg-inchiostro text-white"
            : scuro
              ? "bg-white/10 text-white/80 hover:bg-white/15"
              : "bg-white text-caldo-testo ring-1 ring-crema-contorno hover:text-inchiostro"
        }`}
      >
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          aria-expanded={aperto}
          aria-haspopup="dialog"
          title={aperta ? `In corso: ${etichetta}` : "Avvia un timer"}
          className="flex min-w-0 items-center gap-1.5 rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
        >
          <TimerIcon className="h-3.5 w-3.5 shrink-0" />
          {aperta ? (
            <span className="tabular text-[13px] font-semibold tracking-tight">
              {formatCronometro(secondi)}
            </span>
          ) : (
            <span className="hidden sm:inline">Timer</span>
          )}
        </button>

        {aperta && (
          <button
            type="button"
            onClick={ferma}
            disabled={caricamento}
            className={`ml-1 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
              dimenticato
                ? "bg-stato-attesa-testo text-white hover:opacity-90"
                : scuro
                  ? "bg-lime-testo text-lime hover:opacity-90"
                  : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            Ferma
          </button>
        )}

        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          aria-label="Apri il pannello del timer"
          className={`ml-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${
            scuro && !aperta ? "hover:bg-white/15" : scuro ? "hover:bg-black/10" : "hover:bg-crema-scuro"
          }`}
        >
          <ChevronDownIcon
            className={`h-3 w-3 opacity-70 transition-transform ${aperto ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {aperto && (
        <div
          role="dialog"
          aria-label="Cronometro"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-panel border border-crema-contorno bg-white text-inchiostro shadow-soft"
        >
          {/* Cosa sta correndo, in chiaro. Fuori dalla pillola il bersaglio non
              ci sta: qui e' la prima riga, perche' "su cosa sto lavorando" e'
              la domanda a cui il cronometro risponde. */}
          <div className="border-b border-crema-bordo px-4 pb-3 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                {aperta ? "In corso" : "Cronometro"}
              </span>
              {aperta && (
                <span className="tabular text-sm font-semibold text-inchiostro">
                  {formatCronometro(secondi)}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-inchiostro">{etichetta}</p>
            {dimenticato && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-control bg-stato-attesa-bg px-2.5 py-1.5 text-[11px] font-medium leading-snug text-stato-attesa-testo">
                <ClockIcon className="mt-0.5 h-3 w-3 shrink-0" />
                Aperto da piu&apos; di {ORE_AVVISO_TIMER} ore: forse e&apos; rimasto acceso. Fermalo
                e, se non e&apos; tempo reale, eliminalo dall&apos;elenco.
              </p>
            )}
          </div>

          {/* Avvio su un bersaglio dal contesto. */}
          {bersaglio && !(aperta && (bersaglio.attivita_id === aperta.attivita_id && bersaglio.ticket_id === aperta.ticket_id)) && (
            <div className="border-b border-crema-bordo px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setAperto(false);
                  avvia(bersaglio);
                }}
                disabled={caricamento}
                className="flex w-full items-center gap-2 rounded-control bg-crema-scuro px-3 py-2 text-left text-xs font-medium text-inchiostro transition hover:bg-crema-contorno disabled:opacity-50"
              >
                <TimerIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  Avvia su <span className="font-semibold">{bersaglio.etichetta}</span>
                </span>
              </button>
            </div>
          )}

          {/* Tempo generico: il caso che non ha un bersaglio — riunione,
              telefonata, lavoro di preparazione. */}
          <div className="border-b border-crema-bordo px-4 py-3">
            <label htmlFor="timer-descrizione" className="text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Tempo generico
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="timer-descrizione"
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !caricamento) {
                    e.preventDefault();
                    setAperto(false);
                    avvia({ descrizione: descrizione.trim() || undefined });
                    setDescrizione("");
                  }
                }}
                placeholder="Su cosa stai lavorando?"
                className="h-8 min-w-0 flex-1 rounded-control border border-crema-contorno bg-white px-2.5 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
              <button
                type="button"
                onClick={() => {
                  setAperto(false);
                  avvia({ descrizione: descrizione.trim() || undefined });
                  setDescrizione("");
                }}
                disabled={caricamento}
                className="shrink-0 rounded-control bg-inchiostro px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-inchiostro-profondo disabled:opacity-40"
              >
                Avvia
              </button>
            </div>
          </div>

          {errore && (
            <p className="border-b border-crema-bordo bg-stato-urgenza-bg px-4 py-2 text-[11px] font-medium text-stato-urgenza-testo">
              {errore}
            </p>
          )}

          {/* Ultime voci: riprendere il filo senza ricercare il bersaglio, e
              correggere un timer dimenticato eliminandolo. */}
          <div className="max-h-56 overflow-y-auto">
            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Ultime voci
            </p>
            {recenti.length === 0 ? (
              <p className="px-4 pb-3.5 pt-1 text-xs text-caldo-testo">
                Ancora nessun tempo registrato.
              </p>
            ) : (
              <ul className="pb-2">
                {recenti.map((v) => (
                  <li key={v.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-crema-scuro/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-inchiostro">
                        {v.bersaglio ?? v.descrizione ?? "Tempo generico"}
                      </span>
                      <span className="block text-[10px] text-caldo-testo">
                        {formatDurata(Math.max(0, Math.round(
                          (new Date(v.fine ?? Date.now()).getTime() - new Date(v.inizio).getTime()) / 60000
                        )))}
                      </span>
                    </span>
                    {/* Riprende sullo stesso bersaglio: nello stesso elenco si
                        riparte su cio' che si e' appena fatto, che e' il caso
                        piu' frequente quando si torna su una task. */}
                    {!aperta && (v.attivita_id || v.ticket_id || !v.bersaglio) && (
                      <button
                        type="button"
                        onClick={() => riprendi(v)}
                        disabled={caricamento}
                        aria-label="Riprendi su questo elemento"
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-caldo-testo opacity-0 transition hover:bg-crema-contorno hover:text-inchiostro focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100"
                      >
                        Riprendi
                      </button>
                    )}
                    {confermaElimina === v.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setConfermaElimina(null);
                            elimina(v.id);
                          }}
                          className="shrink-0 rounded-full bg-pericolo px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-pericolo-scuro"
                        >
                          Elimina
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfermaElimina(null)}
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-caldo-testo hover:bg-crema-scuro"
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfermaElimina(v.id)}
                        aria-label="Elimina questa voce di tempo"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-caldo-testo opacity-0 transition hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
