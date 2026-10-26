"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  Cliente,
  ProgettoListRow,
  StatoProgetto,
} from "@/lib/types";
import { PriorityBadge, ProgettoStatusBadge, chip } from "@/components/badges";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import ProgettiKanban from "@/components/ProgettiKanban";
import CronometroHeader from "@/components/CronometroHeader";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ColumnsIcon,
  FolderIcon,
  GridIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { formatData } from "@/lib/calendario";
// Da lib/progetto-card (puro), NON da lib/progetti: quest'ultimo importa
// lib/db.ts -> "server-only", che lancia se importato da un Client Component.
import {
  metaCardProgetti,
  SUPERFICIE_CARD,
  SUPERFICIE_CARD_SCURA,
  TESTO_TENUE_CARD,
  TRACCIA_CARD,
  TRACCIA_CARD_SCURA,
  RIEMPIMENTO_CARD,
  RIEMPIMENTO_CARD_SCURA,
  type ProgettoCardMeta,
} from "@/lib/progetto-card";

const PAGE_SIZE = 20;

const STATI: { value: StatoProgetto; label: string }[] = [
  { value: "PIANIFICATO", label: "Pianificato" },
  { value: "IN_CORSO", label: "In corso" },
  { value: "IN_PAUSA", label: "In pausa" },
  { value: "COMPLETATO", label: "Completato" },
  { value: "ANNULLATO", label: "Annullato" },
];

const INPUT_CLASS =
  "w-full rounded-full border border-crema-contorno bg-white py-2 px-4 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
const LABEL_CLASS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo";

// Pillola dei filtri nell'header. Fuori da qui il sito non la usa: e' locale
// alla sezione Progetti, come INPUT_CLASS.
const FILTRO_CLASS =
  "rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-medium text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";

interface FormProgetto {
  nome: string;
  descrizione: string;
  cliente_id: string;
  stato: StatoProgetto;
  priorita: "BASSA" | "MEDIA" | "ALTA";
  responsabile: string;
  data_inizio: string;
  data_fine: string;
  note: string;
}

const EMPTY_FORM: FormProgetto = {
  nome: "",
  descrizione: "",
  cliente_id: "",
  stato: "PIANIFICATO",
  priorita: "MEDIA",
  responsabile: "",
  data_inizio: "",
  data_fine: "",
  note: "",
};

