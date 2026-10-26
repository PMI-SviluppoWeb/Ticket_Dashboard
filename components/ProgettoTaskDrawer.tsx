"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AttivitaRow,
  Priorita,
  Progetto,
  StatoAttivita,
} from "@/lib/types";
import { ACTIVITY_STATUS_LABELS, PriorityBadge } from "@/components/badges";
import {
  CheckIcon,
  ExternalLinkIcon,
  FolderIcon,
  LinkIcon,
  ListChecksIcon,
  MessageIcon,
  PlusIcon,
  SendIcon,
  TicketIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { perInputDateTime } from "@/lib/calendario";
import { iniziali, nuovoId, type CommentoTask, type ExtraTask } from "@/lib/task-local";

// ---------------------------------------------------------------------------
// Drawer della task.
//
// Slitta da destra sopra il contenuto: la board resta visibile dietro, quindi
// si tiene il contesto mentre si lavora sulla singola attivita'. Il pannello
// largo (600px) e' il motivo per cui il layout e' questo e non uno split: qui
// dentro convivono meta', descrizione, sottoattivita' e commenti, e a 360px
// i commenti diventerebbero righe da tre parole.
//
// Cosa e' PERSISTENTE: titolo, stato, priorita', scadenza, inizio,
// assegnatario, descrizione -> PATCH /api/attivita/[id], salvato dal bottone
// in fondo (esplicito, perche' un autosave su un form cosi' grande rende
// ambiguo cosa e' stato scritto).
//
// Cosa e' LOCALE: persone aggiuntive, ticket collegato, sottoattivita' e
// commenti. Non hanno ancora tabelle: vivono nello stato della board, come
// concordato, e la forma dei tipi e' gia' quella che usera' il backend.
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "w-full rounded-full border border-crema-contorno bg-white py-2 px-4 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
const AREA_CLASS =
  "w-full rounded-control border border-crema-contorno bg-white px-4 py-3 text-sm leading-relaxed text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
const LABEL_CLASS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo";
const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SECONDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const STATI: StatoAttivita[] = ["DA_FARE", "IN_CORSO", "COMPLETATA"];
const PRIORITA_OPTIONS: { value: Priorita; label: string }[] = [
  { value: "BASSA", label: "Bassa" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
];

interface Dipendente {
  id: string;
  nome: string;
}

interface ProgettoTaskDrawerProps {
  progetto: Progetto;
  attivita: AttivitaRow;
  operatori: Dipendente[];
  extra: ExtraTask;
  onChangeExtra: (patch: Partial<ExtraTask>) => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}

interface Bozza {
  titolo: string;
  descrizione: string;
  stato: StatoAttivita;
  priorita: Priorita;
  data_scadenza: string;
  data_inizio: string;
  assegnatario: string;
}

function bozzaDa(a: AttivitaRow): Bozza {
  return {
    titolo: a.titolo,
    descrizione: a.descrizione ?? "",
    stato: a.stato,
    priorita: a.priorita,
    data_scadenza: perInputDateTime(a.data_scadenza),
    data_inizio: perInputDateTime(a.data_inizio),
    assegnatario: a.assegnatario ?? "",
  };
}

export default function ProgettoTaskDrawer({
  progetto,
  attivita,
  operatori,
  extra,
  onChangeExtra,
  onSave,
  onDelete,
  onClose,
}: ProgettoTaskDrawerProps) {
  // La bozza e' inizializzata UNA volta per task: senza la key sul componente
  // (la mettiamo nel parent) un cambio di task riuserebbe lo stato vecchio.
  const [bozza, setBozza] = useState<Bozza>(() => bozzaDa(attivita));
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Chiusura con modifiche pendenti: Esc e la X non devono buttare via la
  // bozza in silenzio. Si chiede conferma solo quando `sporco` e' vero.
  const [chiediChiusura, setChiediChiusura] = useState(false);

  const [nuovaSotto, setNuovaSotto] = useState("");
  const [nuovoCommento, setNuovoCommento] = useState("");
  const [io, setIo] = useState<{ nome: string } | null>(null);
  const [personeInput, setPersoneInput] = useState("");

  const pannelloRef = useRef<HTMLDivElement>(null);
  // `onClose` arriva dal parent come arrow inline: la sua identita' cambia a
  // ogni render del parent, che avviene ogni volta che si aggiunge un commento
  // o una sottoattivita'. Tenendolo in un ref, l'effetto sotto puo' dipendere da
  // un array vuoto: senza, ad ogni render rifarebbe anche il focus sul
  // pannello, strappando il cursore dal campo in cui si sta scrivendo.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Stesso motivo per "la bozza e' sporca": il listener di Esc e' registrato
  // una volta sola e deve leggere il valore corrente, non quello del
  // primo render (in cui non c'era nulla di non salvato).
  const sporcoRef = useRef(false);
  const chiediChiusuraRef = useRef(false);

  // Chi scrive un commento e' l'operatore loggato: il nome lo prendiamo dalla
  // sessione, non da un campo libero, altrimenti i commenti sarebbero
  // firmabili con qualunque nome.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.operator?.nome) setIo({ nome: d.operator.nome });
      })
      .catch(() => {});
  }, []);

  // Chiusura con Esc + blocco dello scroll del body finche' il drawer e'
  // aperto. Una volta per montaggio: le dipendenze sono volutamente vuote —
  // vedi i ref sopra: con `[onClose]` il focus verrebbe riconquistato ad ogni
  // render, e con `[sporco]` il listener verrebbe ricreato ad ogni tasto.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Con la conferma gia' aperta, Esc la ANNULLA: e' la convenzione
      // universale dei dialoghi e permette di tornare a scrivere senza
      // premere il bottone. Solo un Esc senza modifiche chiude davvero.
      if (chiediChiusuraRef.current) {
        chiediChiusuraRef.current = false;
        setChiediChiusura(false);
        return;
      }
      // Con modifiche pendenti chiediamo conferma invece di scartarle.
      if (sporcoRef.current) {
        chiediChiusuraRef.current = true;
        setChiediChiusura(true);
      } else onCloseRef.current();
    };
    document.addEventListener("keydown", suTasto);
    const overflowPrecedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    pannelloRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", suTasto);
      document.body.style.overflow = overflowPrecedente;
    };
  }, []);

  const sporco = useMemo(() => {
    const base = bozzaDa(attivita);
    return (
      base.titolo !== bozza.titolo ||
      base.descrizione !== bozza.descrizione ||
      base.stato !== bozza.stato ||
      base.priorita !== bozza.priorita ||
      base.data_scadenza !== bozza.data_scadenza ||
      base.data_inizio !== bozza.data_inizio ||
      base.assegnatario !== bozza.assegnatario
    );
  }, [attivita, bozza]);
  sporcoRef.current = sporco;

  // Apertura della conferma: stato e ref vanno mossi INSIEME, perche' il
  // listener di Esc legge solo il ref (e' registrato una volta sola).
  const mostraConferma = () => {
    chiediChiusuraRef.current = true;
    setChiediChiusura(true);
  };
  const annullaChiusura = () => {
    chiediChiusuraRef.current = false;
    setChiediChiusura(false);
  };

  // Unico punto di uscita di X, velo ed Esc: chiude subito se non c'e' niente
  // da perdere, altrimenti chiede conferma.
  const richiediChiusura = () => {
    if (sporco) mostraConferma();
    else onClose();
  };

  const salva = async () => {
    if (!bozza.titolo.trim()) {
      setErrore("Il titolo non può essere vuoto.");
      return;
    }
    setSalvando(true);
    setErrore("");
    try {
      await onSave({
        titolo: bozza.titolo.trim(),
        descrizione: bozza.descrizione || null,
        stato: bozza.stato,
        priorita: bozza.priorita,
        data_scadenza: bozza.data_scadenza || null,
        data_inizio: bozza.data_inizio || null,
        assegnatario: bozza.assegnatario || null,
      });
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSalvando(false);
    }
  };

  // -------------------------------------------------------------------------
  // Persone: l'assegnatario e' il campo REALE dell'attivita' (quello che
  // alimenta calendario e Google); le altre persone sono un elenco locale.
  // In UI sono un concetto solo: un chip per persona.
  // -------------------------------------------------------------------------
  const personeExtra = extra.persone ?? [];
  const persone = [bozza.assegnatario, ...personeExtra].filter(Boolean);

  const aggiungiPersona = (nome: string) => {
    const pulito = nome.trim();
    if (!pulito || persone.includes(pulito)) return;
    if (!bozza.assegnatario) {
      setBozza((b) => ({ ...b, assegnatario: pulito }));
    } else {
      onChangeExtra({ persone: [...personeExtra, pulito] });
    }
    setPersoneInput("");
  };

  const rimuoviPersona = (nome: string) => {
    if (nome === bozza.assegnatario) {
      setBozza((b) => ({ ...b, assegnatario: "" }));
    } else {
      onChangeExtra({ persone: personeExtra.filter((p) => p !== nome) });
    }
  };

  // -------------------------------------------------------------------------
  // Sottoattivita'
  // -------------------------------------------------------------------------
  const sotto = extra.sotto ?? [];
  const fatte = sotto.filter((s) => s.fatta).length;

  const aggiungiSotto = () => {
    const titolo = nuovaSotto.trim();
    if (!titolo) return;
    onChangeExtra({
      sotto: [...sotto, { id: nuovoId(), titolo, fatta: false }],
    });
    setNuovaSotto("");
  };

  // -------------------------------------------------------------------------
  // Commenti
  // -------------------------------------------------------------------------
  const commenti = extra.commenti ?? [];

  const inviaCommento = () => {
    const testo = nuovoCommento.trim();
    if (!testo) return;
    const c: CommentoTask = {
      id: nuovoId(),
      autore: io?.nome ?? "Operatore",
      testo,
      data: new Date().toISOString(),
    };
    onChangeExtra({ commenti: [...commenti, c] });
    setNuovoCommento("");
  };

  const ticketScelto = progetto.tickets.find((t) => t.id === extra.ticket_id) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Velo: chiude al click. `aria-hidden` perche' il pannello e' l'unico
          contenuto raggiungibile da tastiera finche' e' aperto. */}
      <div
        className="anim-velo absolute inset-0 bg-inchiostro/30 backdrop-blur-[2px]"
        onClick={richiediChiusura}
        aria-hidden="true"
      />

      <div
        ref={pannelloRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-drawer-task"
        tabIndex={-1}
        className="anim-drawer relative flex h-full w-full max-w-full flex-col bg-white text-inchiostro shadow-soft outline-none sm:w-[600px]"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Testata                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="shrink-0 border-b border-crema-bordo px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caldo-testo">
                Task · {progetto.codice}
              </p>
              <input
                id="titolo-drawer-task"
                value={bozza.titolo}
                onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })}
                aria-label="Titolo della task"
                className="mt-1 w-full border-0 bg-transparent p-0 font-display text-2xl font-semibold tracking-tight text-inchiostro placeholder:text-caldo-testo focus:outline-none focus:ring-0"
                placeholder="Titolo della task"
              />
            </div>
            <button
              type="button"
              onClick={richiediChiusura}
              aria-label="Chiudi"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-caldo-testo transition hover:bg-crema-scuro hover:text-inchiostro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Stato: tre pillole, non una select. Sul dettaglio di una task lo
              stato e' l'azione piu' frequente e deve costare un click. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Stato della task"
              className="flex rounded-full bg-crema-scuro p-1"
            >
              {STATI.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={bozza.stato === s}
                  onClick={() => setBozza({ ...bozza, stato: s })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition duration-200 ${
                    bozza.stato === s
                      ? "bg-inchiostro text-white shadow-soft"
                      : "text-caldo-testo hover:text-inchiostro"
                  }`}
                >
                  {ACTIVITY_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <PriorityBadge priorita={bozza.priorita} />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Corpo scrollabile                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto">
          {/* Meta: struttura a due colonne di etichetta+valore. */}
          <div className="border-b border-crema-bordo px-6 py-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <label htmlFor="task-scadenza" className={LABEL_CLASS}>
                  Scadenza
                </label>
                <input
                  id="task-scadenza"
                  type="datetime-local"
                  value={bozza.data_scadenza}
                  onChange={(e) => setBozza({ ...bozza, data_scadenza: e.target.value })}
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-[10px] text-caldo-testo">
                  {bozza.data_scadenza
                    ? "Compare nel calendario e su Google."
                    : "Senza scadenza non compare nel calendario."}
                </p>
              </div>

              <div>
                <label htmlFor="task-inizio" className={LABEL_CLASS}>
                  Inizio
                </label>
                <input
                  id="task-inizio"
                  type="datetime-local"
                  value={bozza.data_inizio}
                  onChange={(e) => setBozza({ ...bozza, data_inizio: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="task-priorita" className={LABEL_CLASS}>
                  Priorità
                </label>
                <select
                  id="task-priorita"
                  value={bozza.priorita}
                  onChange={(e) =>
                    setBozza({ ...bozza, priorita: e.target.value as Priorita })
                  }
                  className={INPUT_CLASS}
                >
                  {PRIORITA_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className={LABEL_CLASS}>Progetto</p>
                <Link
                  href={`/progetti/${progetto.id}`}
                  className="flex items-center gap-2 rounded-full border border-crema-contorno bg-crema-scuro px-4 py-2 text-sm font-medium text-inchiostro transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-peach text-inchiostro">
                    <FolderIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{progetto.nome}</span>
                  <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo" />
                </Link>
              </div>
            </div>

            {/* Persone ---------------------------------------------------- */}
            <div className="mt-4">
              <p className={LABEL_CLASS}>Persone</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {persone.map((nome) => (
                  <span
                    key={nome}
                    className="inline-flex items-center gap-1.5 rounded-full bg-crema-scuro py-1 pl-1 pr-2 text-xs font-medium text-inchiostro ring-1 ring-crema-contorno"
                  >
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full bg-lime text-[10px] font-semibold text-lime-testo"
                      aria-hidden="true"
                    >
                      {iniziali(nome)}
                    </span>
                    {nome}
                    <button
                      type="button"
                      onClick={() => rimuoviPersona(nome)}
                      aria-label={`Rimuovi ${nome}`}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-caldo-testo transition hover:bg-white hover:text-pericolo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}

                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-caldo-testo" />
                  <input
                    value={personeInput}
                    onChange={(e) => setPersoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        aggiungiPersona(personeInput);
                      }
                    }}
                    list="operatori-task"
                    placeholder="Aggiungi persona…"
                    aria-label="Aggiungi una persona alla task"
                    className="h-8 w-40 rounded-full border border-dashed border-crema-contorno bg-white pl-8 pr-3 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  />
                  <datalist id="operatori-task">
                    {operatori
                      .filter((o) => !persone.includes(o.nome))
                      .map((o) => (
                        <option key={o.id} value={o.nome} />
                      ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Ticket collegato ------------------------------------------- */}
            <div className="mt-4">
              <label htmlFor="task-ticket" className={LABEL_CLASS}>
                Ticket collegato
              </label>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-peach text-inchiostro">
                  <TicketIcon className="h-3.5 w-3.5" />
                </span>
                <select
                  id="task-ticket"
                  value={extra.ticket_id ?? ""}
                  onChange={(e) => onChangeExtra({ ticket_id: e.target.value || null })}
                  className={INPUT_CLASS}
                >
                  <option value="">Nessun ticket</option>
                  {progetto.tickets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.numero} · {t.sommario_problema}
                    </option>
                  ))}
                </select>
                {ticketScelto && (
                  <Link
                    href={`/tickets/${ticketScelto.id}`}
                    title={`Apri ${ticketScelto.numero}`}
                    aria-label={`Apri il ticket ${ticketScelto.numero}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-caldo-testo transition hover:bg-crema-scuro hover:text-inchiostro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Link>
                )}
              </div>
              {progetto.tickets.length === 0 && (
                <p className="mt-1 text-[10px] text-caldo-testo">
                  Nessun ticket collegato al progetto. Si collegano dalla pagina del progetto.
                </p>
              )}
            </div>
          </div>

          {/* Descrizione -------------------------------------------------- */}
          <div className="border-b border-crema-bordo px-6 py-5">
            <label htmlFor="task-descrizione" className={LABEL_CLASS}>
              Descrizione
            </label>
            <textarea
              id="task-descrizione"
              value={bozza.descrizione}
              onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
              rows={5}
              placeholder="Contesto, vincoli, cosa serve per chiudere la task…"
              className={AREA_CLASS}
            />
          </div>

          {/* Sottoattività ------------------------------------------------ */}
          <div className="border-b border-crema-bordo px-6 py-5">
            <div className="mb-3 flex items-center gap-2">
              <ListChecksIcon className="h-4 w-4 shrink-0 text-caldo-testo" />
              <h3 className="font-display text-base font-semibold text-inchiostro">
                Sottoattività
              </h3>
              {sotto.length > 0 && (
                <span className="tabular rounded-full bg-crema-scuro px-2 py-0.5 text-[11px] font-semibold text-caldo-testo">
                  {fatte}/{sotto.length}
                </span>
              )}
            </div>

            {sotto.length > 0 && (
              <div
                className="mb-3 h-1 w-full overflow-hidden rounded-full bg-inchiostro/10"
                role="progressbar"
                aria-valuenow={Math.round((fatte / sotto.length) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Avanzamento delle sottoattività"
              >
                <div
                  className="h-full rounded-full bg-avanzamento transition-[width] duration-300"
                  style={{ width: `${(fatte / sotto.length) * 100}%` }}
                />
              </div>
            )}

            <ul className="space-y-0.5">
              {sotto.map((s) => (
                <li key={s.id} className="group flex items-center gap-2.5 rounded-control px-1 py-1.5 hover:bg-crema-scuro/60">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s.fatta}
                    aria-label={s.titolo}
                    onClick={() =>
                      onChangeExtra({
                        sotto: sotto.map((x) =>
                          x.id === s.id ? { ...x, fatta: !x.fatta } : x
                        ),
                      })
                    }
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                      s.fatta
                        ? "border-inchiostro bg-inchiostro text-white"
                        : "border-crema-contorno bg-white text-transparent hover:border-caldo-testo"
                    }`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      s.fatta ? "text-caldo-testo line-through decoration-caldo-testo/40" : "text-inchiostro"
                    }`}
                  >
                    {s.titolo}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeExtra({ sotto: sotto.filter((x) => x.id !== s.id) })
                    }
                    aria-label={`Elimina la sottoattività ${s.titolo}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caldo-testo opacity-0 transition hover:bg-white hover:text-pericolo focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro group-hover:opacity-100"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crema-scuro text-caldo-testo">
                <PlusIcon className="h-3.5 w-3.5" />
              </span>
              <input
                value={nuovaSotto}
                onChange={(e) => setNuovaSotto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aggiungiSotto();
                  }
                }}
                placeholder="Aggiungi una sottoattività e premi Invio"
                aria-label="Nuova sottoattività"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Commenti ----------------------------------------------------- */}
          <div className="px-6 py-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageIcon className="h-4 w-4 shrink-0 text-caldo-testo" />
              <h3 className="font-display text-base font-semibold text-inchiostro">Commenti</h3>
              {commenti.length > 0 && (
                <span className="tabular rounded-full bg-crema-scuro px-2 py-0.5 text-[11px] font-semibold text-caldo-testo">
                  {commenti.length}
                </span>
              )}
            </div>

            {commenti.length === 0 ? (
              <p className="rounded-control bg-crema-scuro px-4 py-3 text-sm text-caldo-testo">
                Nessun commento. Qui il team lascia aggiornamenti e decisioni sulla task.
              </p>
            ) : (
              <ul className="space-y-4">
                {commenti.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <span
                      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crema-scuro text-[11px] font-semibold text-inchiostro ring-1 ring-crema-contorno"
                      aria-hidden="true"
                    >
                      {iniziali(c.autore)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-inchiostro">{c.autore}</span>
                        <span className="text-[11px] text-caldo-testo">
                          {new Date(c.data).toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-caldo-testo">
                        {c.testo}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeExtra({ commenti: commenti.filter((x) => x.id !== c.id) })
                      }
                      aria-label={`Elimina il commento di ${c.autore}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caldo-testo transition hover:bg-crema-scuro hover:text-pericolo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Composer: avatar dell'operatore loggato, poi campo + invio. */}
            <div className="mt-3 flex gap-2.5">
              <span
                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime text-[11px] font-semibold text-lime-testo"
                aria-hidden="true"
              >
                {iniziali(io?.nome ?? "")}
              </span>
              <div className="min-w-0 flex-1">
                <textarea
                  value={nuovoCommento}
                  onChange={(e) => setNuovoCommento(e.target.value)}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl+Invio invia: Invio da solo va a capo, perche' un
                    // commento tecnico e' spesso su piu' righe.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      inviaCommento();
                    }
                  }}
                  rows={2}
                  placeholder="Scrivi un commento… (Ctrl+Invio per inviare)"
                  aria-label="Nuovo commento"
                  className={AREA_CLASS}
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={inviaCommento}
                    disabled={!nuovoCommento.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-inchiostro px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 disabled:opacity-40"
                  >
                    <SendIcon className="h-3 w-3" />
                    Commenta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Piede: salvataggio esplicito + eliminazione                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="shrink-0 border-t border-crema-bordo bg-white px-6 py-3.5">
          {/* Conferma di uscita: prende il posto della barra normale, cosi' non
              convivono due gruppi di bottoni con significati opposti. */}
          {chiediChiusura && (
            <div className="flex flex-wrap items-center gap-2 rounded-control bg-crema-scuro px-4 py-2.5">
              <p className="text-xs font-medium text-inchiostro">
                Ci sono modifiche non salvate.
              </p>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="rounded-full bg-pericolo px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-pericolo-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pericolo focus-visible:ring-offset-2"
                >
                  Esci senza salvare
                </button>
                <button
                  type="button"
                  onClick={annullaChiusura}
                  className="rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-medium text-caldo-testo transition hover:text-inchiostro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2"
                >
                  Continua a modificare
                </button>
              </div>
            </div>
          )}

          {!chiediChiusura && errore && (
            <p className="mb-2 rounded-full bg-stato-urgenza-bg px-3.5 py-1.5 text-xs font-medium text-stato-urgenza-testo">
              {errore}
            </p>
          )}
          {/* La barra azioni sparisce mentre si chiede conferma: due file di
              bottoni sovrapposte (Salva accanto a "Esci senza salvare")
              darebbero due risposte opposte alla stessa domanda. */}
          {!chiediChiusura && (
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    // Se il pannello sta mostrando la conferma di uscita,
                    // eliminare e' comunque un'azione esplicita e ha la
                    // precedenza: si chiude senza chiedere altro.
                    annullaChiusura();
                    onDelete();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-pericolo px-4 py-2 text-sm font-semibold text-white transition hover:bg-pericolo-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pericolo focus-visible:ring-offset-2"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Elimina davvero
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={BTN_SECONDARIO}
                >
                  Annulla
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Elimina task"
                className="flex h-9 w-9 items-center justify-center rounded-full text-caldo-testo transition hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Il salvataggio e' esplicito: con un form di questa altezza un
                  autosave renderebbe ambiguo se le modifiche sono passate. */}
              <span className="mr-1 hidden text-[11px] text-caldo-testo sm:inline">
                {sporco ? "Modifiche non salvate" : "Tutto salvato"}
              </span>
              <button
                type="button"
                onClick={salva}
                disabled={!sporco || salvando}
                className={BTN_PRIMARIO}
              >
                {salvando ? "Salvataggio…" : "Salva"}
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
