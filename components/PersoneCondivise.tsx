"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { caricaApi } from "@/lib/api-cache";
import { conPersona, senzaPersona, tutteLePersone } from "@/lib/persone";
import { iniziali } from "@/lib/task-local";
import { PlusIcon, UserIcon, XIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// Le persone di un progetto o di una task, in UN controllo riusabile.
//
// Serve in quattro punti (card del progetto, kanban, testata del progetto,
// drawer della task) con lo stesso comportamento: AVATAR STACK come stato
// compatto, popover come editor. Scriverne quattro versioni avrebbe prodotto
// quattro modi diversi di aggiungere una persona.
//
// Il controllo riceve l'elenco COMPLETO (primo = responsabile/assegnatario) e
// restituisce l'elenco completo: la separazione fra colonna storica e
// collaboratori la fa il genitore con `componiPersone` (lib/persone.ts).
// Promozioni e doppioni sono gia' risolti da `conPersona` / `senzaPersona`.
//
// Sta anche DENTRO una card cliccabile: ogni evento viene fermato, altrimenti
// aggiungere una persona navigherebbe al progetto.
//
// Il pannello e' `position: fixed`, non absolute: vive dentro liste con
// `overflow-y-auto` (le colonne del kanban, la board delle task) e un pannello
// assoluto verrebbe tagliato dal contenitore, restando invisibile proprio sulle
// righe in fondo. Le coordinate si calcolano dal bottone all'apertura.
// ---------------------------------------------------------------------------

const LARGHEZZA_PANNELLO = 288; // px, come il vecchio w-72
const MARGINE = 8;              // px dal bordo del viewport

// Next rende i Client Component anche sul server: li' `useLayoutEffect` avvisa
// e non c'e' nessun layout da misurare. In browser resta sincrono, cosi' il
// pannello non appare un istante dal lato sbagliato.
const useMisuraLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Operatore {
  id: string;
  nome: string;
}

interface PersoneCondiviseProps {
  // Elenco completo nell'ordine di visualizzazione: il primo e' il
  // responsabile (progetto) o l'assegnatario (task).
  persone: string[];
  onCambia: (persone: string[]) => void;
  // Testo del popover ("Persone sul progetto" / "Persone sulla task").
  titolo: string;
  // Testo del bottone quando non c'e' nessuno. Vuoto = solo l'icona.
  vuoto?: string;
  // Dove si apre il popover rispetto al bottone: nelle righe del kanban,
  // attaccate al bordo destro, si apre verso sinistra.
  allinea?: "sinistra" | "destra";
  // Chip con il nome invece dei soli avatar: dove c'e' spazio (testata del
  // progetto) il nome dice piu' di due iniziali. Altrove gli avatar bastano.
  mostraNomi?: boolean;
  // Salvataggio in corso: il bottone non si apre, per non sovrapporre due
  // PATCH sullo stesso elenco.
  disabled?: boolean;
  // Superficie sotto il controllo. La card in evidenza di /progetti e'
  // inchiostro pieno: li' un contorno crema e un testo grigio caldo
  // sparirebbero, quindi il solo stato vuoto cambia ricetta.
  tono?: "chiaro" | "scuro";
  className?: string;
}

export default function PersoneCondivise({
  persone,
  onCambia,
  titolo,
  vuoto = "Aggiungi persone",
  allinea = "sinistra",
  mostraNomi = false,
  disabled = false,
  tono = "chiaro",
  className = "",
}: PersoneCondiviseProps) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const bottoneRef = useRef<HTMLButtonElement>(null);
  const pannelloRef = useRef<HTMLDivElement>(null);
  // Coordinate del pannello, ricalcolate a ogni apertura dal rect del bottone.
  const [posizione, setPosizione] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Id univoco del datalist: piu' controlli montati insieme (una card per
  // progetto) non devono condividere la stessa lista.
  const idLista = useId();

  // Gli operatori servono solo quando il popover e' aperto: chiederli al
  // montaggio significherebbe una richiesta per ogni card della pagina. La
  // prima apertura li carica, `caricaApi` li tiene per 30 secondi e condivide
  // la promessa con le altre card.
  useEffect(() => {
    if (!aperto || operatori.length > 0) return;
    let annullato = false;
    caricaApi<{ operatori: Operatore[] }>("/api/operatori")
      .then((dato) => {
        if (!annullato) setOperatori(dato.operatori ?? []);
      })
      .catch(() => {
        // Senza elenco resta l'input libero: si puo' comunque scrivere un nome.
      });
    return () => {
      annullato = true;
    };
  }, [aperto, operatori.length]);

  // Se parte un salvataggio mentre il pannello e' aperto, si chiude: due PATCH
  // sovrapposte sullo stesso elenco darebbero un esito imprevedibile.
  useEffect(() => {
    if (disabled) setAperto(false);
  }, [disabled]);

  const apri = () => {
    const r = bottoneRef.current?.getBoundingClientRect();
    if (!r) return;
    // Il bordo destro del pannello resta a `allinea="destra"`: nelle righe del
    // kanban il bottone e' attaccato al bordo e aprirsi a sinistra e' l'unico
    // modo per starci. Poi si rientra nel viewport in ogni caso.
    const sinistra = allinea === "destra" ? r.right - LARGHEZZA_PANNELLO : r.left;
    setPosizione({
      top: r.bottom + 6,
      left: Math.max(
        MARGINE,
        Math.min(sinistra, window.innerWidth - LARGHEZZA_PANNELLO - MARGINE)
      ),
    });
    setAperto(true);
  };

  // Chiusura: click fuori, Esc o scorrimento. Registrato solo mentre e' aperto.
  useEffect(() => {
    if (!aperto) return;
    const suClick = (e: MouseEvent) => {
      if (!contenitoreRef.current?.contains(e.target as Node)) setAperto(false);
    };
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Stop: il drawer della task usa Esc per chiudersi, e questo popover
        // e' spesso SOPRA il drawer. Senza, Esc chiuderebbe tutto.
        e.stopPropagation();
        setAperto(false);
      }
    };
    // Un pannello `fixed` non segue il bottone: se scorre il contenitore (la
    // colonna del kanban, la pagina) resterebbe sospeso nel vuoto. Meglio
    // chiuderlo che lasciarlo scollegato.
    const suScorrimento = () => setAperto(false);
    document.addEventListener("mousedown", suClick);
    // `capture`: il listener del drawer e' su document in bolla. In cattura
    // questo arriva prima e lo ferma.
    document.addEventListener("keydown", suTasto, true);
    window.addEventListener("scroll", suScorrimento, true);
    window.addEventListener("resize", suScorrimento);
    // `preventScroll`: il focus automatico non deve spostare la pagina, che
    // scatenerebbe subito la chiusura da scorrimento scritta sopra.
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("mousedown", suClick);
      document.removeEventListener("keydown", suTasto, true);
      window.removeEventListener("scroll", suScorrimento, true);
      window.removeEventListener("resize", suScorrimento);
    };
  }, [aperto]);

  // Apertura verso l'alto quando sotto non c'e' spazio: si misura il pannello
  // dopo il primo render, quando l'altezza e' nota.
  useMisuraLayout(() => {
    if (!aperto) return;
    const pannello = pannelloRef.current;
    const bottone = bottoneRef.current;
    if (!pannello || !bottone) return;
    const r = bottone.getBoundingClientRect();
    const altezza = pannello.offsetHeight;
    const sotto = r.bottom + 6;
    const sopra = r.top - altezza - 6;
    const top = sotto + altezza > window.innerHeight - MARGINE && sopra > MARGINE ? sopra : sotto;
    setPosizione((p) => (p && p.top !== top ? { ...p, top } : p));
    // `persone.length`: aggiungere o togliere un chip cambia l'altezza del
    // pannello, e con lui lo spazio disponibile sotto il bottone.
  }, [aperto, persone.length]);

  const primario = persone[0] ?? null;
  const collaboratori = persone.slice(1);
  const elenco = tutteLePersone(primario, collaboratori);

  const aggiungi = (nome: string) => {
    const pulito = nome.trim();
    if (!pulito) return;
    const { primario: p, persone: altri } = conPersona(primario, collaboratori, pulito);
    const nuovo = p ? [p, ...altri] : altri;
    // Nessun cambiamento (nome gia' presente): non si chiama il server.
    if (nuovo.join("\u0000") !== elenco.join("\u0000")) onCambia(nuovo);
    setTesto("");
  };

  const rimuovi = (nome: string) => {
    const { primario: p, persone: altri } = senzaPersona(primario, collaboratori, nome);
    onCambia(p ? [p, ...altri] : altri);
  };

  return (
    <div
      ref={contenitoreRef}
      className={`relative ${className}`}
      // Dentro una card-link: nessun click qui deve navigare. `preventDefault`
      // solo fuori dal pannello, dove sta il bottone che apre il popover: sui
      // campi non si tocca il comportamento di default.
      onClick={(e) => {
        e.stopPropagation();
        if (!pannelloRef.current?.contains(e.target as Node)) e.preventDefault();
      }}
    >
      <button
        ref={bottoneRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aperto}
        aria-label={titolo}
        disabled={disabled}
        onClick={() => (aperto ? setAperto(false) : apri())}
        className="group flex items-center gap-1.5 rounded-full p-0.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60"
      >
        {elenco.length === 0 ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-1 text-[11px] font-medium transition ${
              tono === "scuro"
                ? "border-white/30 text-white/70 group-hover:border-white/60 group-hover:text-white"
                : "border-crema-contorno text-caldo-testo group-hover:border-inchiostro/30 group-hover:text-inchiostro"
            }`}
          >
            <UserIcon className="h-3 w-3" />
            {vuoto && <span>{vuoto}</span>}
          </span>
        ) : mostraNomi ? (
          <ChipStack persone={elenco} tono={tono} />
        ) : (
          <AvatarStack persone={elenco} />
        )}
      </button>

      {aperto && posizione && (
        <div
          ref={pannelloRef}
          role="dialog"
          aria-label={titolo}
          style={{ top: posizione.top, left: posizione.left, width: LARGHEZZA_PANNELLO }}
          className="fixed z-30 rounded-panel border border-crema-contorno bg-white p-3 shadow-soft"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
            {titolo}
          </p>

          {elenco.length === 0 ? (
            <p className="mb-2 text-xs text-caldo-testo">Nessuna persona.</p>
          ) : (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {elenco.map((nome, i) => (
                <li
                  key={nome}
                  className="inline-flex items-center gap-1.5 rounded-full bg-crema-scuro py-1 pl-1 pr-1.5 text-xs font-medium text-inchiostro ring-1 ring-crema-contorno"
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold ${
                      i === 0 ? "bg-lime text-lime-testo" : "bg-white text-caldo-testo"
                    }`}
                    aria-hidden="true"
                  >
                    {iniziali(nome)}
                  </span>
                  <span className="max-w-[9rem] truncate">{nome}</span>
                  <button
                    type="button"
                    onClick={() => rimuovi(nome)}
                    aria-label={`Rimuovi ${nome}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-caldo-testo transition hover:bg-white hover:text-pericolo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caldo-testo" />
            <input
              ref={inputRef}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aggiungi(testo);
                }
              }}
              list={idLista}
              placeholder="Aggiungi persona…"
              aria-label={`Aggiungi una persona: ${titolo}`}
              className="h-8 w-full rounded-full border border-dashed border-crema-contorno bg-white pl-8 pr-3 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            />
            <datalist id={idLista}>
              {operatori
                .filter((o) => !elenco.some((n) => n.toLowerCase() === o.nome.toLowerCase()))
                .map((o) => (
                  <option key={o.id} value={o.nome} />
                ))}
            </datalist>
          </div>
        </div>
      )}
    </div>
  );
}

// Variante con i nomi: un chip per persona, il primo col fondo lime pieno.
// Stesso linguaggio dei chip del popover, cosi' aprendo l'editor non cambia
// la forma di cio' che si sta modificando. Sul fondo inchiostro della card in
// evidenza il chip diventa traslucido, come i badge del piede di quella card.
function ChipStack({ persone, tono }: { persone: string[]; tono: "chiaro" | "scuro" }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {persone.map((nome, i) => (
        <span
          key={nome}
          className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium ring-1 transition ${
            tono === "scuro"
              ? "bg-white/10 text-white ring-white/20 group-hover:ring-white/40"
              : "bg-crema-scuro text-inchiostro ring-crema-contorno group-hover:ring-inchiostro/25"
          }`}
        >
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold ${
              i === 0
                ? "bg-lime text-lime-testo"
                : tono === "scuro"
                  ? "bg-white/15 text-white"
                  : "bg-white text-caldo-testo"
            }`}
            aria-hidden="true"
          >
            {iniziali(nome)}
          </span>
          <span className="max-w-[10rem] truncate">{nome}</span>
        </span>
      ))}
    </span>
  );
}

// Massimo tre facce: oltre, un "+N" dice lo stesso in meno pixel. Il primo
// avatar ha il fondo lime pieno (il responsabile), gli altri sono in crema:
// si distingue chi guida senza aggiungere una seconda etichetta.
function AvatarStack({ persone }: { persone: string[] }) {
  const visibili = persone.slice(0, 3);
  const resto = persone.length - visibili.length;
  return (
    <span className="flex items-center">
      {visibili.map((nome, i) => (
        <span
          key={nome}
          title={nome}
          className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold uppercase ring-2 ring-white ${
            i === 0
              ? "bg-lime text-lime-testo"
              : "bg-crema-scuro text-caldo-testo"
          } ${i > 0 ? "-ml-1.5" : ""}`}
        >
          {iniziali(nome)}
        </span>
      ))}
      {resto > 0 && (
        <span className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-crema-scuro px-1 text-[9px] font-semibold text-caldo-testo ring-2 ring-white">
          +{resto}
        </span>
      )}
      {persone.length > 0 && (
        <span className="ml-1 grid h-5 w-5 place-items-center rounded-full text-caldo-testo opacity-0 transition group-hover:opacity-100">
          <PlusIcon className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}