export default function ProgettiPage() {
  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [q, setQ] = useState("");
  const [filtroStato, setFiltroStato] = useState<StatoProgetto | "TUTTI">("TUTTI");
  const [filtroCliente, setFiltroCliente] = useState("");

  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormProgetto>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [vista, setVista] = useState<"kanban" | "griglia">("kanban");
  // Segnale per il kanban, che carica i propri dati: va ricaricato dopo una
  // creazione o un'eliminazione, come la griglia.
  const [versione, setVersione] = useState(0);

  const requestSeq = useRef(0);

  const loadProgetti = useCallback(async () => {
    const seq = ++requestSeq.current;
    const params = new URLSearchParams({
      stato: filtroStato,
      q,
      pagina: String(pagina),
      paginaSize: String(PAGE_SIZE),
    });
    if (filtroCliente) params.set("cliente_id", filtroCliente);

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/progetti?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === requestSeq.current) {
        setProgetti((data.progetti ?? []) as ProgettoListRow[]);
        setTotale((data.totale ?? 0) as number);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [q, filtroStato, filtroCliente, pagina]);

  const loadClienti = useCallback(async () => {
    try {
      const res = await fetch("/api/clienti");
      if (res.ok) {
        const data = await res.json();
        setClienti((data.clienti ?? []) as Cliente[]);
      }
    } catch {
      // Ignora
    }
  }, []);

  useEffect(() => {
    loadProgetti();
  }, [loadProgetti]);

  useEffect(() => {
    loadClienti();
  }, [loadClienti]);

  const salva = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/progetti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          descrizione: form.descrizione || null,
          cliente_id: form.cliente_id,
          stato: form.stato,
          priorita: form.priorita,
          responsabile: form.responsabile || null,
          data_inizio: form.data_inizio || null,
          data_fine: form.data_fine || null,
          note: form.note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setPagina(1);
      loadProgetti();
      setVersione((v) => v + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const elimina = async (id: string) => {
    try {
      const res = await fetch(`/api/progetti/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Errore ${res.status}`);
      }
      setConfirmDeleteId(null);
      loadProgetti();
      setVersione((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di cancellazione.");
      setConfirmDeleteId(null);
    }
  };

  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));

  const VISTE = [
    { valore: "kanban", label: "Kanban", Icona: ColumnsIcon },
    { valore: "griglia", label: "Card", Icona: GridIcon },
  ] as const;
  const selettoreVista = (
    <div role="group" aria-label="Vista" className="flex rounded-full bg-crema-scuro p-1">
      {VISTE.map(({ valore, label, Icona }) => (
        <button
          key={valore}
          type="button"
          aria-pressed={vista === valore}
          onClick={() => setVista(valore)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold duration-200 ${
            vista === valore
              ? "bg-inchiostro text-white shadow-soft"
              : "text-caldo-testo hover:text-inchiostro"
          }`}
        >
          <Icona className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  // Tinte, percentuali e card in evidenza, calcolate una volta per render.
  const meta = metaCardProgetti(progetti);

  return (
    // La radice dipinge il proprio fondo crema, coerente con il body
    // (bg-crema in app/layout.tsx): la radice ha h-full, quindi copre la
    // pagina per intero.
    <div className="flex h-full flex-col bg-crema text-inchiostro">
      <header className="flex flex-wrap items-center gap-2.5 bg-crema px-6 py-4">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPagina(1);
            }}
            placeholder="Cerca progetti, codici o clienti…"
            className="w-full rounded-full border border-crema-contorno bg-white py-1.5 pl-10 pr-4 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          />
        </div>
        <select
          value={filtroStato}
          onChange={(e) => {
            setFiltroStato(e.target.value as StatoProgetto | "TUTTI");
            setPagina(1);
          }}
          // Nel kanban le colonne sono gia' la lente sullo stato: il filtro
          // si sommerebbe alle colonne e le svuoterebbe senza spiegazione.
          className={`${FILTRO_CLASS} ${vista === "kanban" ? "hidden" : ""}`}
        >
          <option value="TUTTI">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filtroCliente}
          onChange={(e) => {
            setFiltroCliente(e.target.value);
            setPagina(1);
          }}
          className={FILTRO_CLASS}
        >
          <option value="">Tutti i clienti</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ragione_sociale}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError("");
          }}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Nuovo progetto
        </button>
        {/* La pagina Progetti ha il proprio header (non AppHeader): il
            cronometro va comunque raggiungibile da qui, altrimenti il tempo
            generico si potrebbe avviare solo da alcune schermate. */}
        <CronometroHeader tema="chiaro" />
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-5">
        <PageHeader
          eyebrow="Area di lavoro"
          titolo="Progetti"
          // Mentre carica non si mostra "(0)": un conteggio a zero e' un dato,
          // uno zero provvisorio e' un'informazione falsa.
          conteggio={loading && totale === 0 ? undefined : totale}
          sottotitolo="Lavori organizzati per cliente, indipendenti dai ticket di assistenza."
        />

        {error && (
          <p className="mb-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
            {error}
          </p>
        )}

        {showForm && (
          <form onSubmit={salva} className="mb-6 rounded-card bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-inchiostro">Nuovo progetto</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={LABEL_CLASS}>Nome *</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className={INPUT_CLASS}
                  placeholder="Es. Migrazione server"
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Cliente *</label>
                <select
                  value={form.cliente_id}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                  className={INPUT_CLASS}
                  required
                >
                  <option value="">Seleziona un cliente…</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ragione_sociale}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Responsabile</label>
                <input
                  value={form.responsabile}
                  onChange={(e) => setForm({ ...form, responsabile: e.target.value })}
                  className={INPUT_CLASS}
                  placeholder="Nome operatore"
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Stato</label>
                <select
                  value={form.stato}
                  onChange={(e) =>
                    setForm({ ...form, stato: e.target.value as StatoProgetto })
                  }
                  className={INPUT_CLASS}
                >
                  {STATI.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Priorità</label>
                <select
                  value={form.priorita}
                  onChange={(e) =>
                    setForm({ ...form, priorita: e.target.value as FormProgetto["priorita"] })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="BASSA">Bassa</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Data inizio</label>
                <input
                  type="datetime-local"
                  value={form.data_inizio}
                  onChange={(e) => setForm({ ...form, data_inizio: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Data fine</label>
                <input
                  type="datetime-local"
                  value={form.data_fine}
                  onChange={(e) => setForm({ ...form, data_fine: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={LABEL_CLASS}>Descrizione</label>
                <textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  rows={2}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={LABEL_CLASS}>Note</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {formError && (
              <p className="mt-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
                {formError}
              </p>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-60"
              >
                {saving ? "Salvataggio…" : "Crea progetto"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                  setFormError("");
                }}
                className="rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {/* La barra sta FUORI dal ramo vuoto/pieno: altrimenti, con zero
            risultati in vista Card, il selettore sparirebbe e non si potrebbe
            tornare al kanban. */}
        <SectionBar titolo="Iniziative" conteggio={loading && totale === 0 ? undefined : totale}>
          {selettoreVista}
        </SectionBar>

        {vista === "kanban" ? (
          <ProgettiKanban q={q} clienteId={filtroCliente} versione={versione} />
        ) : progetti.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-caldo-testo">
              {loading ? "Caricamento progetti…" : "Nessun progetto trovato."}
            </p>
          </div>
        ) : (
          <>
            {/* La barra di sezione non esisteva: i filtri stavano in un header
                senza titolo e il conteggio totale solo in fondo alla pagina,
                dentro la paginazione. Qui non c'e' uno slot controlli perche'
                /api/progetti non accetta un parametro di ordinamento (l'ORDER BY
                e' fisso su data_aggiornamento DESC): un select "Ordina" sarebbe
                stato un controllo morto. */}

            {/* `auto-rows-fr` + `h-full` sulla card + `mt-auto` sul piede: senza
                questi, le righe della griglia avevano altezze diverse e il piede
                di ogni card restava a meta', invece che allineato al fondo. */}
            <div className="mt-5 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {progetti.map((p, i) => (
                <CardProgetto
                  key={p.id}
                  progetto={p}
                  meta={meta[i]}
                  confirmDelete={confirmDeleteId === p.id}
                  onAskDelete={() => setConfirmDeleteId(p.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => elimina(p.id)}
                />
              ))}
            </div>

            {totale > 0 && (
              <div className="mt-5 flex items-center justify-between">
                <span className="text-xs text-caldo-testo">
                  Pagina {pagina} di {pagine} · {totale} progetti
                </span>
                <div className="flex items-center gap-2">
                  {/* Icone SVG, non i glifi "‹" e "›": un carattere di testo non
                      ha il peso ottico delle icone dell'app, non eredita stroke
                      e colore, e su alcuni sistemi viene reso come emoji. */}
                  <button
                    type="button"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => p - 1)}
                    aria-label="Pagina precedente"
                    className="flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-semibold text-inchiostro transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-40"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5" />
                    Prec
                  </button>
                  <button
                    type="button"
                    disabled={pagina >= pagine}
                    onClick={() => setPagina((p) => p + 1)}
                    aria-label="Pagina successiva"
                    className="flex items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-xs font-semibold text-inchiostro transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-40"
                  >
                    Succ
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card di un progetto nella griglia
// ---------------------------------------------------------------------------

function CardProgetto({
  progetto: p,
  meta,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  progetto: ProgettoListRow;
  meta: ProgettoCardMeta | undefined;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const scura = meta?.inEvidenza ?? false;
  const tinta = meta?.tinta ?? "bianco";
  const perc = meta?.percentuale ?? null;

  const tenue = scura ? "text-white/65" : TESTO_TENUE_CARD[tinta];

  return (
    <div
      className={`group relative flex h-full flex-col rounded-card p-5 transition ${
        scura ? SUPERFICIE_CARD_SCURA : SUPERFICIE_CARD[tinta]
      }`}
    >
      {/* Riga alta: chip icona a sinistra, codice e freccia a destra */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            scura ? "bg-white/10 text-white" : "bg-white/70 text-inchiostro"
          }`}
        >
          <FolderIcon className="h-4 w-4" />
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold tracking-wide ${tenue}`}>{p.codice}</span>
          <ArrowRightIcon
            className={`h-4 w-4 transition group-hover:translate-x-0.5 ${
              scura ? "text-white/70" : "text-inchiostro/50"
            }`}
          />
        </div>
      </div>

      {/* Testo: il link copre la card, cosi' tutta la superficie e' cliccabile */}
      <Link href={`/progetti/${p.id}`} className="mt-4 block focus-visible:outline-none">
        <span className="sr-only">Apri il progetto {p.nome}</span>
        <p className={`truncate text-[11px] font-semibold uppercase tracking-wider ${tenue}`}>
          {p.cliente_ragione_sociale}
          {p.responsabile ? ` · ${p.responsabile}` : ""}
        </p>
        <h2
          className={`mt-1.5 line-clamp-2 text-lg font-bold leading-snug ${
            scura ? "text-white" : "text-inchiostro"
          }`}
        >
          {p.nome}
        </h2>
        {p.descrizione && (
          <p className={`mt-1.5 line-clamp-2 text-sm ${tenue}`}>{p.descrizione}</p>
        )}
      </Link>

      {/* Avanzamento */}
      <div className={`mt-4 border-t pt-3 ${scura ? "border-white/10" : "border-crema-bordo"}`}>
        {perc === null ? (
          <p className={`text-xs ${tenue}`}>Nessuna attività</p>
        ) : (
          <>
            {/* Il contrasto di scala e' il punto: la percentuale e' il dato che
                si cerca, il conteggio delle attivita' lo spiega. Prima erano
                due `text-xs` identici, quindi l'occhio non sapeva da dove
                partire. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[11px] font-medium ${tenue}`}>
                {meta?.completate} / {meta?.totali} attività
              </span>
              <span
                className={`tabular text-sm font-bold ${
                  scura ? "text-white" : "text-inchiostro"
                }`}
              >
                {perc}%
              </span>
            </div>
            <div
              className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${
                scura ? TRACCIA_CARD_SCURA : TRACCIA_CARD
              }`}
              role="progressbar"
              aria-valuenow={perc}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Avanzamento del progetto ${p.nome}`}
            >
              <div
                className={`h-full rounded-full ${
                  scura ? RIEMPIMENTO_CARD_SCURA : RIEMPIMENTO_CARD
                }`}
                style={{ width: `${perc}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Piede: badge + scadenza + azioni. `mt-auto` lo spinge al fondo della
          card, cosi' su una riga di card di altezza diversa i piedi restano
          allineati invece di ballare a meta' altezza. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-4">
        {/* PriorityBadge e' condiviso con dashboard/calendario/ticket e non
            ha una variante scura: sulla card in evidenza si usa la stessa
            ricetta del kit applicata a una tinta chiara traslucida, per non
            toccare le mappe condivise. */}
        {scura ? (
          <span className={chip("border-white/20 bg-white/10 text-white", { taglia: "md" })}>
            {p.priorita}
          </span>
        ) : (
          <PriorityBadge priorita={p.priorita} />
        )}
        <ProgettoStatusBadge stato={p.stato} scuro={scura} />

        {p.data_fine && (
          <span className={`text-[11px] font-medium ${tenue}`}>
            {formatData(p.data_fine)}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="rounded-full bg-pericolo px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-pericolo-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pericolo focus-visible:ring-offset-2"
              >
                Elimina
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  scura
                    ? "text-white/80 hover:bg-white/10 focus-visible:ring-white"
                    : "text-caldo-testo hover:bg-inchiostro/5 focus-visible:ring-inchiostro"
                }`}
              >
                Annulla
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAskDelete}
              title="Elimina progetto"
              aria-label={`Elimina il progetto ${p.nome}`}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                scura
                  ? "text-white/60 hover:bg-pericolo/20 hover:text-white focus-visible:ring-white"
                  : "text-caldo-testo hover:bg-stato-urgenza-bg hover:text-pericolo focus-visible:ring-inchiostro"
              }`}
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
