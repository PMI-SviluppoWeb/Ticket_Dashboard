"use client";

import { useMemo, useState } from "react";
import type { AttivitaRow, StatoAttivita } from "@/lib/types";
import { PriorityBadge } from "@/components/badges";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ListChecksIcon,
  MessageIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { formatData } from "@/lib/calendario";
import { iniziali, nuovoId, type ExtraTask, type Sezione } from "@/lib/task-local";
import TimerBersaglio from "@/components/TimerBersaglio";

// ---------------------------------------------------------------------------
// Board delle task del progetto, divisa in SEZIONI.
//
// Una sezione e' un contenitore nominato ("Setup", "Sviluppo", "Collaudo"):
// le task si spostano da una all'altra dalla select nella riga, e le sezioni
// stesse si rinominano/eliminano dalla testata. Lo stato delle task resta
// indipendente dalla sezione: la sezione dice DOVE sta il lavoro, lo stato
// dice QUANTO e' avanti. Tenerli separati evita due assi di colore sulla
// stessa riga (la lezione del kanban progetti, dove le colonne sono lenti e
// non stati).
//
// Sezioni e spostamenti sono LOCALI (vedi lib/task-local.ts).
// ---------------------------------------------------------------------------

const FILTRI: { value: StatoAttivita | "TUTTE"; label: string }[] = [
  { value: "TUTTE", label: "Tutte" },
  { value: "DA_FARE", label: "Da fare" },
  { value: "IN_CORSO", label: "In corso" },
  { value: "COMPLETATA", label: "Completate" },
];

interface ProgettoTaskBoardProps {
  attivita: AttivitaRow[];
  operatori: { id: string; nome: string }[];
  sezioni: Sezione[];
  extra: Record<string, ExtraTask>;
  // Minuti registrati per task, gia' aggregati dal server in una sola query
  // (`GET /api/tempi?attivita_minuti=`). Passarli qui, invece di lasciare che
  // ogni riga ne chieda il totale, evita una richiesta per task: sulla board
  // di un progetto grande sarebbero decine.
  minutiPerTask?: Record<string, number>;
  selezionataId: string | null;
  confermaEliminaId: string | null;
  onSeleziona: (id: string) => void;
  onCambiaExtra: (attivitaId: string, patch: Partial<ExtraTask>) => void;
  onCambiaSezioni: (sezioni: Sezione[]) => void;
  onCreaTask: (sezioneId: string, titolo: string) => Promise<void>;
  onCompleta: (a: AttivitaRow, completata: boolean) => void;
  onElimina: (a: AttivitaRow) => void;
  onAnnullaElimina: () => void;
}

