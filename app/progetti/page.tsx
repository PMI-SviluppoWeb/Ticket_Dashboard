"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { useDebounce } from "@/lib/useDebounce";
import { caricaApi, datoImmediato } from "@/lib/api-cache";
import CronometroHeader from "@/components/CronometroHeader";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ColumnsIcon,
  FolderIcon,
  GridIcon,
  InfoIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { formatData } from "@/lib/calendario";
import { componiPersone, tutteLePersone } from "@/lib/persone";
import PersoneCondivise from "@/components/PersoneCondivise";
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
// Variante di INPUT_CLASS con padding destro fisso: px-4 sovrascriverebbe un
// pl-10 aggiunto a valle, quindi l'icona a sinistra va costruita cosi'.
const INPUT_ICON_CLASS = INPUT_CLASS.replace(" px-4", " pr-4");
const LABEL_CLASS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-caldo-testo";

// Pillola priorita': il pallino usa la famiglia colore del design system
// (bassa=ok, media=attesa, alta=urgenza), come PriorityBadge.
const PRIORITA_PILL: Record<
  "BASSA" | "MEDIA" | "ALTA",
  { label: string; pallino: string; attiva: string }
> = {
  BASSA: {
    label: "Bassa",
    pallino: "bg-stato-ok",
    attiva: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  },
  MEDIA: {
    label: "Media",
    pallino: "bg-stato-attesa",
    attiva: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  },
  ALTA: {
    label: "Alta",
    pallino: "bg-stato-urgenza",
    attiva: "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo",
  },
};

// Iniziali per gli avatar del team (max due lettere).
function iniziali(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
}

// Giorni feriali inclusi fra due date datetime-local (sabato e domenica
// esclusi). 0 se le date mancano o sono invertite.
function giorniLavorativi(inizio: string, fine: string): number {
  const a = new Date(inizio).getTime();
  const b = new Date(fine).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  let n = 0;
  for (let t = new Date(a); t.getTime() <= b; t.setDate(t.getDate() + 1)) {
    const giorno = t.getDay();
    if (giorno !== 0 && giorno !== 6) n++;
  }
  return n;
}

// Voce minima dell'elenco operatori (GET /api/operatori): basta nome e ruolo
// per le ricerche della modale.
interface OperatoreVoce {
  id: string;
  nome: string;
  ruolo: "admin" | "operatore";
}

