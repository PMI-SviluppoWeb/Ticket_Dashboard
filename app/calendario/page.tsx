"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  Cliente,
  ConfigGoogle,
  EventoCalendario,
  GoogleModalita,
  OrigineEvento,
  ProgettoListRow,
  StatoAttivita,
} from "@/lib/types";
import { PriorityBadge } from "@/components/badges";
import AppHeader from "@/components/AppHeader";
import PageHeader from "@/components/PageHeader";
import SectionBar from "@/components/SectionBar";
import { ORIGINI, ORIGINI_LABELS, TIMEZONE_DEFAULT } from "@/lib/google-evento";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/icons";
import {
  ORIGINE_LABELS,
  ORIGINE_STYLES,
  VISTE,
  chiaveGiorno,
  etichettaGiorno,
  etichettaOrigine,
  etichettaPeriodo,
  formatOra,
  giorniOrdinati,
  giorniSettimana,
  grigliaMese,
  origineEvento,
  raggruppaPerGiorno,
  rangeVista,
  spostaAnchor,
  type VistaCalendario,
} from "@/lib/calendario";

const GIORNI_BREVI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const STATI_ATTIVITA_OPTIONS: { value: StatoAttivita; label: string }[] = [
  { value: "DA_FARE", label: "Da fare" },
  { value: "IN_CORSO", label: "In corso" },
  { value: "COMPLETATA", label: "Completata" },
];

const INPUT_CLASS =
  "w-full rounded-control border border-crema-contorno bg-white py-1.5 px-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-wider text-caldo-testo";

interface FormEvento {
  titolo: string;
  descrizione: string;
  cliente_id: string;
  stato: StatoAttivita;
  priorita: "BASSA" | "MEDIA" | "ALTA";
  data_inizio: string;
  data_scadenza: string;
  assegnatario: string;
}

// Risposta di GET /api/google/stato
interface StatoGoogle {
  configurato: boolean;
  completo: boolean;
  abilitato: boolean;
  modalita: GoogleModalita;
  mappatura: Partial<Record<OrigineEvento, string>>;
  calendario_default: string;
  timezone: string;
  finestra_giorni: number;
  conteggi: {
    sincronizzati: number;
    in_errore: number;
    da_cancellare: number;
    mai_sincronizzati: number;
  };
  errori: {
    attivita_id: string;
    titolo: string | null;
    progetto_id: string | null;
    ultimo_errore: string | null;
    tentativi: number;
  }[];
}

interface CalendarioGoogle {
  id: string;
  summary: string;
}

const EMPTY_FORM: FormEvento = {
  titolo: "",
  descrizione: "",
  cliente_id: "",
  stato: "DA_FARE",
  priorita: "MEDIA",
  data_inizio: "",
  data_scadenza: "",
  assegnatario: "",
};

// Puntino di stato Google nel chip: il badge testuale affollerebbe le celle
// del mese, quindi qui basta il colore, con il dettaglio nel title.
//
// Il puntino usa il TESTO della famiglia semantica, non il fondo: -testo e'
// la tinta satura e scura (#1D5C39, #8E2B22, #7A4A0B), unica a reggere come
// elemento grafico su superficie chiara. Con -bg il puntino sarebbe quasi
// invisibile. PENDENTE e DA_CANCELLARE condividono l'attesa perche' erano
// gia' lo stesso ambra: la distinzione resta nel title.
const GOOGLE_DOT: Record<string, string> = {
  SINCRONIZZATO: "bg-stato-ok-testo",
  ERRORE: "bg-stato-urgenza-testo",
  PENDENTE: "bg-stato-attesa-testo",
  DA_CANCELLARE: "bg-stato-attesa-testo",
};

const GOOGLE_DOT_LABEL: Record<string, string> = {
  SINCRONIZZATO: "sincronizzato su Google",
  ERRORE: "errore di sincronizzazione Google",
  PENDENTE: "da sincronizzare su Google",
  DA_CANCELLARE: "da rimuovere da Google",
};

