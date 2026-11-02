"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Cliente,
  Etichetta,
  EventoCalendario,
  OrigineEvento,
  ProgettoListRow,
} from "@/lib/types";
import type { DatiEventoCompatto } from "@/lib/calendario-form";
import { LayersIcon, TrashIcon, XIcon } from "@/components/icons";
import { posizionaPopover, type Posizione } from "./posiziona";
import { BTN_PRIMARIO, BTN_SECONDARIO, INPUT_CLASS, LABEL_CLASS } from "./stili";

export interface PopoverEventoProps {
  evento: EventoCalendario | null;
  dati: DatiEventoCompatto;
  ancora: { x: number; y: number };
  etichette: Etichetta[];
  progetti: ProgettoListRow[];
  clienti: Cliente[];
  operatori: string[];
  saving: boolean;
  errore: string;
  onCambia: (patch: Partial<DatiEventoCompatto>) => void;
  onSalva: () => void;
  onChiudi: () => void;
  onElimina: () => void;
  onDuplica: () => void;
  onDettagli: () => void;
}

const ORIGINI: { id: OrigineEvento; label: string }[] = [
  { id: "generico", label: "Generico" },
  { id: "progetto", label: "Progetto" },
  { id: "cliente", label: "Cliente" },
];

// ===========================================================================
// Editor compatto ancorato allo slot.
//
// Montato in un portal su document.body: `main > *` in globals.css ha
// un'animazione con transform, che crea un containing block per position:
// fixed; la griglia ha overflow, che taglierebbe il popover. Dentro main
// sarebbe quindi spostato o invisibile.
// ===========================================================================
export default function PopoverEvento({
  evento,
  dati,
  ancora,
  etichette,
  progetti,
  clienti,
  operatori,
  saving,
  errore,
  onCambia,
  onSalva,
  onChiudi,
  onElimina,
  onDuplica,
  onDettagli,
}: PopoverEventoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Posizione | null>(null);
  const [confermaElimina, setConfermaElimina] = useState(false);

  const chiudiRef = useRef(onChiudi);
  chiudiRef.current = onChiudi;

  // Misura dopo il layout (offsetWidth/Height sono definitivi) e riposiziona
  // se la finestra o la griglia cambiano dimensione.
  useLayoutEffect(() => {
    const misura = () => {
      const el = ref.current;
      if (!el) return;
      setPos(
        posizionaPopover(
          ancora,
          { width: el.offsetWidth, height: el.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
    };
    misura();
    window.addEventListener("resize", misura);
    // capture: intercetta anche lo scroll interno della griglia.
    window.addEventListener("scroll", misura, true);
    return () => {
      window.removeEventListener("resize", misura);
      window.removeEventListener("scroll", misura, true);
    };
  }, [ancora]);

  useEffect(() => {
    const sulPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        chiudiRef.current();
      }
    };
    // Il listener viene montato dopo il click che ha aperto il popover:
    // il setTimeout evita di chiuderlo nello stesso evento.
    const id = window.setTimeout(
      () => document.addEventListener("pointerdown", sulPointer),
      0
    );
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", sulPointer);
    };
  }, []);

  useEffect(() => {
    const sulTasto = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      chiudiRef.current();
    };
    window.addEventListener("keydown", sulTasto);
    return () => window.removeEventListener("keydown", sulTasto);
  }, []);

  // Se la fine non supera l'inizio, il salvataggio chiude il giorno dopo.
  // Va detto prima, non dopo: è una scelta, non un errore.
  const chiudeDopo = Boolean(dati.fine) && dati.fine <= dati.inizio;
  const inModifica = Boolean(evento);

  if (typeof document === "undefined") return null;

  const contenuto = (
    <div
      ref={ref}
      role="dialog"
      aria-label={inModifica ? "Modifica evento" : "Nuovo evento"}
      className="fixed z-50 flex max-h-[calc(100dvh-16px)] w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-card border border-crema-contorno bg-white shadow-soft"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSalva();
        }}
        className="flex min-h-0 flex-col"
      >
        <div className="flex items-start justify-between gap-2 border-b border-crema-bordo px-4 pb-2 pt-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-inchiostro">
              {evento ? evento.titolo : "Nuovo evento"}
            </p>
            <p className="text-[10px] text-caldo-testo">
              {evento ? "Modifica rapida" : "Inserisci i dettagli essenziali"}
            </p>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="shrink-0 cursor-pointer rounded p-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="pop-titolo">
              Titolo *
            </label>
            <input
              id="pop-titolo"
              autoFocus
              value={dati.titolo}
              onChange={(e) => onCambia({ titolo: e.target.value })}
              className={`mt-1 ${INPUT_CLASS}`}
              placeholder="Es. Riunione con il cliente"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="pop-giorno">
                Giorno
              </label>
              <input
                id="pop-giorno"
                type="date"
                value={dati.data}
                onChange={(e) => onCambia({ data: e.target.value })}
                className={`mt-1 ${INPUT_CLASS}`}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="pop-inizio">
                Inizio
              </label>
              <input
                id="pop-inizio"
                type="time"
                value={dati.inizio}
                step={300}
                onChange={(e) => onCambia({ inizio: e.target.value })}
                className={`mt-1 ${INPUT_CLASS}`}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="pop-fine">
                Fine
              </label>
              <input
                id="pop-fine"
                type="time"
                value={dati.fine}
                step={300}
                onChange={(e) => onCambia({ fine: e.target.value })}
                className={`mt-1 ${INPUT_CLASS}`}
                required
              />
            </div>
          </div>

          {chiudeDopo && (
            <p className="rounded-control border border-stato-attesa-bordo bg-stato-attesa-bg px-2 py-1 text-[10px] font-medium text-stato-attesa-testo">
              La fine è prima dell&apos;inizio: l&apos;evento termina il giorno
              successivo.
            </p>
          )}

          <div>
            <span className={LABEL_CLASS}>Tipo</span>
            <div className="mt-1 flex rounded-control border border-crema-contorno bg-crema-scuro/60 p-0.5">
              {ORIGINI.map((o) => {
                const attiva = dati.origine === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={attiva}
                    onClick={() => onCambia({ origine: o.id })}
                    className={`flex-1 cursor-pointer rounded-[0.65rem] px-1 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                      attiva
                        ? "bg-inchiostro text-white"
                        : "text-caldo-testo hover:text-inchiostro"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {dati.origine === "progetto" && (
            <div>
              <label className={LABEL_CLASS} htmlFor="pop-progetto">
                Progetto
              </label>
              <select
                id="pop-progetto"
                value={dati.progetto_id}
                onChange={(e) => onCambia({ progetto_id: e.target.value })}
                className={`mt-1 cursor-pointer ${INPUT_CLASS}`}
              >
                <option value="">Nessun progetto</option>
                {progetti.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codice} · {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {dati.origine === "cliente" && (
            <div>
              <label className={LABEL_CLASS} htmlFor="pop-cliente">
                Cliente
              </label>
              <select
                id="pop-cliente"
                value={dati.cliente_id}
                onChange={(e) => onCambia({ cliente_id: e.target.value })}
                className={`mt-1 cursor-pointer ${INPUT_CLASS}`}
              >
                <option value="">Nessun cliente</option>
                {clienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ragione_sociale}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS} htmlFor="pop-persona">
              Persona
            </label>
            <input
              id="pop-persona"
              list="pop-persone"
              value={dati.assegnatario}
              onChange={(e) => onCambia({ assegnatario: e.target.value })}
              className={`mt-1 ${INPUT_CLASS}`}
              placeholder="Nome operatore"
            />
            <datalist id="pop-persone">
              {operatori.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className={LABEL_CLASS}>Etichette</span>
              {dati.etichette.length > 0 && (
                <span className="text-[10px] font-medium text-caldo-testo">
                  {dati.etichette.length} selezionate
                </span>
              )}
            </div>
            {etichette.length === 0 ? (
              <p className="mt-1 text-[10px] text-caldo-testo">
                Nessuna etichetta disponibile.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {etichette.map((et) => {
                  const attiva = dati.etichette.includes(et.id);
                  return (
                    <button
                      key={et.id}
                      type="button"
                      aria-pressed={attiva}
                      onClick={() =>
                        onCambia({
                          etichette: attiva
                            ? dati.etichette.filter((id) => id !== et.id)
                            : [...dati.etichette, et.id],
                        })
                      }
                      className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors duration-200 ${
                        attiva
                          ? "border-inchiostro bg-inchiostro text-white"
                          : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: et.colore }}
                      />
                      {et.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="pop-descrizione">
              Descrizione
            </label>
            <textarea
              id="pop-descrizione"
              rows={2}
              value={dati.descrizione}
              onChange={(e) => onCambia({ descrizione: e.target.value })}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>

          {errore && (
            <p className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1 text-[10px] font-medium text-stato-urgenza-testo">
              {errore}
            </p>
          )}
        </div>

        <div className="border-t border-crema-bordo px-4 py-2.5">
          <div className="flex items-center gap-2">
            {evento && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onDuplica}
                  disabled={saving}
                  title="Crea una copia di questo evento"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LayersIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Duplica</span>
                </button>
                {confermaElimina ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onElimina}
                      disabled={saving}
                      className="cursor-pointer rounded-control bg-pericolo px-2 py-1 text-[10px] font-semibold text-white transition-colors duration-200 hover:bg-pericolo-scuro disabled:opacity-60"
                    >
                      Elimina
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfermaElimina(false)}
                      className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1 text-[10px] font-medium text-caldo-testo"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfermaElimina(true)}
                    title="Elimina evento"
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border border-transparent text-pericolo transition-colors duration-200 hover:bg-pericolo/10"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    <span className="sr-only">Elimina</span>
                  </button>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={onChiudi}
                className={`${BTN_SECONDARIO} px-3 py-1.5 text-xs`}
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving || !dati.titolo.trim()}
                className={`${BTN_PRIMARIO} px-3 py-1.5 text-xs`}
              >
                {saving ? "Salvo…" : "Salva"}
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onDettagli}
              className="cursor-pointer text-[11px] font-semibold text-caldo-testo underline-offset-2 transition-colors duration-200 hover:text-inchiostro hover:underline"
            >
              Tutti i dettagli
            </button>
            {evento?.progetto_id && (
              <a
                href={`/progetti/${evento.progetto_id}`}
                className="text-[11px] font-semibold text-inchiostro underline-offset-2 hover:underline"
              >
                Apri progetto
              </a>
            )}
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(contenuto, document.body);
}