// Titolo di sezione nella modale: bullet d'accento + maiuscolo tracciato.
function TitoloSezione({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-inchiostro">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lime" />
      {children}
    </p>
  );
}

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
  persone: string[];
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
  persone: [],
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

  // Elenco operatori per la sezione Team: i campi non accettano testo libero.
  const [operatori, setOperatori] = useState<OperatoreVoce[]>([]);
  const [operatoriOk, setOperatoriOk] = useState(false);

  // Tre combobox della modale: testo digitato + stato del relativo dropdown.
  const [testoCliente, setTestoCliente] = useState("");
  const [dropdownCliente, setDropdownCliente] = useState(false);
  const [testoResponsabile, setTestoResponsabile] = useState("");
  const [dropdownResponsabile, setDropdownResponsabile] = useState(false);
  const [testoPersone, setTestoPersone] = useState("");
  const [dropdownPersone, setDropdownPersone] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [vista, setVista] = useState<"kanban" | "griglia">("kanban");
  // Segnale per il kanban, che carica i propri dati: va ricaricato dopo una
  // creazione o un'eliminazione, come la griglia.
  const [versione, setVersione] = useState(0);

  const requestSeq = useRef(0);

  // La ricerca parte quando l'utente smette di scrivere: senza, ogni carattere
  // era una richiesta HTTP (e due LIKE sul DB remoto).
  const qDebounce = useDebounce(q, 250);

  const loadProgetti = useCallback(
    async (forza = false) => {
      const seq = ++requestSeq.current;
      const params = new URLSearchParams({
        stato: filtroStato,
        q: qDebounce,
        pagina: String(pagina),
        paginaSize: String(PAGE_SIZE),
      });
      if (filtroCliente) params.set("cliente_id", filtroCliente);
      const url = `/api/progetti?${params.toString()}`;

      // Dato gia' visto: si mostra subito, la richiesta parte comunque.
      const subito = datoImmediato<{ progetti: ProgettoListRow[]; totale: number }>(url);
      if (subito) {
        setProgetti(subito.progetti ?? []);
        setTotale(subito.totale ?? 0);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await caricaApi<{ progetti: ProgettoListRow[]; totale: number }>(url, { forza });
        if (seq === requestSeq.current) {
          setProgetti(data.progetti ?? []);
          setTotale(data.totale ?? 0);
        }
      } catch (err) {
        if (seq === requestSeq.current) {
          setError(err instanceof Error ? err.message : "Errore di caricamento.");
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [qDebounce, filtroStato, filtroCliente, pagina]
  );

  const loadClienti = useCallback(async () => {
    try {
      const data = await caricaApi<{ clienti: Cliente[] }>("/api/clienti");
      setClienti(data.clienti ?? []);
    } catch {
      // Ignora
    }
  }, []);

  useEffect(() => {
    // Nel kanban la lista e' caricata dal kanban stesso: eseguire anche questa
    // significava la stessa query due volte a ogni apertura e a ogni tasto.
    if (vista !== "griglia") return;
    loadProgetti();
  }, [loadProgetti, vista]);

  // Il kanban riporta il proprio totale: cosi' la barra di sezione ha il
  // numero anche quando la lista della griglia non viene caricata.
  const onTotaleKanban = useCallback((n: number) => {
    setTotale(n);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClienti();
  }, [loadClienti]);

  // Gli operatori servono solo quando la modale e' aperta: caricati una volta,
  // `caricaApi` li tiene in cache 30 secondi e li condivide con gli altri
  // componenti della pagina.
  useEffect(() => {
    if (!showForm || operatoriOk) return;
    let annullato = false;
    caricaApi<{ operatori: OperatoreVoce[] }>("/api/operatori")
      .then((d) => {
        if (!annullato) setOperatori(d.operatori ?? []);
      })
      .catch(() => {
        // Senza elenco i campi restano vuoti: il messaggio nel dropdown
        // spiega che non c'e' nessun operatore disponibile.
      })
      .finally(() => {
        if (!annullato) setOperatoriOk(true);
      });
    return () => {
      annullato = true;
    };
  }, [showForm, operatoriOk]);

  const salva = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError("");
    // Il cliente e' una combobox: il campo di testo non ha `required` perche'
    // qualsiasi testo lo supererebbe, controlla quindi l'id selezionato.
    if (!form.cliente_id) {
      setFormError("Seleziona un cliente dall'elenco.");
      return;
    }
    setSaving(true);
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
          persone: form.persone,
          data_inizio: form.data_inizio || null,
          data_fine: form.data_fine || null,
          note: form.note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      resetCombobox();
      setPagina(1);
      // Nel kanban ci pensa `versione`: caricare anche qui sarebbe una query
      // per una lista che nessuno sta guardando.
      if (vista === "griglia") loadProgetti();
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
      if (vista === "griglia") loadProgetti();
      setVersione((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di cancellazione.");
      setConfirmDeleteId(null);
    }
  };

  // Persone modificate dalla card: stesso aggiornamento ottimistico del kanban,
  // cosi' l'avatar compare prima della risposta e sparisce se il server rifiuta.
  // Il primo nome va in `responsabile` (colonna storica), gli altri in `persone`.
  const cambiaPersone = useCallback(
    async (id: string, elenco: string[]) => {
      const precedente = progetti.find((p) => p.id === id);
      if (!precedente) return;
      const { primario, persone } = componiPersone(elenco[0] ?? null, elenco.slice(1));
      setProgetti((lista) =>
        lista.map((p) => (p.id === id ? { ...p, responsabile: primario, persone } : p))
      );
      setError("");
      try {
        const res = await fetch(`/api/progetti/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responsabile: primario, persone }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setProgetti((lista) =>
          lista.map((p) =>
            p.id === id
              ? {
                  ...p,
                  responsabile: precedente.responsabile,
                  persone: precedente.persone,
                }
              : p
          )
        );
        setError("Persone non salvate. Riprova.");
      }
    },
    [progetti]
  );

  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));

  // Stima della durata mostrata nel cronoprogramma della modale.
  const stimaGiorni = giorniLavorativi(form.data_inizio, form.data_fine);

  // --- Combobox della modale ------------------------------------------------
  // Solo le scelte contano: il testo digitato e' un filtro, mai un valore.

  const clienteSel = clienti.find((c) => c.id === form.cliente_id) ?? null;

  const qCliente = testoCliente.trim().toLowerCase();
  const clientiFiltrati = qCliente
    ? clienti.filter(
        (c) =>
          c.ragione_sociale.toLowerCase().includes(qCliente) ||
          (c.partita_iva ?? "").includes(qCliente)
      )
    : clienti;

  const qResponsabile = testoResponsabile.trim().toLowerCase();
  const responsabiliFiltrati = operatori.filter((o) =>
    o.nome.toLowerCase().includes(qResponsabile)
  );

  const qPersone = testoPersone.trim().toLowerCase();
  const personeFiltrate = operatori.filter(
    (o) =>
      o.nome.toLowerCase().includes(qPersone) &&
      o.nome.toLowerCase() !== (form.responsabile || "").trim().toLowerCase() &&
      !form.persone.some((p) => p.toLowerCase() === o.nome.toLowerCase())
  );

  const scegliCliente = (c: Cliente) => {
    setForm({ ...form, cliente_id: c.id });
    setTestoCliente(c.ragione_sociale);
    setDropdownCliente(false);
  };

  const scegliResponsabile = (o: OperatoreVoce) => {
    // Se era anche tra i collaboratori, resta solo responsabile: due ruoli
    // sullo stesso nome produrrebbero un doppione in fase di salvataggio.
    setForm({
      ...form,
      responsabile: o.nome,
      persone: form.persone.filter((p) => p.toLowerCase() !== o.nome.toLowerCase()),
    });
    setTestoResponsabile(o.nome);
    setDropdownResponsabile(false);
  };

  const aggiungiPersona = (nome: string) => {
    const pulito = nome.trim();
    if (!pulito) return;
    if (pulito.toLowerCase() === (form.responsabile || "").trim().toLowerCase()) return;
    if (form.persone.some((p) => p.toLowerCase() === pulito.toLowerCase())) return;
    setForm({ ...form, persone: [...form.persone, pulito] });
    setTestoPersone("");
    setDropdownPersone(false);
  };

  // Azzera testi e dropdown delle tre combobox della modale.
  const resetCombobox = () => {
    setTestoCliente("");
    setDropdownCliente(false);
    setTestoResponsabile("");
    setDropdownResponsabile(false);
    setTestoPersone("");
    setDropdownPersone(false);
  };

  const chiudiForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    resetCombobox();
    setFormError("");
  };

  // ESC chiude la modale di creazione.
  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudiForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

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
            setShowForm(true);
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-inchiostro/40 px-4 py-6"
            onMouseDown={(e) => {
              // Solo il click sullo sfondo chiude: uno sul contenuto non deve
              // propagare fino all'overlay.
              if (e.target === e.currentTarget) chiudiForm();
            }}
          >
            <form
              onSubmit={salva}
              role="dialog"
              aria-modal="true"
              aria-label="Nuovo progetto"
              className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-white shadow-soft"
            >
              {/* Intestazione */}
              <div className="flex items-start justify-between gap-4 border-b border-crema-bordo px-6 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stato-info-bg">
                    <FolderIcon className="h-5 w-5 text-stato-info-testo" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-inchiostro">Nuovo progetto</h2>
                      <span className="rounded-full border border-stato-neutro-bordo bg-stato-neutro-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stato-neutro-testo">
                        Bozza
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-caldo-testo">
                      Configura i dettagli operativi, assegna il team e pianifica le scadenze.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={chiudiForm}
                  aria-label="Chiudi"
                  className="shrink-0 cursor-pointer rounded p-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Corpo scrollabile */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {/* Informazioni generali */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <TitoloSezione>Informazioni generali</TitoloSezione>
                    <span className="shrink-0 text-[11px] text-caldo-testo">
                      <span className="font-bold text-stato-urgenza-testo">*</span> campi
                      obbligatori
                    </span>
                  </div>
                  <div>
                    <label htmlFor="np-nome" className={LABEL_CLASS}>
                      Nome *
                    </label>
                    <div className="relative">
                      <FolderIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
                      <input
                        id="np-nome"
                        value={form.nome}
                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                        className={`${INPUT_ICON_CLASS} pl-10`}
                        placeholder="Es. Migrazione server"
                        required
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label htmlFor="np-cliente" className={LABEL_CLASS}>
                      Cliente *
                    </label>
                    <div className="relative">
                      <input
                        id="np-cliente"
                        role="combobox"
                        aria-expanded={dropdownCliente}
                        aria-controls="np-lista-clienti"
                        aria-autocomplete="list"
                        autoComplete="off"
                        value={testoCliente}
                        onFocus={() => setDropdownCliente(true)}
                        // Riprende il menu dopo che un ESC l'ha chiuso (con il
                        // focus ancora sul campo, onFocus non ricorre).
                        onClick={() => setDropdownCliente(true)}
                        onChange={(e) => {
                          setTestoCliente(e.target.value);
                          setDropdownCliente(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && dropdownCliente) {
                            // Chiude prima il dropdown: l'ESC della modale sta
                            // su window in bubbling, e stopPropagation lo ferma.
                            e.stopPropagation();
                            setDropdownCliente(false);
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (clientiFiltrati.length > 0) scegliCliente(clientiFiltrati[0]);
                          }
                        }}
                        onBlur={() => {
                          // Solo la selezione conta: un testo scritto a mano
                          // torna al cliente scelto (o si azzera).
                          setDropdownCliente(false);
                          setTestoCliente(clienteSel?.ragione_sociale ?? "");
                        }}
                        placeholder="Cerca o seleziona un cliente…"
                        className={`${INPUT_ICON_CLASS} pl-10 pr-9`}
                      />
                      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
                      {clienteSel && (
                        <button
                          type="button"
                          aria-label="Azzera cliente"
                          // Prima del blur: il click deve arrivare, non solo
                          // chiudere il dropdown.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setForm({ ...form, cliente_id: "" });
                            setTestoCliente("");
                            setDropdownCliente(true);
                          }}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-caldo-testo transition hover:bg-crema-scuro hover:text-inchiostro"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {dropdownCliente && (
                      <ul
                        id="np-lista-clienti"
                        role="listbox"
                        aria-label="Clienti"
                        className="absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-y-auto rounded-control border border-crema-contorno bg-white py-1 shadow-soft"
                      >
                        {clientiFiltrati.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-caldo-testo">
                            Nessun cliente trovato.
                          </li>
                        ) : (
                          clientiFiltrati.map((c) => (
                            <li key={c.id} role="option" aria-selected={c.id === form.cliente_id}>
                              <button
                                type="button"
                                // Prima del blur: il click sull'opzione deve
                                // arrivare, non limitarsi a chiudere il menu.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => scegliCliente(c)}
                                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition hover:bg-crema-scuro ${
                                  c.id === form.cliente_id ? "font-semibold text-inchiostro" : "text-inchiostro"
                                }`}
                              >
                                <span className="truncate">{c.ragione_sociale}</span>
                                {c.partita_iva && (
                                  <span className="shrink-0 text-[10px] text-caldo-testo">
                                    P.IVA {c.partita_iva}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                </section>

                {/* Team & governance */}
                <section className="space-y-3 border-t border-crema-bordo pt-5">
                  <TitoloSezione>Team &amp; governance di progetto</TitoloSezione>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <label htmlFor="np-responsabile" className={LABEL_CLASS}>
                        Responsabile primario
                      </label>
                      <div className="relative">
                        <input
                          id="np-responsabile"
                          role="combobox"
                          aria-expanded={dropdownResponsabile}
                          aria-controls="np-lista-responsabile"
                          aria-autocomplete="list"
                          autoComplete="off"
                          disabled={!operatoriOk}
                          value={testoResponsabile}
                          onFocus={() => setDropdownResponsabile(true)}
                          onClick={() => setDropdownResponsabile(true)}
                          onChange={(e) => {
                            setTestoResponsabile(e.target.value);
                            setDropdownResponsabile(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape" && dropdownResponsabile) {
                              e.stopPropagation();
                              setDropdownResponsabile(false);
                            }
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (responsabiliFiltrati.length > 0) {
                                scegliResponsabile(responsabiliFiltrati[0]);
                              }
                            }
                          }}
                          onBlur={() => {
                            setDropdownResponsabile(false);
                            setTestoResponsabile(form.responsabile);
                          }}
                          placeholder={
                            operatoriOk ? "Cerca un operatore…" : "Caricamento operatori…"
                          }
                          className={`${INPUT_CLASS} ${form.responsabile ? "pr-11" : ""}`}
                        />
                        {iniziali(form.responsabile) && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-stato-neutro-bg text-[10px] font-bold text-stato-neutro-testo"
                          >
                            {iniziali(form.responsabile)}
                          </span>
                        )}
                      </div>
                      {dropdownResponsabile && operatoriOk && (
                        <ul
                          id="np-lista-responsabile"
                          role="listbox"
                          aria-label="Operatori"
                          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-y-auto rounded-control border border-crema-contorno bg-white py-1 shadow-soft"
                        >
                          {responsabiliFiltrati.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-caldo-testo">
                              Nessun operatore trovato.
                            </li>
                          ) : (
                            responsabiliFiltrati.map((o) => (
                              <li key={o.id} role="option" aria-selected={o.nome === form.responsabile}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => scegliResponsabile(o)}
                                  className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition hover:bg-crema-scuro ${
                                    o.nome === form.responsabile ? "font-semibold text-inchiostro" : "text-inchiostro"
                                  }`}
                                >
                                  <span className="truncate">{o.nome}</span>
                                  <span className="shrink-0 text-[10px] text-caldo-testo">
                                    {o.ruolo === "admin" ? "Admin" : "Operatore"}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                    <div className="relative">
                      <label htmlFor="np-persone" className={LABEL_CLASS}>
                        Collaboratori assegnati
                      </label>
                      <div className="rounded-control border border-crema-contorno bg-white px-2.5 py-2 transition focus-within:border-inchiostro focus-within:ring-1 focus-within:ring-inchiostro">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {form.persone.map((p) => (
                            <span
                              key={p}
                              className="flex items-center gap-1.5 rounded-full bg-crema-scuro py-1 pl-1 pr-2 text-xs font-medium text-inchiostro"
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stato-neutro-bg text-[9px] font-bold text-stato-neutro-testo">
                                {iniziali(p)}
                              </span>
                              {p}
                              <button
                                type="button"
                                aria-label={`Rimuovi ${p}`}
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    persone: form.persone.filter((x) => x !== p),
                                  })
                                }
                                className="cursor-pointer text-caldo-testo transition-colors hover:text-inchiostro"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            id="np-persone"
                            role="combobox"
                            aria-expanded={dropdownPersone}
                            aria-controls="np-lista-persone"
                            aria-autocomplete="list"
                            autoComplete="off"
                            disabled={!operatoriOk}
                            value={testoPersone}
                            onFocus={() => setDropdownPersone(true)}
                            onClick={() => setDropdownPersone(true)}
                            onChange={(e) => {
                              setTestoPersone(e.target.value);
                              setDropdownPersone(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape" && dropdownPersone) {
                                e.stopPropagation();
                                setDropdownPersone(false);
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (personeFiltrate.length > 0) {
                                  aggiungiPersona(personeFiltrate[0].nome);
                                }
                              }
                            }}
                            onBlur={() => {
                              setDropdownPersone(false);
                              setTestoPersone("");
                            }}
                            placeholder={
                              operatoriOk ? "Cerca un operatore…" : "Caricamento operatori…"
                            }
                            className="min-w-[9rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-inchiostro placeholder:text-caldo-testo focus:outline-none disabled:cursor-wait"
                          />
                        </div>
                      </div>
                      {dropdownPersone && operatoriOk && (
                        <ul
                          id="np-lista-persone"
                          role="listbox"
                          aria-label="Operatori disponibili"
                          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-y-auto rounded-control border border-crema-contorno bg-white py-1 shadow-soft"
                        >
                          {personeFiltrate.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-caldo-testo">
                              {operatori.length === 0
                                ? "Nessun operatore disponibile."
                                : "Nessun operatore trovato."}
                            </li>
                          ) : (
                            personeFiltrate.map((o) => (
                              <li key={o.id} role="option">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => aggiungiPersona(o.nome)}
                                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-sm text-inchiostro transition hover:bg-crema-scuro"
                                >
                                  <span className="truncate">{o.nome}</span>
                                  <span className="shrink-0 text-[10px] text-caldo-testo">
                                    {o.ruolo === "admin" ? "Admin" : "Operatore"}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>

                {/* Stato e urgenza */}
                <section className="space-y-3 border-t border-crema-bordo pt-5">
                  <TitoloSezione>Stato e urgenza operativa</TitoloSezione>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className={LABEL_CLASS}>Stato</p>
                      <div
                        role="group"
                        aria-label="Stato"
                        className="flex flex-wrap gap-1 rounded-full bg-crema-scuro p-1"
                      >
                        {STATI.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            aria-pressed={form.stato === s.value}
                            onClick={() => setForm({ ...form, stato: s.value })}
                            className={`flex-1 cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition duration-200 ${
                              form.stato === s.value
                                ? "bg-inchiostro text-white shadow-soft"
                                : "text-caldo-testo hover:text-inchiostro"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className={LABEL_CLASS}>Priorità</p>
                      <div
                        role="group"
                        aria-label="Priorità"
                        className="flex flex-wrap gap-2 rounded-control border border-crema-contorno bg-white p-1.5"
                      >
                        {(Object.keys(PRIORITA_PILL) as Array<FormProgetto["priorita"]>).map(
                          (p) => {
                            const pill = PRIORITA_PILL[p];
                            const attiva = form.priorita === p;
                            return (
                              <button
                                key={p}
                                type="button"
                                aria-pressed={attiva}
                                onClick={() => setForm({ ...form, priorita: p })}
                                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-semibold transition duration-200 ${
                                  attiva
                                    ? pill.attiva
                                    : "border-crema-contorno text-caldo-testo hover:text-inchiostro"
                                }`}
                              >
                                <span
                                  aria-hidden
                                  className={`h-1.5 w-1.5 rounded-full ${pill.pallino}`}
                                />
                                {pill.label}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Cronoprogramma */}
                <section className="space-y-3 border-t border-crema-bordo pt-5">
                  <TitoloSezione>Cronoprogramma &amp; durata lavorativa</TitoloSezione>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="np-inizio" className={LABEL_CLASS}>
                        Data inizio
                      </label>
                      <div className="relative">
                        <CalendarIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
                        <input
                          id="np-inizio"
                          type="datetime-local"
                          value={form.data_inizio}
                          onChange={(e) => setForm({ ...form, data_inizio: e.target.value })}
                          className={`${INPUT_ICON_CLASS} pl-10`}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="np-fine" className={LABEL_CLASS}>
                        Data fine
                      </label>
                      <div className="relative">
                        <CalendarIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-caldo-testo" />
                        <input
                          id="np-fine"
                          type="datetime-local"
                          value={form.data_fine}
                          onChange={(e) => setForm({ ...form, data_fine: e.target.value })}
                          className={`${INPUT_ICON_CLASS} pl-10`}
                        />
                      </div>
                    </div>
                  </div>
                  {stimaGiorni > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-stato-info-bordo bg-stato-info-bg px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-stato-info-testo">
                        <InfoIcon className="h-4 w-4 shrink-0" />
                        <span>
                          Stima pianificata:{" "}
                          <strong className="font-bold">{stimaGiorni}</strong> giorni
                          lavorativi (esclusi i weekend)
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-stato-info-testo">
                        ~{stimaGiorni * 8} Ore Uomo
                      </span>
                    </div>
                  )}
                </section>

                {/* Dettagli e note */}
                <section className="space-y-3 border-t border-crema-bordo pt-5">
                  <TitoloSezione>Dettagli tecnici &amp; note operative</TitoloSezione>
                  <div>
                    <label htmlFor="np-descrizione" className={LABEL_CLASS}>
                      Descrizione
                    </label>
                    <textarea
                      id="np-descrizione"
                      value={form.descrizione}
                      onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                      rows={2}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="np-note" className={LABEL_CLASS}>
                      Note
                    </label>
                    <textarea
                      id="np-note"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      rows={2}
                      className={INPUT_CLASS}
                    />
                  </div>
                </section>

                {formError && (
                  <p className="mt-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
                    {formError}
                  </p>
                )}
              </div>

              {/* Piè di pagina */}
              <div className="flex items-center justify-between gap-3 border-t border-crema-bordo px-6 py-4">
                <p className="hidden text-xs text-caldo-testo sm:block">
                  I campi con{" "}
                  <span className="font-bold text-stato-urgenza-testo">*</span> sono
                  obbligatori
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={chiudiForm}
                    className="rounded-full border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition hover:bg-crema-scuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-full bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition hover:bg-inchiostro-profondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro focus-visible:ring-offset-2 focus-visible:ring-offset-crema disabled:opacity-60"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {saving ? "Salvataggio…" : "Crea progetto"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* La barra sta FUORI dal ramo vuoto/pieno: altrimenti, con zero
            risultati in vista Card, il selettore sparirebbe e non si potrebbe
            tornare al kanban. */}
        <SectionBar titolo="Iniziative" conteggio={loading && totale === 0 ? undefined : totale}>
          {selettoreVista}
        </SectionBar>

        {vista === "kanban" ? (
          <ProgettiKanban
            q={qDebounce}
            clienteId={filtroCliente}
            versione={versione}
            onTotale={onTotaleKanban}
          />
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
                  onCambiaPersone={(persone) => cambiaPersone(p.id, persone)}
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
  onCambiaPersone,
}: {
  progetto: ProgettoListRow;
  meta: ProgettoCardMeta | undefined;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onCambiaPersone: (persone: string[]) => void;
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

      {/* Testo: il link copre solo il blocco testuale. Sotto ci sono la barra
          di avanzamento e le persone, che non devono navigare. */}
      <Link href={`/progetti/${p.id}`} className="mt-4 block focus-visible:outline-none">
        <span className="sr-only">Apri il progetto {p.nome}</span>
        <p className={`truncate text-[11px] font-semibold uppercase tracking-wider ${tenue}`}>
          {p.cliente_ragione_sociale}
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

      {/* Persone: FUORI dal link, perche' un bottone dentro un <a> non e'
          valido e il click aprirebbe il progetto invece dell'editor. Prende il
          posto del nome del responsabile che stava nella riga del cliente: qui
          si vedono tutti, e si possono cambiare. */}
      <div className="mt-3">
        <PersoneCondivise
          persone={tutteLePersone(p.responsabile, p.persone)}
          onCambia={onCambiaPersone}
          titolo={`Persone sul progetto ${p.nome}`}
          vuoto="Aggiungi persone"
          mostraNomi
          tono={scura ? "scuro" : "chiaro"}
        />
      </div>

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