function ChipEvento({ e }: { e: EventoCalendario }) {
  const origine: OrigineEvento = origineEvento(e);
  const classe = `block truncate rounded-control border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 ${ORIGINE_STYLES[origine]}`;
  const google = e.google_stato ? ` · ${GOOGLE_DOT_LABEL[e.google_stato]}` : "";
  const titolo = `${e.titolo} — ${etichettaOrigine(e)}${e.data_scadenza ? ` (${formatOra(e.data_scadenza)})` : ""}${google}`;
  const dot = e.google_stato ? GOOGLE_DOT[e.google_stato] : null;

  if (e.progetto_id) {
    return (
      <Link
        href={`/progetti/${e.progetto_id}`}
        className={`${classe} flex cursor-pointer items-center gap-1`}
        title={titolo}
      >
        {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
        <span className="truncate">{e.titolo}</span>
      </Link>
    );
  }
  return (
    <span className={`${classe} flex items-center gap-1`} title={titolo}>
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      <span className="truncate">{e.titolo}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pannello di configurazione Google, inline come il form evento (nel repo non
// esistono modali).
// ---------------------------------------------------------------------------

function PannelloGoogle({
  stato,
  config,
  setConfig,
  setMappatura,
  calendari,
  avviso,
  errore,
  esito,
  saving,
  syncing,
  verifica,
  onSalva,
  onSincronizza,
  onVerifica,
  onChiudi,
}: {
  stato: StatoGoogle | null;
  config: ConfigGoogle | null;
  setConfig: React.Dispatch<React.SetStateAction<ConfigGoogle | null>>;
  setMappatura: (origine: OrigineEvento, valore: string) => void;
  calendari: CalendarioGoogle[];
  avviso: string;
  errore: string;
  esito: string;
  saving: boolean;
  syncing: boolean;
  verifica: Record<string, string>;
  onSalva: () => void;
  onSincronizza: (soloErrori: boolean) => void;
  onVerifica: (calendarId: string, chiave: string) => void;
  onChiudi: () => void;
}) {
  if (!config || !stato) {
    return (
      <div className="mb-4 rounded-panel border border-crema-contorno bg-white p-4">
        <p className="text-xs text-caldo-testo">Caricamento configurazione…</p>
      </div>
    );
  }

  // Le credenziali mancanti sono uno stato previsto, non un errore: la
  // sincronizzazione non e' ancora stata impostata su questo ambiente.
  if (!stato.configurato) {
    return (
      <div className="mb-4 rounded-panel border border-stato-attesa-bordo bg-stato-attesa-bg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-stato-attesa-testo">
              Sincronizzazione Google non configurata
            </h3>
            <p className="mt-1 text-xs text-stato-attesa-testo">
              Mancano le credenziali dell&apos;account di servizio. Impostale nelle variabili
              d&apos;ambiente (<code className="rounded border border-stato-attesa-bordo bg-white px-1">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> e{" "}
              <code className="rounded border border-stato-attesa-bordo bg-white px-1">GOOGLE_PRIVATE_KEY</code>) seguendo la
              sezione «Integrazione Google Calendar» di DEPLOY.md, poi riavvia l&apos;applicazione.
            </p>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            className="shrink-0 cursor-pointer rounded-full border border-stato-attesa-bordo bg-white px-3 py-1.5 text-xs font-semibold text-stato-attesa-testo transition-colors duration-200 hover:bg-stato-attesa-bordo"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  const origineCorrente = config.modalita === "unico";
  const completo = stato.completo;

  return (
    <div className="mb-4 rounded-panel border border-crema-contorno bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-inchiostro">Sincronizzazione Google Calendar</h3>
          <p className="text-xs text-caldo-testo">
            Una direzione: dall&apos;app verso Google. Google è in sola lettura per il team.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSincronizza(false)}
            disabled={syncing || !completo}
            title={completo ? "" : "Completa la mappatura prima di sincronizzare."}
            className="cursor-pointer rounded-full bg-inchiostro px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Sincronizzazione…" : "Sincronizza ora"}
          </button>
          <button
            type="button"
            onClick={onChiudi}
            className="cursor-pointer rounded-full border border-crema-contorno bg-white px-3 py-1.5 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            Chiudi
          </button>
        </div>
      </div>

      {(errore || esito) && (
        <p
          className={`mb-3 rounded-control border px-3 py-2 text-xs font-medium ${
            errore
              ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
              : "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
          }`}
        >
          {errore || esito}
        </p>
      )}

      {/* Conteggi */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Sincronizzati", valore: stato.conteggi.sincronizzati, classe: "text-stato-ok-testo" },
          { label: "Mai sincronizzati", valore: stato.conteggi.mai_sincronizzati, classe: "text-caldo-testo" },
          { label: "In errore", valore: stato.conteggi.in_errore, classe: "text-stato-urgenza-testo" },
          { label: "Da rimuovere", valore: stato.conteggi.da_cancellare, classe: "text-stato-attesa-testo" },
        ].map((c) => (
          <div key={c.label} className="rounded-control border border-crema-contorno bg-crema-scuro px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
              {c.label}
            </p>
            <p className={`text-lg font-bold ${c.classe}`}>{c.valore}</p>
          </div>
        ))}
      </div>

      {/* Interruttore */}
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-inchiostro">
        <input
          type="checkbox"
          checked={config.abilitato}
          onChange={(e) => setConfig((c) => (c ? { ...c, abilitato: e.target.checked } : c))}
          className="h-4 w-4 cursor-pointer rounded border-crema-contorno accent-inchiostro focus:ring-inchiostro"
        />
        Sincronizzazione attiva
      </label>

      {/* Modalità */}
      <div className="mb-3">
        <span className={LABEL_CLASS}>Destinazione degli eventi</span>
        <div className="mt-1 flex flex-wrap gap-4">
          {(
            [
              { v: "per_origine" as GoogleModalita, label: "Un calendario per origine" },
              { v: "unico" as GoogleModalita, label: "Tutti gli eventi su un solo calendario" },
            ]
          ).map((m) => (
            <label key={m.v} className="flex cursor-pointer items-center gap-1.5 text-xs text-caldo-testo">
              <input
                type="radio"
                name="modalita-google"
                checked={config.modalita === m.v}
                onChange={() => setConfig((c) => (c ? { ...c, modalita: m.v } : c))}
                className="h-3.5 w-3.5 cursor-pointer border-crema-contorno accent-inchiostro focus:ring-inchiostro"
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {avviso && (
        <p className="mb-3 rounded-control bg-crema-scuro px-3 py-2 text-[11px] text-caldo-testo">{avviso}</p>
      )}

      {/* Mappatura */}
      {origineCorrente ? (
        <RigaCalendario
          etichetta="Tutti gli eventi"
          valore={config.calendario_default}
          onChange={(v) => setConfig((c) => (c ? { ...c, calendario_default: v } : c))}
          calendari={calendari}
          verifica={verifica["unico"]}
          onVerifica={() => onVerifica(config.calendario_default, "unico")}
        />
      ) : (
        <div className="space-y-3">
          {ORIGINI.map((o) => (
            <RigaCalendario
              key={o}
              etichetta={ORIGINI_LABELS[o]}
              valore={config.mappatura[o] ?? ""}
              onChange={(v) => setMappatura(o, v)}
              calendari={calendari}
              verifica={verifica[o]}
              onVerifica={() => onVerifica(config.mappatura[o] ?? "", o)}
            />
          ))}
        </div>
      )}

      {/* Fuso e finestra */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Fuso orario</label>
          <input
            value={config.timezone}
            onChange={(e) => setConfig((c) => (c ? { ...c, timezone: e.target.value } : c))}
            placeholder={TIMEZONE_DEFAULT}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-[10px] text-caldo-testo">
            Nome IANA, es. Europe/Rome. Gli orari vengono interpretati in questo fuso.
          </p>
        </div>
        <div>
          <label className={LABEL_CLASS}>Finestra (giorni)</label>
          <input
            type="number"
            min={0}
            max={3650}
            value={config.finestra_giorni}
            onChange={(e) =>
              setConfig((c) =>
                c ? { ...c, finestra_giorni: Number(e.target.value) || 0 } : c
              )
            }
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-[10px] text-caldo-testo">
            Al primo popolamento sincronizza solo le scadenze entro N giorni. 0 = nessun limite.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSalva}
          disabled={saving}
          className="cursor-pointer rounded-full bg-inchiostro px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Salvataggio…" : "Salva configurazione"}
        </button>
        {!completo && config.abilitato && (
          <span className="text-[11px] font-medium text-stato-attesa-testo">
            Assegna un calendario a ogni origine per attivare la sincronizzazione.
          </span>
        )}
      </div>

      {/* Errori */}
      {stato.errori.length > 0 && (
        <div className="mt-4 border-t border-crema-bordo pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
              Ultimi errori
            </h4>
            <button
              type="button"
              onClick={() => onSincronizza(true)}
              disabled={syncing}
              className="cursor-pointer rounded-full border border-crema-contorno bg-white px-2.5 py-1 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
            >
              Riprova gli errori
            </button>
          </div>
          <ul className="space-y-1.5">
            {stato.errori.map((e) => (
              <li
                key={e.attivita_id}
                className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-inchiostro">
                      {e.progetto_id ? (
                        <Link
                          href={`/progetti/${e.progetto_id}`}
                          className="cursor-pointer hover:underline"
                        >
                          {e.titolo ?? "Attività eliminata"}
                        </Link>
                      ) : (
                        (e.titolo ?? "Attività eliminata")
                      )}
                    </p>
                    <p className="mt-0.5 break-words text-[11px] text-stato-urgenza-testo">
                      {e.ultimo_errore ?? "Errore sconosciuto."}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-stato-urgenza-testo/80">
                    {e.tentativi} {e.tentativi === 1 ? "tentativo" : "tentativi"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Una riga della mappatura: menu dei calendari visibili + campo manuale.
// Il campo manuale non e' un ripiego: su un account Gmail gratuito il
// calendario condiviso NON compare nella lista, quindi l'id va scritto a mano.
function RigaCalendario({
  etichetta,
  valore,
  onChange,
  calendari,
  verifica,
  onVerifica,
}: {
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  calendari: CalendarioGoogle[];
  verifica?: string;
  onVerifica: () => void;
}) {
  // Il "✓" iniziale e' un SENTINELLA che arriva dal server (vedi handleVerifica):
  // serve a distinguere l'esito positivo, non a decorare. Quindi resta nel
  // confronto e non va sostituito qui, o il ramo positivo non verrebbe piu'
  // riconosciuto. Viene tolto solo al momento di mostrare il testo, dove al suo
  // posto va l'icona vera.
  const ok = verifica?.startsWith("✓");
  return (
    <div>
      <label className={LABEL_CLASS}>{etichetta}</label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {calendari.length > 0 && (
          <select
            value={calendari.some((c) => c.id === valore) ? valore : ""}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Scegli il calendario per ${etichetta}`}
            className="cursor-pointer rounded-control border border-crema-contorno bg-white py-1.5 px-2 text-xs text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            <option value="">— Scegli dalla lista —</option>
            {calendari.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
          </select>
        )}
        <input
          value={valore}
          onChange={(e) => onChange(e.target.value)}
          placeholder="id calendario, es. info@azienda.it"
          className="min-w-[220px] flex-1 rounded-control border border-crema-contorno bg-white py-1.5 px-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
        />
        <button
          type="button"
          onClick={onVerifica}
          disabled={!valore.trim()}
          className="cursor-pointer rounded-full border border-crema-contorno bg-white px-2.5 py-1.5 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verifica accesso
        </button>
      </div>
      {verifica && (
        <p
          className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
            ok ? "text-stato-ok-testo" : "text-stato-attesa-testo"
          }`}
        >
          {ok ? (
            <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {verifica.replace(/^✓\s*/, "")}
        </p>
      )}
    </div>
  );
}

export default function CalendarioPage() {
  const [vista, setVista] = useState<VistaCalendario>("mese");
  const [riferimento, setRiferimento] = useState<Date>(() => new Date());
  const [eventi, setEventi] = useState<EventoCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filtroProgetto, setFiltroProgetto] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStato, setFiltroStato] = useState<StatoAttivita | "TUTTE">("TUTTE");

  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormEvento>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // --- Google Calendar -----------------------------------------------------
  const [showGoogle, setShowGoogle] = useState(false);
  const [gStato, setGStato] = useState<StatoGoogle | null>(null);
  const [gConfig, setGConfig] = useState<ConfigGoogle | null>(null);
  const [gCalendari, setGCalendari] = useState<CalendarioGoogle[]>([]);
  const [gAvviso, setGAvviso] = useState("");
  const [gErrore, setGErrore] = useState("");
  const [gEsito, setGEsito] = useState("");
  const [gSaving, setGSaving] = useState(false);
  const [gSyncing, setGSyncing] = useState(false);
  const [gVerifica, setGVerifica] = useState<Record<string, string>>({});

  const requestSeq = useRef(0);

  const loadEventi = useCallback(async () => {
    const seq = ++requestSeq.current;
    const { dal, al } = rangeVista(vista, riferimento);
    const params = new URLSearchParams({ dal, al });
    if (filtroProgetto) params.set("progetto_id", filtroProgetto);
    if (filtroCliente) params.set("cliente_id", filtroCliente);
    if (filtroStato !== "TUTTE") params.set("stato", filtroStato);

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/calendario?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      if (seq === requestSeq.current) {
        setEventi((data.eventi ?? []) as EventoCalendario[]);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [vista, riferimento, filtroProgetto, filtroCliente, filtroStato]);

  const loadProgetti = useCallback(async () => {
    try {
      const res = await fetch("/api/progetti?paginaSize=100");
      if (res.ok) {
        const data = await res.json();
        setProgetti((data.progetti ?? []) as ProgettoListRow[]);
      }
    } catch {
      // Ignora
    }
  }, []);

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
    loadEventi();
  }, [loadEventi]);

  useEffect(() => {
    loadProgetti();
    loadClienti();
  }, [loadProgetti, loadClienti]);

  // --- Google Calendar -----------------------------------------------------

  const loadGoogleStato = useCallback(async () => {
    try {
      const res = await fetch("/api/google/stato");
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = (await res.json()) as StatoGoogle;
      setGStato(data);
      setGConfig({
        abilitato: data.abilitato,
        modalita: data.modalita,
        calendario_default: data.calendario_default,
        mappatura: data.mappatura,
        timezone: data.timezone,
        finestra_giorni: data.finestra_giorni,
      });
      setGErrore("");
    } catch (err) {
      setGErrore(err instanceof Error ? err.message : "Errore di caricamento.");
    }
  }, []);

  const loadGoogleCalendari = useCallback(async () => {
    try {
      const res = await fetch("/api/google/calendari");
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        // Non configurato: non e' un errore, e' lo stato normale al primo avvio.
        setGCalendari([]);
        setGAvviso("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setGCalendari((data.calendari ?? []) as CalendarioGoogle[]);
      setGAvviso(data.avviso ?? "");
    } catch (err) {
      setGCalendari([]);
      setGAvviso(err instanceof Error ? err.message : "");
    }
  }, []);

  useEffect(() => {
    if (showGoogle) {
      loadGoogleStato();
      loadGoogleCalendari();
    }
  }, [showGoogle, loadGoogleStato, loadGoogleCalendari]);

  const salvaGoogle = async () => {
    if (!gConfig) return;
    setGSaving(true);
    setGErrore("");
    setGEsito("");
    try {
      const res = await fetch("/api/google/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gConfig),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      await loadGoogleStato();
      setGEsito("Configurazione salvata. Premi «Sincronizza ora» per allineare gli eventi.");
    } catch (err) {
      setGErrore(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setGSaving(false);
    }
  };

  const sincronizzaOra = async (soloErrori: boolean) => {
    setGSyncing(true);
    setGErrore("");
    setGEsito("");
    try {
      const res = await fetch("/api/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 200, solo_errori: soloErrori }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setGEsito(
        `Elaborati ${data.elaborati}: ${data.sincronizzati} sincronizzati` +
          (data.spostati ? `, ${data.spostati} spostati` : "") +
          (data.rimossi ? `, ${data.rimossi} rimossi` : "") +
          (data.errori ? `, ${data.errori} errori` : "") +
          (data.rimanenti ? `. Restano ${data.rimanenti}.` : ".")
      );
      await loadGoogleStato();
      loadEventi();
    } catch (err) {
      setGErrore(err instanceof Error ? err.message : "Errore di sincronizzazione.");
    } finally {
      setGSyncing(false);
    }
  };

  const verificaCalendario = async (calendarId: string, chiave: string) => {
    if (!calendarId.trim()) return;
    setGVerifica((v) => ({ ...v, [chiave]: "Verifica in corso…" }));
    try {
      const res = await fetch("/api/google/verifica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar_id: calendarId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setGVerifica((v) => ({
        ...v,
        [chiave]: data.accesso ? "✓ Accesso verificato" : (data.messaggio ?? "Accesso negato"),
      }));
    } catch (err) {
      setGVerifica((v) => ({
        ...v,
        [chiave]: err instanceof Error ? err.message : "Verifica non riuscita.",
      }));
    }
  };

  const setMappatura = (origine: OrigineEvento, valore: string) => {
    setGConfig((c) => (c ? { ...c, mappatura: { ...c.mappatura, [origine]: valore } } : c));
  };

  const perGiorno = raggruppaPerGiorno(eventi);
  const oggiChiave = chiaveGiorno(new Date());

  const apriNuovoEvento = (giorno?: Date) => {
    const base = giorno ?? riferimento;
    const k = chiaveGiorno(base);
    setForm({ ...EMPTY_FORM, data_scadenza: `${k}T09:00` });
    setFormError("");
    setShowForm(true);
  };

  const salvaEvento = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/attivita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo: form.titolo,
          descrizione: form.descrizione || null,
          cliente_id: form.cliente_id || null,
          stato: form.stato,
          priorita: form.priorita,
          data_inizio: form.data_inizio || null,
          data_scadenza: form.data_scadenza || null,
          assegnatario: form.assegnatario || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      loadEventi();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Barra comandi. Prima era `bg-white border-crema-bordo`: unica pagina
          con quella tinta, quindi l'header cambiava colore passando da
          Dashboard a Calendario.
          Qui restano solo le azioni di PAGINA. Il selettore di vista, la
          navigazione del periodo e i tre filtri sono scesi nella barra di
          sezione dentro il contenuto: tutti insieme nella barra superiore
          sfondavano la larghezza e "Tutti gli stati", "Google" e "Nuovo
          evento" finivano fuori dallo schermo. */}
      <AppHeader
        azioni={
          <>
            <button
              type="button"
              onClick={() => setShowGoogle((v) => !v)}
              title="Sincronizzazione Google Calendar"
              aria-expanded={showGoogle}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                gStato?.abilitato
                  ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo hover:bg-stato-ok-bordo"
                  : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  gStato?.abilitato ? "bg-stato-ok-testo" : "bg-caldo-testo/40"
                }`}
              />
              Google
              {gStato && gStato.conteggi.in_errore > 0 && (
                <span className="rounded-full border border-stato-urgenza-bordo bg-stato-urgenza-bg px-1.5 text-[10px] font-bold text-stato-urgenza-testo">
                  {gStato.conteggi.in_errore}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => apriNuovoEvento()}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-inchiostro px-3.5 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Nuovo evento
            </button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto px-6 py-5">
        <PageHeader
          titolo="Calendario condiviso"
          sottotitolo="Attività dei progetti ed eventi del team, organizzati nel tempo."
          azioni={
            /* Legenda origini — sta accanto al titolo, non sotto: e' la
               chiave di lettura di cio' che si vede nel calendario, quindi
               serve dove lo sguardo arriva per primo. */
            <div className="flex flex-wrap items-center gap-3">
              {(Object.keys(ORIGINE_LABELS) as OrigineEvento[]).map((o) => (
                <span key={o} className="flex items-center gap-1.5 text-[11px] text-caldo-testo">
                  <span className={`h-2.5 w-2.5 rounded-sm border ${ORIGINE_STYLES[o]}`} />
                  {ORIGINE_LABELS[o]}
                </span>
              ))}
            </div>
          }
        />

        {/* La barra di sezione porta il periodo come titolo e, sulla stessa
            riga, i comandi che agiscono su quel periodo: e' il ritmo
            `titolo · controlli` della reference.
            E' una striscia a se', NON il contenitore del calendario: la
            griglia ha gia' la sua card con bordo e raggio, e annidare card
            dentro card produce due bordi paralleli a 4px l'uno dall'altro. */}
        <div className="mb-4 overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar titolo={etichettaPeriodo(vista, riferimento)} icona={CalendarIcon}>
            <div className="inline-flex rounded-full border border-crema-contorno bg-white p-0.5">
              {VISTE.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVista(v.id)}
                  aria-pressed={vista === v.id}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200 ${
                    vista === v.id
                      ? "bg-inchiostro text-white"
                      : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRiferimento((d) => spostaAnchor(vista, d, -1))}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                aria-label="Periodo precedente"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRiferimento(new Date())}
                className="cursor-pointer rounded-full border border-crema-contorno px-2.5 py-1 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={() => setRiferimento((d) => spostaAnchor(vista, d, 1))}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                aria-label="Periodo successivo"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <select
              value={filtroProgetto}
              onChange={(e) => setFiltroProgetto(e.target.value)}
              aria-label="Filtra per progetto"
              className="w-[10.5rem] cursor-pointer truncate rounded-full border border-crema-contorno bg-white py-1.5 px-3 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            >
              <option value="">Tutti i progetti</option>
              {progetti.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codice} · {p.nome}
                </option>
              ))}
            </select>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              aria-label="Filtra per cliente"
              className="w-[10.5rem] cursor-pointer truncate rounded-full border border-crema-contorno bg-white py-1.5 px-3 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            >
              <option value="">Tutti i clienti</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ragione_sociale}
                </option>
              ))}
            </select>
            <select
              value={filtroStato}
              onChange={(e) => setFiltroStato(e.target.value as StatoAttivita | "TUTTE")}
              aria-label="Filtra per stato"
              className="w-[10.5rem] cursor-pointer truncate rounded-full border border-crema-contorno bg-white py-1.5 px-3 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
            >
              <option value="TUTTE">Tutti gli stati</option>
              {STATI_ATTIVITA_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </SectionBar>
        </div>

        {error && (
          <p className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo">
            {error}
          </p>
        )}

        {showGoogle && <PannelloGoogle
          stato={gStato}
          config={gConfig}
          setConfig={setGConfig}
          setMappatura={setMappatura}
          calendari={gCalendari}
          avviso={gAvviso}
          errore={gErrore}
          esito={gEsito}
          saving={gSaving}
          syncing={gSyncing}
          verifica={gVerifica}
          onSalva={salvaGoogle}
          onSincronizza={sincronizzaOra}
          onVerifica={verificaCalendario}
          onChiudi={() => setShowGoogle(false)}
        />}

        {showForm && (
          <form
            onSubmit={salvaEvento}
            className="mb-5 overflow-hidden rounded-panel border border-crema-contorno bg-white"
          >
            <SectionBar titolo="Nuovo evento" icona={PlusIcon} />
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={LABEL_CLASS}>Titolo *</label>
                <input
                  value={form.titolo}
                  onChange={(e) => setForm({ ...form, titolo: e.target.value })}
                  className={INPUT_CLASS}
                  placeholder="Es. Riunione con il cliente"
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Cliente</label>
                <select
                  value={form.cliente_id}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                  className={`cursor-pointer ${INPUT_CLASS}`}
                >
                  <option value="">Nessun cliente</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ragione_sociale}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Assegnatario</label>
                <input
                  value={form.assegnatario}
                  onChange={(e) => setForm({ ...form, assegnatario: e.target.value })}
                  className={INPUT_CLASS}
                  placeholder="Nome operatore"
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Scadenza *</label>
                <input
                  type="datetime-local"
                  value={form.data_scadenza}
                  onChange={(e) => setForm({ ...form, data_scadenza: e.target.value })}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Inizio</label>
                <input
                  type="datetime-local"
                  value={form.data_inizio}
                  onChange={(e) => setForm({ ...form, data_inizio: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Stato</label>
                <select
                  value={form.stato}
                  onChange={(e) =>
                    setForm({ ...form, stato: e.target.value as StatoAttivita })
                  }
                  className={`cursor-pointer ${INPUT_CLASS}`}
                >
                  {STATI_ATTIVITA_OPTIONS.map((s) => (
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
                    setForm({ ...form, priorita: e.target.value as FormEvento["priorita"] })
                  }
                  className={`cursor-pointer ${INPUT_CLASS}`}
                >
                  <option value="BASSA">Bassa</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </select>
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
            </div>

            {formError && (
              <p className="mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo">
                {formError}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-full bg-inchiostro px-3.5 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvataggio…" : "Crea evento"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError("");
                }}
                className="cursor-pointer rounded-full border border-crema-contorno bg-white px-3.5 py-1.5 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {loading && eventi.length === 0 ? (
          <div className="flex items-center justify-center p-10">
            <p className="text-sm text-caldo-testo">Caricamento calendario…</p>
          </div>
        ) : vista === "mese" ? (
          <VistaMese
            riferimento={riferimento}
            perGiorno={perGiorno}
            oggiChiave={oggiChiave}
            onNuovo={apriNuovoEvento}
          />
        ) : vista === "settimana" ? (
          <VistaSettimana
            riferimento={riferimento}
            perGiorno={perGiorno}
            oggiChiave={oggiChiave}
            onNuovo={apriNuovoEvento}
          />
        ) : (
          <VistaAgenda perGiorno={perGiorno} />
        )}
      </main>
    </div>
  );
}

function VistaMese({
  riferimento,
  perGiorno,
  oggiChiave,
  onNuovo,
}: {
  riferimento: Date;
  perGiorno: Map<string, EventoCalendario[]>;
  oggiChiave: string;
  onNuovo: (giorno: Date) => void;
}) {
  const celle = grigliaMese(riferimento);
  const meseCorrente = riferimento.getMonth();

  return (
    <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
      <div className="grid grid-cols-7 border-b border-crema-bordo bg-crema-scuro">
        {GIORNI_BREVI.map((g) => (
          <div
            key={g}
            className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-caldo-testo"
          >
            {g}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celle.map((cella) => {
          const k = chiaveGiorno(cella);
          const eventiGiorno = perGiorno.get(k) ?? [];
          const fuoriMese = cella.getMonth() !== meseCorrente;
          const isOggi = k === oggiChiave;
          return (
            <div
              key={k}
              className={`min-h-[96px] border-b border-r border-crema-bordo p-1.5 ${
                fuoriMese ? "bg-crema-scuro/60" : ""
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onNuovo(cella)}
                  title="Aggiungi un evento in questo giorno"
                  className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-200 ${
                    isOggi
                      ? "bg-inchiostro text-white"
                      : fuoriMese
                        ? "text-caldo-testo/50 hover:bg-crema-scuro"
                        : "text-inchiostro hover:bg-crema-scuro"
                  }`}
                >
                  {cella.getDate()}
                </button>
                {eventiGiorno.length > 3 && (
                  <span className="text-[10px] font-semibold text-caldo-testo">
                    +{eventiGiorno.length - 3}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {eventiGiorno.slice(0, 3).map((e) => (
                  <ChipEvento key={e.id} e={e} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VistaSettimana({
  riferimento,
  perGiorno,
  oggiChiave,
  onNuovo,
}: {
  riferimento: Date;
  perGiorno: Map<string, EventoCalendario[]>;
  oggiChiave: string;
  onNuovo: (giorno: Date) => void;
}) {
  const giorni = giorniSettimana(riferimento);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {giorni.map((giorno) => {
        const k = chiaveGiorno(giorno);
        const eventiGiorno = perGiorno.get(k) ?? [];
        const isOggi = k === oggiChiave;
        return (
          <div
            key={k}
            className="flex min-h-[200px] flex-col rounded-card border border-crema-contorno bg-white"
          >
            <button
              type="button"
              onClick={() => onNuovo(giorno)}
              title="Aggiungi un evento in questo giorno"
              className={`flex cursor-pointer items-center justify-between border-b border-crema-bordo px-3 py-2 text-left transition-colors duration-200 hover:bg-crema-scuro ${
                isOggi ? "bg-stato-info-bg" : ""
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  isOggi ? "text-stato-info-testo" : "text-caldo-testo"
                }`}
              >
                {GIORNI_BREVI[(giorno.getDay() + 6) % 7]}
              </span>
              <span
                className={`text-sm font-bold ${
                  isOggi ? "text-stato-info-testo" : "text-inchiostro"
                }`}
              >
                {giorno.getDate()}
              </span>
            </button>
            <div className="flex flex-1 flex-col gap-1.5 p-2">
              {eventiGiorno.length === 0 ? (
                <p className="pt-2 text-center text-[11px] text-caldo-testo/50">—</p>
              ) : (
                eventiGiorno.map((e) => {
                  const origine = origineEvento(e);
                  const corpo = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-inchiostro">
                          {e.titolo}
                        </span>
                        {e.data_scadenza && (
                          <span className="shrink-0 text-[10px] font-medium text-caldo-testo">
                            {formatOra(e.data_scadenza)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-caldo-testo">
                        {etichettaOrigine(e)}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`rounded-control border px-1.5 py-0.5 text-[9px] font-semibold ${ORIGINE_STYLES[origine]}`}
                        >
                          {ORIGINE_LABELS[origine]}
                        </span>
                        <PriorityBadge priorita={e.priorita} />
                      </div>
                    </>
                  );
                  return e.progetto_id ? (
                    <Link
                      key={e.id}
                      href={`/progetti/${e.progetto_id}`}
                      className="block cursor-pointer rounded-control border border-crema-bordo bg-white p-2 transition-colors duration-200 hover:border-crema-contorno hover:bg-crema-scuro"
                    >
                      {corpo}
                    </Link>
                  ) : (
                    <div
                      key={e.id}
                      className="rounded-control border border-crema-bordo bg-white p-2"
                    >
                      {corpo}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VistaAgenda({ perGiorno }: { perGiorno: Map<string, EventoCalendario[]> }) {
  const giorni = giorniOrdinati(perGiorno);

  if (giorni.length === 0) {
    return (
      <div className="rounded-card border border-crema-contorno bg-white p-10 text-center">
        <p className="text-sm text-caldo-testo">Nessuna attività in questo periodo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {giorni.map((k) => {
        const eventiGiorno = perGiorno.get(k) ?? [];
        return (
          <div
            key={k}
            className="overflow-hidden rounded-card border border-crema-contorno bg-white"
          >
            <div className="flex items-center justify-between border-b border-crema-bordo bg-crema-scuro px-4 py-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-inchiostro">
                {etichettaGiorno(k)}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-caldo-testo">
                {eventiGiorno.length}
              </span>
            </div>
            <div>
              {eventiGiorno.map((e) => {
                const origine = origineEvento(e);
                const corpo = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="tabular shrink-0 text-xs font-bold text-caldo-testo">
                          {formatOra(e.data_scadenza) || "—"}
                        </span>
                        <span className="truncate text-sm font-semibold text-inchiostro">
                          {e.titolo}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-caldo-testo">
                        {ORIGINE_LABELS[origine]} · {etichettaOrigine(e)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded-control border px-1.5 py-0.5 text-[9px] font-semibold ${ORIGINE_STYLES[origine]}`}
                      >
                        {ORIGINE_LABELS[origine]}
                      </span>
                      <PriorityBadge priorita={e.priorita} />
                    </div>
                  </>
                );
                return e.progetto_id ? (
                  <Link
                    key={e.id}
                    href={`/progetti/${e.progetto_id}`}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b border-crema-bordo px-4 py-3 transition-colors duration-200 hover:bg-crema-scuro"
                  >
                    {corpo}
                  </Link>
                ) : (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-crema-bordo px-4 py-3"
                  >
                    {corpo}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