export default function ProgettoTaskBoard({
  attivita,
  operatori,
  sezioni,
  extra,
  minutiPerTask,
  selezionataId,
  confermaEliminaId,
  onSeleziona,
  onCambiaExtra,
  onCambiaSezioni,
  onCreaTask,
  onCompleta,
  onElimina,
  onAnnullaElimina,
}: ProgettoTaskBoardProps) {
  const [filtro, setFiltro] = useState<StatoAttivita | "TUTTE">("TUTTE");
  const [chiuse, setChiuse] = useState<Set<string>>(new Set());
  const [rinominaId, setRinominaId] = useState<string | null>(null);
  const [bozzaTitolo, setBozzaTitolo] = useState("");
  const [nuovaSezione, setNuovaSezione] = useState("");
  const [aggiungendoSezione, setAggiungendoSezione] = useState(false);
  // Creazione rapida: una riga di input dentro la sezione giusta. Il form
  // completo sta nel drawer, che pero' ha bisogno di una task gia' esistente.
  const [creandoIn, setCreandoIn] = useState<string | null>(null);
  const [titoloNuovo, setTitoloNuovo] = useState("");
  const [salvandoNuovo, setSalvandoNuovo] = useState(false);

  const creaTask = async (sezioneId: string) => {
    const titolo = titoloNuovo.trim();
    if (!titolo) return;
    setSalvandoNuovo(true);
    try {
      await onCreaTask(sezioneId, titolo);
      setTitoloNuovo("");
      setCreandoIn(null);
    } catch {
      // Il messaggio lo mostra la pagina (onCreaTask lo rilancia). Qui si
      // tiene il campo com'era: riscriverlo e' meno lavoro che rifare.
    } finally {
      setSalvandoNuovo(false);
    }
  };

  // Sezione di una task: quella spostata se esiste ancora, altrimenti la
  // prima. Le attivita' preesistenti non hanno un campo sezione e non vanno
  // disperse; una sezione cancellata non deve far sparire le sue task, che
  // altrimenti uscirebbero da ogni gruppo.
  const sezioneDi = (a: AttivitaRow): string => {
    const scelta = extra[a.id]?.sezione;
    if (scelta && sezioni.some((s) => s.id === scelta)) return scelta;
    return sezioni[0]?.id ?? "";
  };

  const gruppi = useMemo(() => {
    return sezioni.map((s) => {
      const tutte = attivita.filter((a) => sezioneDi(a) === s.id);
      return {
        sezione: s,
        // Il filtro agisce solo sulla VISUALIZZAZIONE: i conteggi della
        // testata restano sul totale della sezione. Altrimenti filtrando
        // "Da fare" ogni sezione direbbe "0/3", facendo credere che il lavoro
        // fatto sia sparito.
        task: tutte.filter((a) => filtro === "TUTTE" || a.stato === filtro),
        totali: tutte.length,
        fatte: tutte.filter((a) => a.stato === "COMPLETATA").length,
      };
    });
    // sezioneDi dipende da extra e sezioni: entrambi sono in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attivita, filtro, sezioni, extra]);

  const toggleChiusa = (id: string) => {
    setChiuse((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rinomina = (id: string) => {
    const titolo = bozzaTitolo.trim();
    if (!titolo) return;
    onCambiaSezioni(sezioni.map((s) => (s.id === id ? { ...s, titolo } : s)));
    setRinominaId(null);
    setBozzaTitolo("");
  };

  const eliminaSezione = (id: string) => {
    // Le task non si perdono: tornano nella prima sezione rimasta. Cancellare
    // il contenitore non deve cancellare il lavoro.
    const restanti = sezioni.filter((s) => s.id !== id);
    if (restanti.length === 0) return;
    const prima = restanti[0].id;
    for (const a of attivita) {
      if (sezioneDi(a) === id) onCambiaExtra(a.id, { sezione: prima });
    }
    onCambiaSezioni(restanti);
  };

  const aggiungiSezione = () => {
    const titolo = nuovaSezione.trim();
    if (!titolo) return;
    onCambiaSezioni([...sezioni, { id: nuovoId(), titolo }]);
    setNuovaSezione("");
    setAggiungendoSezione(false);
  };

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Barra controlli: filtri per stato + nuova sezione                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-crema-bordo px-5 py-3">
        <div role="group" aria-label="Filtra per stato" className="flex rounded-full bg-crema-scuro p-1">
          {FILTRI.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filtro === f.value}
              onClick={() => setFiltro(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition duration-200 ${
                filtro === f.value
                  ? "bg-white text-inchiostro shadow-soft"
                  : "text-caldo-testo hover:text-inchiostro"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAggiungendoSezione((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-semibold text-inchiostro transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Sezione
        </button>
      </div>

      {aggiungendoSezione && (
        <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-5 py-3">
          <input
            autoFocus
            value={nuovaSezione}
            onChange={(e) => setNuovaSezione(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aggiungiSezione();
              }
              if (e.key === "Escape") {
                setAggiungendoSezione(false);
                setNuovaSezione("");
              }
            }}
            placeholder="Nome della sezione (es. Collaudo)"
            aria-label="Nome della nuova sezione"
            className="w-full max-w-xs rounded-full border border-crema-contorno bg-white px-4 py-1.5 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          />
          <button
            type="button"
            onClick={aggiungiSezione}
            disabled={!nuovaSezione.trim()}
            className="rounded-full bg-inchiostro px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-inchiostro-profondo disabled:opacity-40"
          >
            Crea
          </button>
          <button
            type="button"
            onClick={() => {
              setAggiungendoSezione(false);
              setNuovaSezione("");
            }}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-caldo-testo transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
          >
            Annulla
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Gruppi                                                              */}
      {/* ------------------------------------------------------------------ */}
      {attivita.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-caldo-testo">Nessuna task in questo progetto.</p>
          <div className="mx-auto mt-3 flex max-w-sm items-center gap-2">
            <input
              value={titoloNuovo}
              onChange={(e) => setTitoloNuovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  creaTask(sezioni[0]?.id ?? "");
                }
              }}
              placeholder="Titolo della prima task"
              aria-label="Titolo della prima task"
              className="w-full rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            />
            <button
              type="button"
              onClick={() => creaTask(sezioni[0]?.id ?? "")}
              disabled={!titoloNuovo.trim() || salvandoNuovo}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo disabled:opacity-40"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Crea
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-crema-bordo">
          {gruppi.map(({ sezione, task, totali, fatte }) => {
            const chiusa = chiuse.has(sezione.id);

            return (
              <section key={sezione.id} aria-labelledby={`sez-${sezione.id}`} className="group/sezione">
                {/* Testata della sezione */}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleChiusa(sezione.id)}
                    aria-expanded={!chiusa}
                    aria-controls={`sez-corpo-${sezione.id}`}
                    aria-label={chiusa ? `Espandi ${sezione.titolo}` : `Comprimi ${sezione.titolo}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-caldo-testo transition hover:bg-crema-scuro hover:text-inchiostro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                  >
                    {chiusa ? (
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {rinominaId === sezione.id ? (
                    <input
                      autoFocus
                      value={bozzaTitolo}
                      onChange={(e) => setBozzaTitolo(e.target.value)}
                      onBlur={() => rinomina(sezione.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          rinomina(sezione.id);
                        }
                        if (e.key === "Escape") {
                          setRinominaId(null);
                          setBozzaTitolo("");
                        }
                      }}
                      aria-label="Nome della sezione"
                      className="w-48 rounded-full border border-inchiostro bg-white px-3 py-1 text-sm font-semibold text-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                    />
                  ) : (
                    <h3
                      id={`sez-${sezione.id}`}
                      className="font-display text-base font-semibold text-inchiostro"
                    >
                      {sezione.titolo}
                    </h3>
                  )}

                  <span className="tabular rounded-full bg-crema-scuro px-2 py-0.5 text-[11px] font-semibold text-caldo-testo">
                    {totali === 0 ? 0 : `${fatte}/${totali}`}
                  </span>

                  <div className="ml-auto flex items-center gap-1">
                    {/* Rinomina / elimina sezione: appaiono al passaggio del
                        mouse e sono sempre raggiungibili da tastiera. */}
                    <button
                      type="button"
                      onClick={() => {
                        setRinominaId(sezione.id);
                        setBozzaTitolo(sezione.titolo);
                      }}
                      aria-label={`Rinomina la sezione ${sezione.titolo}`}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium text-caldo-testo opacity-0 transition hover:bg-crema-scuro hover:text-inchiostro focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro group-hover/sezione:opacity-100"
                    >
                      Rinomina
                    </button>
                    {sezioni.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminaSezione(sezione.id)}
                        aria-label={`Elimina la sezione ${sezione.titolo}`}
                        title="Le task tornano nella prima sezione"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-caldo-testo opacity-0 transition hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro group-hover/sezione:opacity-100"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCreandoIn(creandoIn === sezione.id ? null : sezione.id);
                        setTitoloNuovo("");
                      }}
                      aria-expanded={creandoIn === sezione.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3 py-1 text-[11px] font-semibold text-inchiostro transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Task
                    </button>
                  </div>
                </div>

                {/* Corpo della sezione */}
                {!chiusa && (
                  <div id={`sez-corpo-${sezione.id}`}>
                    {creandoIn === sezione.id && (
                      <div className="flex items-center gap-2 px-5 pb-2 pl-14">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-dashed border-crema-contorno text-caldo-testo">
                          <PlusIcon className="h-3 w-3" />
                        </span>
                        <input
                          autoFocus
                          value={titoloNuovo}
                          onChange={(e) => setTitoloNuovo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              creaTask(sezione.id);
                            }
                            if (e.key === "Escape") {
                              setCreandoIn(null);
                              setTitoloNuovo("");
                            }
                          }}
                          placeholder="Titolo della task e premi Invio"
                          aria-label="Titolo della nuova task"
                          className="h-8 w-full rounded-full border border-crema-contorno bg-white px-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                        />
                        <button
                          type="button"
                          onClick={() => creaTask(sezione.id)}
                          disabled={!titoloNuovo.trim() || salvandoNuovo}
                          className="shrink-0 rounded-full bg-inchiostro px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-inchiostro-profondo disabled:opacity-40"
                        >
                          {salvandoNuovo ? "…" : "Crea"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreandoIn(null);
                            setTitoloNuovo("");
                          }}
                          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                        >
                          Annulla
                        </button>
                      </div>
                    )}

                    {task.length === 0 ? (
                      <p className="px-5 pb-4 pl-14 text-xs text-caldo-testo">
                        {filtro === "TUTTE"
                          ? "Nessuna task in questa sezione."
                          : totali === 0
                            ? "Nessuna task in questa sezione."
                            : `Nessuna delle ${totali} task di questa sezione è in questo stato.`}
                      </p>
                    ) : (
                      <ul className="pb-2">
                        {task.map((a) => (
                          <RigaTask
                            key={a.id}
                            attivita={a}
                            extra={extra[a.id] ?? {}}
                            sezioni={sezioni}
                            sezioneId={sezione.id}
                            minutiRegistrati={minutiPerTask?.[a.id] ?? 0}
                            selezionata={selezionataId === a.id}
                            onSeleziona={() => onSeleziona(a.id)}
                            onCompleta={(v) => onCompleta(a, v)}
                            onSposta={(idSezione) =>
                              onCambiaExtra(a.id, { sezione: idSezione })
                            }
                            onElimina={() => onElimina(a)}
                            confermaElimina={confermaEliminaId === a.id}
                            onAnnullaElimina={onAnnullaElimina}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}

        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Riga di una task
// ---------------------------------------------------------------------------

interface RigaTaskProps {
  attivita: AttivitaRow;
  extra: ExtraTask;
  sezioni: Sezione[];
  sezioneId: string;
  // Minuti delle voci chiuse su questa task. Arriva dall'aggregato della
  // board: la riga non fa richieste proprie.
  minutiRegistrati: number;
  selezionata: boolean;
  onSeleziona: () => void;
  onCompleta: (completata: boolean) => void;
  onSposta: (sezioneId: string) => void;
  onElimina: () => void;
  confermaElimina: boolean;
  onAnnullaElimina: () => void;
}

function RigaTask({
  attivita: a,
  extra,
  sezioni,
  sezioneId,
  minutiRegistrati,
  selezionata,
  onSeleziona,
  onCompleta,
  onSposta,
  onElimina,
  confermaElimina,
  onAnnullaElimina,
}: RigaTaskProps) {
  const completata = a.stato === "COMPLETATA";
  const sotto = extra.sotto ?? [];
  const fatte = sotto.filter((s) => s.fatta).length;
  const commenti = extra.commenti ?? [];
  // Il type predicate non e' cosmetico: `filter(Boolean)` lascia `string | null`
  // e a valle `iniziali()` rifiuterebbe il null.
  const persone = [a.assegnatario, ...(extra.persone ?? [])].filter(
    (n): n is string => Boolean(n)
  );

  return (
    // Il contenitore e' cliccabile per intero, ma i controlli interni sono
    // button veri: la riga non e' un <button>, che anniderebbe elementi
    // interattivi (non valido e illeggibile da tastiera). Il click apre il
    // drawer tramite onClick sul contenitore, e i bottoni fermano la
    // propagazione.
    <li
      onClick={onSeleziona}
      // La riga e' cliccabile per intero: senza tabIndex/role resterebbe
      // raggiungibile solo col mouse. Enter e Spazio aprono il drawer; i
      // bottoni interni, avendo il loro keydown nativo, funzionano come prima.
      tabIndex={0}
      role="button"
      aria-label={`Apri la task ${a.titolo}`}
      onKeyDown={(e) => {
        // Solo quando il focus e' SULLA riga: se e' su un controllo interno
        // (checkbox, select, elimina) il tasto deve fare la sua azione. Senza
        // guard, Spazio sul checkbox spunterebbe la task E aprirebbe il drawer.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSeleziona();
        }
      }}
      className={`group/riga relative flex cursor-pointer items-start gap-3 border-l-2 py-2.5 pl-4 pr-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-inchiostro ${
        selezionata
          ? "border-l-inchiostro bg-crema-scuro/70"
          : "border-l-transparent hover:bg-crema-scuro/40"
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completata}
        aria-label={`Segna ${a.titolo} come ${completata ? "da fare" : "completata"}`}
        onClick={(e) => {
          e.stopPropagation();
          onCompleta(!completata);
        }}
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 ${
          completata
            ? "border-inchiostro bg-inchiostro text-white"
            : "border-crema-contorno bg-white text-transparent hover:border-caldo-testo"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </button>

      {/* Titolo + tracce */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-sm font-semibold ${
              completata
                ? "text-caldo-testo line-through decoration-caldo-testo/40"
                : "text-inchiostro"
            }`}
          >
            {a.titolo}
          </p>
          {!completata && <PriorityBadge priorita={a.priorita} />}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-caldo-testo">
          {a.data_scadenza && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {formatData(a.data_scadenza)}
            </span>
          )}
          {sotto.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecksIcon className="h-3 w-3" />
              {fatte}/{sotto.length}
            </span>
          )}
          {commenti.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageIcon className="h-3 w-3" />
              {commenti.length}
            </span>
          )}
          {!a.data_scadenza && sotto.length === 0 && commenti.length === 0 && (
            <span className="text-caldo-testo/70">Senza scadenza</span>
          )}
        </div>
      </div>

      {/* Avatar delle persone: massimo tre, poi "+n" */}
      {persone.length > 0 && (
        <div className="mt-0.5 flex shrink-0 items-center" aria-label={`Assegnata a ${persone.join(", ")}`}>
          {persone.slice(0, 3).map((nome, i) => (
            <span
              key={nome}
              title={nome}
              className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold ring-2 ring-white ${
                i === 0 ? "bg-lime text-lime-testo" : "bg-crema-scuro text-inchiostro"
              } ${i > 0 ? "-ml-1.5" : ""}`}
            >
              {iniziali(nome)}
            </span>
          ))}
          {persone.length > 3 && (
            <span className="-ml-1.5 grid h-6 w-6 place-items-center rounded-full bg-crema-scuro text-[9px] font-semibold text-caldo-testo ring-2 ring-white">
              +{persone.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Controlli: timer, sposta di sezione + elimina, visibili su hover/focus */}
      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        {/* Il timer entra e resta: e' un'azione che si usa, non un comando da
            nascondere finche' non si passa col mouse. Il totale delle voci
            chiuse arriva gia' aggregato (`minutiRegistrati`), quindi la riga
            dice anche quanto e' costata la task senza aprire il drawer e senza
            una richiesta per riga. */}
        <TimerBersaglio
          attivita_id={a.id}
          etichetta={a.titolo}
          minutiRegistrati={minutiRegistrati}
          compatto
        />

        {/* Sposta di sezione: una select nativa vestita da pillola. Mostra la
            sezione corrente, quindi il controllo dice anche DOVE sta la task
            senza aggiungere un'etichetta in ogni riga. Compare su hover e su
            focus da tastiera. */}
        <div className="relative shrink-0 opacity-0 transition focus-within:opacity-100 group-hover/riga:opacity-100">
          <label className="sr-only" htmlFor={`sposta-${a.id}`}>
            Sposta {a.titolo} in un&apos;altra sezione
          </label>
          <select
            id={`sposta-${a.id}`}
            value={sezioneId}
            title="Sposta in un'altra sezione"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onSposta(e.target.value);
            }}
            className="h-6 max-w-[7.5rem] cursor-pointer appearance-none truncate rounded-full border border-crema-contorno bg-white pl-2 pr-6 text-[11px] font-medium text-caldo-testo transition hover:border-caldo-testo/40 hover:text-inchiostro focus:outline-none focus:ring-2 focus:ring-inchiostro"
          >
            {sezioni.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titolo}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-caldo-testo" />
        </div>

        {confermaElimina ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onElimina();
              }}
              className="shrink-0 rounded-full bg-pericolo px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-pericolo-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pericolo"
            >
              Conferma
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAnnullaElimina();
              }}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
            >
              Annulla
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onElimina();
            }}
            aria-label={`Elimina la task ${a.titolo}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-caldo-testo opacity-0 transition hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro group-hover/riga:opacity-100"
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </li>
  );
}
