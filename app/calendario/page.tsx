"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  Cliente,
  ConfigGoogle,
  Etichetta,
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
import { caricaApi } from "@/lib/api-cache";
import { useOperatore } from "@/lib/operatore-client";
import {
  type DatiEventoCompatto,
  type FormEvento,
  datiCompattiDaEvento,
  datiNuoviDaSlot,
  formDaDatiCompatti,
  formDaEvento,
  formVuoto,
  payloadDaForm,
} from "@/lib/calendario-form";
import {
  MINUTI_GIORNO,
  calcolaRidimensionamento,
  calcolaSpostamento,
  chiaveNaive,
  diffMinuti,
  inizioFineEvento,
  limitiDaGiorni,
} from "@/lib/calendario-griglia";
import PannelloCalendario from "@/components/calendario/PannelloCalendario";
import PopoverEvento from "@/components/calendario/PopoverEvento";
import VistaGiorno from "@/components/calendario/VistaGiorno";
import VistaSettimanaOraria from "@/components/calendario/VistaSettimanaOraria";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/calendario/stili";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import {
  ORIGINE_LABELS,
  ORIGINE_STYLES,
  VISTE,
  chiaveGiorno,
  daChiaveGiorno,
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

function ChipEvento({ e, onModifica }: { e: EventoCalendario; onModifica?: (e: EventoCalendario) => void }) {
  const origine: OrigineEvento = origineEvento(e);
  const classe = `block truncate rounded-control border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 ${ORIGINE_STYLES[origine]}`;
  const google = e.google_stato ? ` · ${GOOGLE_DOT_LABEL[e.google_stato]}` : "";
  const etichette = e.etichette ?? [];
  const etichetteTitolo = etichette.length
    ? ` · etichette: ${etichette.map((et) => et.nome).join(", ")}`
    : "";
  const titolo = `${e.titolo} — ${etichettaOrigine(e)}${e.data_scadenza ? ` (${formatOra(e.data_scadenza)})` : ""}${google}${etichetteTitolo}`;
  const dot = e.google_stato ? GOOGLE_DOT[e.google_stato] : null;

  // Pallini etichette: il colore e' libero (hex dell'utente), quindi via
  // style inline. Max 3 nella cella stretta del mese, il resto va nel title.
  const pallini = etichette.slice(0, 3);

  if (e.progetto_id) {
    return (
      <Link
        href={`/progetti/${e.progetto_id}`}
        className={`${classe} flex cursor-pointer items-center gap-1`}
        title={titolo}
      >
        {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
        <span className="truncate">{e.titolo}</span>
        {pallini.map((et) => (
          <span
            key={et.id}
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: et.colore }}
          />
        ))}
      </Link>
    );
  }
  // Evento libero (non di progetto): il click apre la modifica, che fino a
  // oggi non esisteva — l'evento si poteva solo creare e guardare.
  return (
    <button
      type="button"
      onClick={() => onModifica?.(e)}
      className={`${classe} flex w-full cursor-pointer items-center gap-1 text-left`}
      title={`${titolo} — clicca per modificare`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
      <span className="truncate">{e.titolo}</span>
      {pallini.map((et) => (
        <span
          key={et.id}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: et.colore }}
        />
      ))}
    </button>
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

// ---------------------------------------------------------------------------
// Modale di gestione delle etichette personalizzate. Ogni etichetta ha un
// nome e un colore libero (hex): la leggibilita' sui chip e' garantita dal
// pallino pieno, che non ha bisogno di contrasto col testo.
// ---------------------------------------------------------------------------

function EtichetteModal({
  etichette,
  nuova,
  setNuova,
  saving,
  errore,
  esito,
  onCrea,
  onAggiorna,
  onElimina,
  onChiudi,
}: {
  etichette: Etichetta[];
  nuova: { nome: string; colore: string };
  setNuova: React.Dispatch<React.SetStateAction<{ nome: string; colore: string }>>;
  saving: boolean;
  errore: string;
  esito: string;
  onCrea: () => void;
  onAggiorna: (id: string, patch: { nome?: string; colore?: string }) => void;
  onElimina: (id: string) => void;
  onChiudi: () => void;
}) {
  const [inModifica, setInModifica] = useState<Record<string, { nome: string; colore: string }>>({});
  const [confermaDelete, setConfermaDelete] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-inchiostro/40 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onChiudi();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gestione etichette"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-crema-contorno bg-white shadow-soft"
      >
        {/* Intestazione */}
        <div className="flex items-start justify-between gap-4 border-b border-crema-bordo px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crema-scuro">
              <LayersIcon className="h-4 w-4 text-inchiostro" />
            </span>
            <div>
              <h2 className="text-base font-bold text-inchiostro">Etichette del calendario</h2>
              <p className="mt-0.5 text-xs text-caldo-testo">
                Tag con colore libero da assegnare agli eventi: compaiono come pallini sui chip
                e nell&apos;agenda della dashboard.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="shrink-0 cursor-pointer rounded p-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo scrollabile */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

          {/* Creazione */}
          <div className="mb-4 rounded-control border border-crema-bordo bg-crema-scuro p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-caldo-testo">
              Nuova etichetta
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={nuova.nome}
                onChange={(e) => setNuova((n) => ({ ...n, nome: e.target.value }))}
                placeholder="Es. Cliente premium"
                maxLength={40}
                className="min-w-0 flex-1 rounded-control border border-crema-contorno bg-white py-1.5 px-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
              <input
                type="color"
                value={nuova.colore}
                onChange={(e) => setNuova((n) => ({ ...n, colore: e.target.value }))}
                aria-label="Colore dell'etichetta"
                className="h-9 w-12 shrink-0 cursor-pointer rounded-control border border-crema-contorno bg-white p-1"
              />
              <button
                type="button"
                onClick={onCrea}
                disabled={saving || !nuova.nome.trim()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control bg-inchiostro px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {saving ? "Creazione…" : "Crea"}
              </button>
            </div>
          </div>

          {/* Elenco */}
          {etichette.length === 0 ? (
            <p className="py-6 text-center text-xs text-caldo-testo">
              Nessuna etichetta ancora. Creane una qui sopra.
            </p>
          ) : (
            <ul className="divide-y divide-crema-bordo">
              {etichette.map((et) => {
                const edit = inModifica[et.id];
                return (
                  <li key={et.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: et.colore }}
                      aria-hidden="true"
                    />
                    {edit ? (
                      <>
                        <input
                          value={edit.nome}
                          onChange={(e) =>
                            setInModifica((m) => ({ ...m, [et.id]: { ...m[et.id], nome: e.target.value } }))
                          }
                          maxLength={40}
                          className="w-40 rounded-control border border-crema-contorno bg-white py-1 px-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                        />
                        <input
                          type="color"
                          value={edit.colore}
                          onChange={(e) =>
                            setInModifica((m) => ({ ...m, [et.id]: { ...m[et.id], colore: e.target.value } }))
                          }
                          aria-label={`Colore di ${et.nome}`}
                          className="h-8 w-11 shrink-0 cursor-pointer rounded-control border border-crema-contorno bg-white p-1"
                        />
                        <button
                          type="button"
                          disabled={saving || !edit.nome.trim()}
                          onClick={() => {
                            onAggiorna(et.id, { nome: edit.nome.trim(), colore: edit.colore });
                            setInModifica((m) => {
                              const copy = { ...m };
                              delete copy[et.id];
                              return copy;
                            });
                          }}
                          className="cursor-pointer rounded-control bg-inchiostro px-3 py-1 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setInModifica((m) => {
                              const copy = { ...m };
                              delete copy[et.id];
                              return copy;
                            })
                          }
                          className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro"
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-inchiostro">
                          {et.nome}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setInModifica((m) => ({ ...m, [et.id]: { nome: et.nome, colore: et.colore } }))
                          }
                          className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                        >
                          Modifica
                        </button>
                        {confermaDelete === et.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-stato-urgenza-testo">
                              Eliminare dai eventi?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onElimina(et.id);
                                setConfermaDelete(null);
                              }}
                              disabled={saving}
                              className="cursor-pointer rounded-control bg-pericolo px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-pericolo-scuro disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Sì, elimina
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfermaDelete(null)}
                              className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfermaDelete(et.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-transparent bg-pericolo/10 px-2.5 py-1 text-[11px] font-semibold text-pericolo transition-colors duration-200 hover:bg-pericolo/20"
                          >
                            <TrashIcon className="h-3 w-3" />
                            Elimina
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Piè di pagina */}
        <div className="flex justify-end border-t border-crema-bordo px-5 py-3">
          <button
            type="button"
            onClick={onChiudi}
            className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarioPage() {
  // La pagina nasce sulla griglia settimanale: è la vista che mostra durate
  // e sovrapposizioni, cioè il motivo per cui il calendario è stato rifatto.
  const [vista, setVista] = useState<VistaCalendario>("settimana");
  const [riferimento, setRiferimento] = useState<Date>(() => new Date());
  const [eventi, setEventi] = useState<EventoCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Annuncio per aria-live dopo spostamenti da tastiera o rollback.
  const [avviso, setAvviso] = useState("");

  const [filtroProgetto, setFiltroProgetto] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStato, setFiltroStato] = useState<StatoAttivita | "TUTTE">("TUTTE");

  // --- Filtri client-side --------------------------------------------------
  // Origini, etichette e persona non hanno parametri API dedicati: filtrarli
  // qui li rende istantanei e non fa ripartire la fetch a ogni toggle.
  const [originiAttive, setOriginiAttive] = useState<Set<OrigineEvento>>(
    () => new Set<OrigineEvento>(["progetto", "cliente", "generico"])
  );
  // Insieme vuoto = tutte le etichette. Il primo click isola quella scelta.
  const [etichetteAttive, setEtichetteAttive] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [personaFiltro, setPersonaFiltro] = useState("");

  const [showPannello, setShowPannello] = useState(false);
  const [showFiltri, setShowFiltri] = useState(false);
  const [operatori, setOperatori] = useState<{ id: string; nome: string }[]>([]);
  const { operatore } = useOperatore();

  // --- Popover compatto ----------------------------------------------------
  const [popover, setPopover] = useState<{
    evento: EventoCalendario | null;
    ancora: { x: number; y: number };
    dati: DatiEventoCompatto;
  } | null>(null);
  const [popoverSaving, setPopoverSaving] = useState(false);
  const [popoverErrore, setPopoverErrore] = useState("");
  // Conservato per riaprire il popover se l'utente annulla il modal completo
  // aperto con «Tutti i dettagli».
  const [pendingCompact, setPendingCompact] = useState<{
    evento: EventoCalendario | null;
    ancora: { x: number; y: number };
    dati: DatiEventoCompatto;
  } | null>(null);

  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  // Anagrafica etichette, caricata una volta e ricaricata dopo ogni CRUD.
  const [etichette, setEtichette] = useState<Etichetta[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormEvento>(formVuoto);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // null = creazione; con un id si modifica quell'evento via PATCH.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // --- Gestione etichette --------------------------------------------------
  const [showEtichette, setShowEtichette] = useState(false);
  const [nuovaEtichetta, setNuovaEtichetta] = useState({ nome: "", colore: "#6B7280" });
  const [etichetteSaving, setEtichetteSaving] = useState(false);
  const [etichetteErrore, setEtichetteErrore] = useState("");
  const [etichetteEsito, setEtichetteEsito] = useState("");

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
  // Trigger del drawer: serve a restituirgli il focus alla chiusura.
  const agendeRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const pannelloAperto = useRef(false);
  pannelloAperto.current = showPannello;

  // --- Pianificazione ottimistica ------------------------------------------
  // Il drag deve aggiornare la UI subito e fare UN solo PATCH al rilascio.
  // Un ref all'array serve a leggere lo stato corrente dentro i callback
  // stabilizzati (che altrimenti vedrebbero una lista vecchia).
  const eventiRef = useRef(eventi);
  eventiRef.current = eventi;
  const pianificazioneSeq = useRef<Record<string, number>>({});
  const nudgeTimer = useRef<Record<string, number>>({});
  const nudgeSnapshot = useRef<Record<string, EventoCalendario>>({});
  const nudgeUltimo = useRef<Record<string, { inizio: string; fine: string }>>({});

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
      const data = await caricaApi<{ clienti: Cliente[] }>("/api/clienti");
      setClienti(data.clienti ?? []);
    } catch {
      // Ignora
    }
  }, []);

  const loadEtichette = useCallback(async () => {
    try {
      const res = await fetch("/api/etichette");
      if (res.ok) {
        const data = await res.json();
        setEtichette((data.etichette ?? []) as Etichetta[]);
      }
    } catch {
      // Ignora
    }
  }, []);

  const loadOperatori = useCallback(async () => {
    try {
      const res = await fetch("/api/operatori");
      if (!res.ok) return;
      const data = await res.json();
      const righe = (data.operatori ?? []) as {
        id: string;
        nome: string;
        attivo?: boolean;
      }[];
      setOperatori(
        righe
          .filter((r) => r.attivo !== false)
          .map((r) => ({ id: r.id, nome: r.nome }))
      );
    } catch {
      // Il team è un di più: senza anagrafica restano i nomi degli eventi.
    }
  }, []);

  useEffect(() => {
    loadEventi();
  }, [loadEventi]);

  useEffect(() => {
    loadProgetti();
    loadClienti();
    loadEtichette();
    loadOperatori();
  }, [loadProgetti, loadClienti, loadEtichette, loadOperatori]);

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

  const oggiChiave = chiaveGiorno(new Date());

  // --- Filtri client-side --------------------------------------------------
  // Semantica: origini = AND tra famiglie attive; etichette = OR ("una di
  // queste"), insieme vuoto = tutte; persona = uguaglianza sul nome, perché
  // l'assegnatario è testo libero e non un id.
  const eventiVisibili = useMemo(() => {
    const persona = personaFiltro.trim().toLowerCase();
    return eventi.filter((e) => {
      if (!originiAttive.has(origineEvento(e))) return false;

      if (etichetteAttive.size > 0) {
        const ids = (e.etichette ?? []).map((et) => et.id);
        if (!ids.some((id) => etichetteAttive.has(id))) return false;
      }

      if (persona) {
        const persone = [e.assegnatario, ...(e.persone ?? [])]
          .filter((p): p is string => Boolean(p && p.trim()))
          .map((p) => p.trim().toLowerCase());
        if (!persone.includes(persona)) return false;
      }

      return true;
    });
  }, [eventi, originiAttive, etichetteAttive, personaFiltro]);

  // Riordino per giorno, non a ogni render: senza memo ogni carattere digitato
  // nel form di un evento ri-raggruppava tutti gli eventi dell'anno.
  const perGiorno = useMemo(
    () => raggruppaPerGiorno(eventiVisibili),
    [eventiVisibili]
  );

  // I conteggi del pannello derivano dagli eventi NON filtrati: servono a
  // spiegare cosa si sta escludendo, non a ripetere ciò che si vede.
  const conteggioOrigini = useMemo(() => {
    const out: Record<OrigineEvento, number> = {
      progetto: 0,
      cliente: 0,
      generico: 0,
    };
    for (const e of eventi) out[origineEvento(e)] += 1;
    return out;
  }, [eventi]);

  const conteggioEtichette = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of eventi) {
      for (const et of e.etichette ?? []) {
        out.set(et.id, (out.get(et.id) ?? 0) + 1);
      }
    }
    return out;
  }, [eventi]);

  const giorniConEventi = useMemo(() => {
    const out = new Set<string>();
    for (const e of eventiVisibili) {
      const k = chiaveNaive(e.data_scadenza);
      if (k) out.add(k);
    }
    return out;
  }, [eventiVisibili]);

  const team = useMemo(() => {
    const nomi = new Map<string, string>();
    for (const o of operatori) nomi.set(o.nome.toLowerCase(), o.nome);
    for (const e of eventi) {
      for (const n of [e.assegnatario, ...(e.persone ?? [])]) {
        const t = n?.trim();
        if (t && !nomi.has(t.toLowerCase())) nomi.set(t.toLowerCase(), t);
      }
    }
    if (operatore?.nome) {
      nomi.set(operatore.nome.toLowerCase(), operatore.nome);
    }
    return Array.from(nomi.values()).sort((a, b) => a.localeCompare(b, "it"));
  }, [operatori, eventi, operatore]);

  const giorniVista = useMemo(
    () => (vista === "giorno" ? [riferimento] : giorniSettimana(riferimento)),
    [vista, riferimento]
  );

  const toggleOrigine = useCallback((origine: OrigineEvento) => {
    setOriginiAttive((prev) => {
      const prossimo = new Set(prev);
      if (prossimo.has(origine)) prossimo.delete(origine);
      else prossimo.add(origine);
      return prossimo;
    });
  }, []);

  const toggleEtichetta = useCallback((id: string) => {
    setEtichetteAttive((prev) => {
      // Dal "tutte" si passa direttamente a "solo questa": è il gesto che
      // serve più spesso e non richiede due click.
      if (prev.size === 0) return new Set([id]);
      const prossimo = new Set(prev);
      if (prossimo.has(id)) prossimo.delete(id);
      else prossimo.add(id);
      return prossimo;
    });
  }, []);

  const selezionaPersona = useCallback((nome: string) => {
    setPersonaFiltro((prev) =>
      prev.toLowerCase() === nome.toLowerCase() ? "" : nome
    );
  }, []);

  const chiudiPannello = useCallback(() => {
    setShowPannello(false);
    // Il focus non deve cadere sul body quando il drawer scompare.
    window.setTimeout(() => agendeRef.current?.focus(), 0);
  }, []);

  const selezionaGiorno = useCallback((giorno: Date) => {
    setRiferimento(giorno);
    if (pannelloAperto.current) chiudiPannello();
  }, [chiudiPannello]);

  // All'apertura il drawer è un dialogo modale: il focus entra nel pannello e
  // non resta sul bottone che l'ha aperto.
  useEffect(() => {
    if (showPannello) drawerCloseRef.current?.focus();
  }, [showPannello]);

  const apriNuovoEvento = (giorno?: Date) => {
    const base = giorno ?? riferimento;
    const k = chiaveGiorno(base);
    // Un'ora di default (09:00–10:00): la griglia mostra subito un blocco
    // della durata giusta invece di derivarla dalla sola scadenza.
    setForm({
      ...formVuoto(),
      data_inizio: `${k}T09:00`,
      data_scadenza: `${k}T10:00`,
    });
    setFormError("");
    setEditingId(null);
    setConfirmDeleteId(null);
    setPendingCompact(null);
    setShowForm(true);
  };

  // Le date arrivano gia' in formato datetime-local (RE_DATETIME_LOCAL),
  // quindi il form si riempie senza conversioni.
  const apriModificaEvento = (e: EventoCalendario) => {
    setForm(formDaEvento(e));
    setFormError("");
    setEditingId(e.id);
    setConfirmDeleteId(null);
    setPendingCompact(null);
    setShowForm(true);
  };

  // Duplica: crea una copia apribile subito in modifica, cosi' si puo'
  // cambiare data/titolo senza rifare tutto a mano. Le etichette vengono
  // copiate; progetto e cliente restano quelli originali (se esistono).
  const duplicaEvento = async () => {
    if (!form.titolo.trim()) {
      setFormError("Compila il titolo prima di duplicare.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      // Il form ora porta anche progetto_id: la copia mantiene il
      // collegamento al progetto senza doverlo recuperare dall'originale.
      const res = await fetch("/api/attivita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          payloadDaForm({
            ...form,
            titolo: `Copia di ${form.titolo.trim()}`,
          })
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      loadEventi();
      // Si rimane sul form di modifica dell'ORIGINALE: la copia esiste gia'
      // in calendario.
      setFormError("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore di duplicazione.");
    } finally {
      setSaving(false);
    }
  };

  const salvaEvento = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = payloadDaForm(form);
      const res = await fetch(editingId ? `/api/attivita/${editingId}` : "/api/attivita", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setShowForm(false);
      setPendingCompact(null);
      setForm(formVuoto());
      setEditingId(null);
      loadEventi();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore di salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  // --- Popover compatto ----------------------------------------------------
  // Il popover è un editor a sé: crea o modifica un evento con i campi
  // essenziali e passa al modal completo solo su richiesta. Anche qui il
  // payload passa da payloadDaForm, così progetto_id non va più perso.

  const apriPopoverNuovo = useCallback(
    (chiave: string, minuti: number, ancora: { x: number; y: number }) => {
      setPopoverErrore("");
      setPopover({
        evento: null,
        ancora,
        dati: datiNuoviDaSlot(chiave, minuti),
      });
    },
    []
  );

  const apriPopoverEvento = useCallback(
    (e: EventoCalendario, ancora: { x: number; y: number }) => {
      const range = inizioFineEvento(e);
      // Il popover compatto ha una sola data: un evento di più giorni
      // verrebbe compresso a 24h al primo salvataggio. Per quelli si apre
      // direttamente il modal completo, che ha inizio e fine separati.
      if (range && diffMinuti(range.fine, range.inizio) > MINUTI_GIORNO) {
        setForm(formDaEvento(e));
        setFormError("");
        setEditingId(e.id);
        setConfirmDeleteId(null);
        setPendingCompact(null);
        setShowForm(true);
        return;
      }
      setPopoverErrore("");
      setPopover({ evento: e, ancora, dati: datiCompattiDaEvento(e) });
    },
    []
  );

  const chiudiPopover = useCallback(() => {
    setPopover(null);
    setPopoverErrore("");
  }, []);

  const cambiaPopover = useCallback((patch: Partial<DatiEventoCompatto>) => {
    setPopover((p) => {
      if (!p) return p;
      const dati = { ...p.dati, ...patch };
      // Se l'utente tocca gli orari, il "finisce il giorno dopo" va
      // ricalcolato dal confronto fine/inizio: tenere il flag vecchio
      // salverebbe l'evento di un giorno in più senza che nulla lo dica.
      // I casi notturni restano coperti dallo stesso confronto in
      // formDaDatiCompatti.
      if (patch.inizio !== undefined || patch.fine !== undefined) {
        dati.giornoFineSuccessivo = false;
      }
      return { ...p, dati };
    });
  }, []);

  const salvaPopover = async () => {
    if (!popover) return;
    const titolo = popover.dati.titolo.trim();
    if (!titolo) {
      setPopoverErrore("Il titolo è obbligatorio.");
      return;
    }

    const base = popover.evento ? formDaEvento(popover.evento) : formVuoto();
    const completa = formDaDatiCompatti({ ...popover.dati, titolo }, base);
    setPopoverSaving(true);
    setPopoverErrore("");
    try {
      const res = await fetch(
        popover.evento
          ? `/api/attivita/${popover.evento.id}`
          : "/api/attivita",
        {
          method: popover.evento ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadDaForm(completa)),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      chiudiPopover();
      // Il POST non restituisce nomi di progetto/cliente né etichette: per
      // la creazione il refetch è obbligatorio. Per la modifica lo stesso
      // refetch evita di dover fondere a mano etichette e relazioni.
      loadEventi();
    } catch (err) {
      setPopoverErrore(
        err instanceof Error ? err.message : "Errore di salvataggio."
      );
    } finally {
      setPopoverSaving(false);
    }
  };

  const eliminaPopover = async () => {
    if (!popover?.evento) return;
    setPopoverSaving(true);
    setPopoverErrore("");
    try {
      const res = await fetch(`/api/attivita/${popover.evento.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      chiudiPopover();
      loadEventi();
    } catch (err) {
      setPopoverErrore(
        err instanceof Error ? err.message : "Errore di eliminazione."
      );
    } finally {
      setPopoverSaving(false);
    }
  };

  const duplicaPopover = async () => {
    if (!popover?.evento) return;
    setPopoverSaving(true);
    setPopoverErrore("");
    try {
      // Si duplica ciò che è a schermo, non l'originale salvato: se l'utente
      // ha già cambiato orario o titolo, la copia deve partire da lì.
      const base = formDaDatiCompatti(
        {
          ...popover.dati,
          titolo: `Copia di ${
            popover.dati.titolo.trim() || popover.evento.titolo
          }`,
        },
        formDaEvento(popover.evento)
      );
      const res = await fetch("/api/attivita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadDaForm(base)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      chiudiPopover();
      loadEventi();
    } catch (err) {
      setPopoverErrore(
        err instanceof Error ? err.message : "Errore di duplicazione."
      );
    } finally {
      setPopoverSaving(false);
    }
  };

  // «Tutti i dettagli»: il popover resta in sospeso, così annullare il modal
  // riporta all'editor compatto invece di perdere quanto digitato.
  const vaiAiDettagli = useCallback(() => {
    if (!popover) return;
    const base = popover.evento ? formDaEvento(popover.evento) : formVuoto();
    setForm(formDaDatiCompatti(popover.dati, base));
    setEditingId(popover.evento?.id ?? null);
    setConfirmDeleteId(null);
    setFormError("");
    setPendingCompact(popover);
    setPopover(null);
    setShowForm(true);
  }, [popover]);

  // --- Pianificazione ottimistica ------------------------------------------
  // Il drag aggiorna la UI subito e fa UN solo PATCH al rilascio. Se il PATCH
  // fallisce si torna all'ora precedente; un errore Google non deve
  // trascinare indietro l'evento, quindi si guarda solo la risposta HTTP.

  const applicaPianificazione = useCallback(
    (id: string, inizio: string, fine: string) => {
      setEventi((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, data_inizio: inizio, data_scadenza: fine } : e
        )
      );
    },
    []
  );

  const inviaPianificazione = useCallback(
    async (
      id: string,
      inizio: string,
      fine: string,
      snapshot: EventoCalendario | null,
      annuncio?: string
    ) => {
      const seq = (pianificazioneSeq.current[id] ?? 0) + 1;
      pianificazioneSeq.current[id] = seq;
      try {
        const res = await fetch(`/api/attivita/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_inizio: inizio, data_scadenza: fine }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
        // Una risposta vecchia non deve sovrascrivere uno spostamento più
        // recente partito nel frattempo.
        if (pianificazioneSeq.current[id] !== seq) return;
        setEventi((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  data_inizio: (data.data_inizio as string | null) ?? inizio,
                  data_scadenza: (data.data_scadenza as string | null) ?? fine,
                }
              : e
          )
        );
        setAvviso(annuncio ?? "Evento spostato.");
      } catch (err) {
        if (pianificazioneSeq.current[id] !== seq) return;
        if (snapshot) {
          setEventi((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    data_inizio: snapshot.data_inizio,
                    data_scadenza: snapshot.data_scadenza,
                  }
                : e
            )
          );
        }
        setAvviso(
          `Spostamento non salvato: ${
            err instanceof Error ? err.message : "errore di rete"
          }. Ripristinata l'ora precedente.`
        );
      }
    },
    []
  );

  // Un drag che parte mentre un nudge da tastiera è ancora in attesa deve
  // annullarlo: altrimenti il timer invierebbe la posizione vecchia sopra
  // quella appena rilasciata.
  const annullaNudge = useCallback((id: string) => {
    const timer = nudgeTimer.current[id];
    if (timer) window.clearTimeout(timer);
    delete nudgeTimer.current[id];
    delete nudgeUltimo.current[id];
    delete nudgeSnapshot.current[id];
  }, []);

  const spostaEvento = useCallback(
    (evento: EventoCalendario, inizio: string, fine: string) => {
      annullaNudge(evento.id);
      applicaPianificazione(evento.id, inizio, fine);
      void inviaPianificazione(evento.id, inizio, fine, evento);
    },
    [annullaNudge, applicaPianificazione, inviaPianificazione]
  );

  const ridimensionaEvento = useCallback(
    (evento: EventoCalendario, fine: string) => {
      const range = inizioFineEvento(evento);
      if (!range) return;
      annullaNudge(evento.id);
      applicaPianificazione(evento.id, range.inizio, fine);
      void inviaPianificazione(evento.id, range.inizio, fine, evento);
    },
    [annullaNudge, applicaPianificazione, inviaPianificazione]
  );

  // Alternativa al drag per WCAG 2.2 «Dragging Movements»: Alt+frecce sul
  // blocco evento. Le raffiche sono debounced (400 ms) in un solo PATCH, e
  // lo snapshot è quello del PRIMO movimento della raffica, non dell'ultimo.
  const nudgeEvento = useCallback(
    (
      evento: EventoCalendario,
      deltaMinuti: number,
      deltaGiorni: number,
      ridimensiona: boolean
    ) => {
      const range = inizioFineEvento(evento);
      if (!range) return;
      const limiti = limitiDaGiorni(giorniVista);

      let inizio = range.inizio;
      let fine = range.fine;
      if (ridimensiona) {
        fine = calcolaRidimensionamento({
          inizio,
          fine0: fine,
          deltaMinuti,
          limiteFine: limiti.fine,
        }).fine;
      } else {
        const spostato = calcolaSpostamento({
          inizio0: inizio,
          fine0: fine,
          deltaMinuti,
          deltaGiorni,
          limiteInizio: limiti.inizio,
          limiteFine: limiti.fine,
        });
        inizio = spostato.inizio;
        fine = spostato.fine;
      }
      if (inizio === range.inizio && fine === range.fine) return;

      if (!nudgeSnapshot.current[evento.id]) {
        nudgeSnapshot.current[evento.id] =
          eventiRef.current.find((e) => e.id === evento.id) ?? evento;
      }
      nudgeUltimo.current[evento.id] = { inizio, fine };
      applicaPianificazione(evento.id, inizio, fine);

      const precedente = nudgeTimer.current[evento.id];
      if (precedente) window.clearTimeout(precedente);
      nudgeTimer.current[evento.id] = window.setTimeout(() => {
        const ultimo = nudgeUltimo.current[evento.id];
        const snapshot = nudgeSnapshot.current[evento.id] ?? null;
        delete nudgeTimer.current[evento.id];
        delete nudgeUltimo.current[evento.id];
        delete nudgeSnapshot.current[evento.id];
        if (!ultimo) return;
        void inviaPianificazione(
          evento.id,
          ultimo.inizio,
          ultimo.fine,
          snapshot,
          `Evento ${ridimensiona ? "ridimensionato" : "spostato"}: ${etichettaGiorno(
            chiaveNaive(ultimo.inizio) ?? ultimo.inizio.slice(0, 10)
          )}, ${ultimo.inizio.slice(11, 16)}–${ultimo.fine.slice(11, 16)}.`
        );
      }, 400);

      setAvviso(
        `Evento ${ridimensiona ? "ridimensionato" : "spostato"}: ${inizio.slice(
          11,
          16
        )}–${fine.slice(11, 16)}.`
      );
    },
    [giorniVista, applicaPianificazione, inviaPianificazione]
  );

  // Timer pendenti alla chiusura della pagina: nessun PATCH orfano.
  useEffect(
    () => () => {
      for (const timer of Object.values(nudgeTimer.current)) {
        window.clearTimeout(timer);
      }
    },
    []
  );

  // --- Gestione etichette --------------------------------------------------

  const creaEtichetta = async () => {
    const nome = nuovaEtichetta.nome.trim();
    if (!nome) {
      setEtichetteErrore("Il nome è obbligatorio.");
      return;
    }
    setEtichetteSaving(true);
    setEtichetteErrore("");
    setEtichetteEsito("");
    try {
      const res = await fetch("/api/etichette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, colore: nuovaEtichetta.colore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      // La nuova etichetta viene subito assegnata all'evento aperto, se c'e'.
      if (showForm) {
        setForm((f) => ({ ...f, etichette: [...f.etichette, data.id as string] }));
      }
      setNuovaEtichetta({ nome: "", colore: "#6B7280" });
      setEtichetteEsito(`Etichetta «${nome}» creata.`);
      await loadEtichette();
    } catch (err) {
      setEtichetteErrore(err instanceof Error ? err.message : "Errore di creazione.");
    } finally {
      setEtichetteSaving(false);
    }
  };

  const aggiornaEtichetta = async (id: string, patch: { nome?: string; colore?: string }) => {
    setEtichetteSaving(true);
    setEtichetteErrore("");
    setEtichetteEsito("");
    try {
      const res = await fetch(`/api/etichette/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      await loadEtichette();
    } catch (err) {
      setEtichetteErrore(err instanceof Error ? err.message : "Errore di aggiornamento.");
    } finally {
      setEtichetteSaving(false);
    }
  };

  const eliminaEtichetta = async (id: string) => {
    setEtichetteSaving(true);
    setEtichetteErrore("");
    setEtichetteEsito("");
    try {
      const res = await fetch(`/api/etichette/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      // Se l'etichetta era nel filtro o nel form corrente, si toglie.
      setEtichetteAttive((prev) => {
        if (!prev.has(id)) return prev;
        const prossimo = new Set(prev);
        prossimo.delete(id);
        return prossimo;
      });
      setForm((f) => ({ ...f, etichette: f.etichette.filter((e) => e !== id) }));
      setEtichetteEsito("Etichetta eliminata.");
      await loadEtichette();
    } catch (err) {
      setEtichetteErrore(err instanceof Error ? err.message : "Errore di eliminazione.");
    } finally {
      setEtichetteSaving(false);
    }
  };

  const eliminaEvento = async (id: string) => {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/attivita/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      setShowForm(false);
      setPendingCompact(null);
      setForm(formVuoto());
      setEditingId(null);
      setConfirmDeleteId(null);
      loadEventi();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore di eliminazione.");
    } finally {
      setSaving(false);
    }
  };

  const chiudiForm = () => {
    setShowForm(false);
    setEditingId(null);
    setConfirmDeleteId(null);
    setFormError("");
    // Il modal può essere stato aperto da «Tutti i dettagli»: annullarlo
    // riporta al popover compatto con i dati di partenza.
    if (pendingCompact) {
      setPopover(pendingCompact);
      setPendingCompact(null);
    }
  };

  // ESC chiude il livello più alto: etichette (se aperte da dentro), poi il
  // modal evento, poi il drawer del pannello. Il popover ha il suo listener.
  useEffect(() => {
    if (!showForm && !showEtichette && !showPannello) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showEtichette) {
        setShowEtichette(false);
        setEtichetteErrore("");
        setEtichetteEsito("");
      } else if (showForm) {
        chiudiForm();
      } else {
        chiudiPannello();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, showEtichette, showPannello]);

  // Lo stesso pannello serve al desktop (colonna fissa) e al drawer mobile.
  // Nessun id interno: le due copie possono convivere nel DOM senza
  // duplicare `htmlFor`/`id`.
  const pannello = (
    <PannelloCalendario
      riferimento={riferimento}
      oggiChiave={oggiChiave}
      giorniConEventi={giorniConEventi}
      onSelezionaGiorno={selezionaGiorno}
      originiAttive={originiAttive}
      conteggioOrigini={conteggioOrigini}
      onToggleOrigine={toggleOrigine}
      etichette={etichette}
      etichetteAttive={etichetteAttive}
      conteggioEtichette={conteggioEtichette}
      onToggleEtichetta={toggleEtichetta}
      onGestisciEtichette={() => {
        setShowEtichette(true);
        setShowPannello(false);
      }}
      team={team}
      personaFiltro={personaFiltro}
      operatoreCorrente={operatore?.nome ?? null}
      onPersona={selezionaPersona}
      showFiltri={showFiltri}
      onToggleFiltri={() => setShowFiltri((v) => !v)}
      filtriAvanzati={{
        progetti,
        clienti,
        filtroProgetto,
        filtroCliente,
        filtroStato,
        onProgetto: setFiltroProgetto,
        onCliente: setFiltroCliente,
        onStato: setFiltroStato,
        onAzzera: () => {
          setFiltroProgetto("");
          setFiltroCliente("");
          setFiltroStato("TUTTE");
        },
      }}
    />
  );

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
              onClick={() => setShowEtichette((v) => !v)}
              title="Gestisci le etichette del calendario"
              aria-expanded={showEtichette}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                showEtichette
                  ? "border-inchiostro bg-inchiostro text-white"
                  : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              <LayersIcon className="h-3.5 w-3.5" />
              Etichette
              {etichette.length > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${
                    showEtichette ? "bg-white/20 text-white" : "bg-crema-scuro text-caldo-testo"
                  }`}
                >
                  {etichette.length}
                </span>
              )}
            </button>
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

        {/* Due pannelli come nella reference: a sinistra mini-mese, agende,
            etichette e squadra; a destra il periodo e la griglia. Sotto lg il
            pannello diventa un drawer: 272px fissi lascerebbero al calendario
            meno di 400px, cioè titoli spezzati a metà parola. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-2.5rem)] lg:overflow-y-auto lg:overscroll-contain">
            {pannello}
          </aside>

          <div className="min-w-0">
            {/* La barra di sezione porta il periodo come titolo e, sulla
                stessa riga, i comandi che agiscono su quel periodo. E' una
                striscia a sé, NON il contenitore della griglia: quella ha già
                la sua card, e due bordi paralleli a 4px sono rumore. */}
            <div className="mb-4 overflow-hidden rounded-card border border-crema-contorno bg-white">
              <SectionBar
                titolo={etichettaPeriodo(vista, riferimento)}
                icona={CalendarIcon}
              >
                <button
                  ref={agendeRef}
                  type="button"
                  onClick={() => setShowPannello(true)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-crema-contorno bg-white px-3 py-1.5 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro lg:hidden"
                >
                  <LayersIcon className="h-3.5 w-3.5" />
                  Agende
                </button>

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
                    onClick={() =>
                      setRiferimento((d) => spostaAnchor(vista, d, -1))
                    }
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
                    onClick={() =>
                      setRiferimento((d) => spostaAnchor(vista, d, 1))
                    }
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                    aria-label="Periodo successivo"
                  >
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </SectionBar>
            </div>

        {/* Annuncio per gli spostamenti da tastiera e i rollback. Sempre nel
            DOM: un'aria-live aggiunta solo al momento dell'annuncio non viene
            letta dai lettori di schermo. */}
        <p role="status" aria-live="polite" className="sr-only">
          {avviso}
        </p>

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

        {showEtichette && (
          <EtichetteModal
            etichette={etichette}
            nuova={nuovaEtichetta}
            setNuova={setNuovaEtichetta}
            saving={etichetteSaving}
            errore={etichetteErrore}
            esito={etichetteEsito}
            onCrea={creaEtichetta}
            onAggiorna={aggiornaEtichetta}
            onElimina={eliminaEtichetta}
            onChiudi={() => {
              setShowEtichette(false);
              setEtichetteErrore("");
              setEtichetteEsito("");
            }}
          />
        )}

        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-inchiostro/40 px-4 py-6"
            onMouseDown={(e) => {
              // Solo il click sullo sfondo chiude: uno sul contenuto non deve
              // propagare fino all'overlay (altrimenti perderebbe il form).
              if (e.target === e.currentTarget) chiudiForm();
            }}
          >
            <form
              onSubmit={salvaEvento}
              role="dialog"
              aria-modal="true"
              aria-label={editingId ? "Modifica evento" : "Nuovo evento"}
              className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-crema-contorno bg-white shadow-soft"
            >
              {/* Intestazione */}
              <div className="flex items-start justify-between gap-4 border-b border-crema-bordo px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crema-scuro">
                    {editingId ? (
                      <CalendarIcon className="h-4 w-4 text-inchiostro" />
                    ) : (
                      <PlusIcon className="h-4 w-4 text-inchiostro" />
                    )}
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-inchiostro">
                      {editingId ? "Modifica evento" : "Nuovo evento"}
                    </h2>
                    <p className="mt-0.5 text-xs text-caldo-testo">
                      {editingId
                        ? "Aggiorna i dettagli, le etichette o duplica l'evento."
                        : "Compila la scadenza per farlo comparire in calendario."}
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
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
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
                <label className={LABEL_CLASS}>Progetto</label>
                <select
                  value={form.progetto_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      progetto_id: e.target.value,
                      // Mutua esclusione: il progetto vince, come in payloadDaForm.
                      cliente_id: e.target.value ? "" : form.cliente_id,
                    })
                  }
                  className={`cursor-pointer ${INPUT_CLASS}`}
                >
                  <option value="">Nessun progetto</option>
                  {progetti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} · {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Cliente</label>
                <select
                  value={form.cliente_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cliente_id: e.target.value,
                      progetto_id: e.target.value ? "" : form.progetto_id,
                    })
                  }
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
              <div className="sm:col-span-2">
                <label className={LABEL_CLASS}>Descrizione</label>
                <textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  rows={2}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className={LABEL_CLASS}>Etichette</label>
                  <button
                    type="button"
                    onClick={() => setShowEtichette(true)}
                    className="cursor-pointer text-[11px] font-semibold text-caldo-testo underline-offset-2 transition-colors duration-200 hover:text-inchiostro hover:underline"
                  >
                    Gestisci etichette
                  </button>
                </div>
                {etichette.length === 0 ? (
                  <p className="mt-1 text-[11px] text-caldo-testo">
                    Nessuna etichetta: creane una con «Gestisci etichette».
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {etichette.map((et) => {
                      const attiva = form.etichette.includes(et.id);
                      return (
                        <button
                          key={et.id}
                          type="button"
                          aria-pressed={attiva}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              etichette: attiva
                                ? f.etichette.filter((id) => id !== et.id)
                                : [...f.etichette, et.id],
                            }))
                          }
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                            attiva
                              ? "border-inchiostro bg-inchiostro text-white"
                              : "border-crema-contorno bg-white text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                          }`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: et.colore }}
                          />
                          {et.nome}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
                </div>

                {formError && (
                  <p className="mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo">
                    {formError}
                  </p>
                )}
              </div>

              {/* Piè di pagina: azioni secondarie (duplica/elimina) a sinistra,
                  annulla e salvataggio a destra. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-crema-bordo px-5 py-3">
                {editingId && (
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={duplicaEvento}
                      disabled={saving}
                      title="Crea una copia di questo evento con le stesse etichette"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <LayersIcon className="h-3.5 w-3.5" />
                      Duplica
                    </button>
                    {confirmDeleteId === editingId ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium text-stato-urgenza-testo">Eliminare l&apos;evento?</span>
                        <button
                          type="button"
                          onClick={() => eliminaEvento(editingId)}
                          disabled={saving}
                          className="cursor-pointer rounded-control bg-pericolo px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-pericolo-scuro disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving ? "Eliminazione…" : "Sì, elimina"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="cursor-pointer rounded-control border border-crema-contorno px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(editingId)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-transparent bg-pericolo/10 px-3 py-1.5 text-xs font-semibold text-pericolo transition-colors duration-200 hover:bg-pericolo/20"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Elimina
                      </button>
                    )}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={chiudiForm}
                    className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Salvataggio…" : editingId ? "Salva modifiche" : "Crea evento"}
                  </button>
                </span>
              </div>
            </form>
          </div>
        )}

            {loading && eventi.length === 0 ? (
              <div className="flex items-center justify-center p-10">
                <p className="text-sm text-caldo-testo">
                  Caricamento calendario…
                </p>
              </div>
            ) : vista === "mese" ? (
              <VistaMese
                riferimento={riferimento}
                perGiorno={perGiorno}
                oggiChiave={oggiChiave}
                onNuovo={apriNuovoEvento}
                onModifica={apriModificaEvento}
              />
            ) : vista === "agenda" ? (
              <VistaAgenda
                perGiorno={perGiorno}
                onModifica={apriModificaEvento}
              />
            ) : (
              // Altezza esplicita: la griglia scorre dentro la card, così
              // l'header dei giorni resta sticky e la pagina non si allunga
              // di 1344px. Sotto lg la card cresce fino al minimo leggibile.
              <div className="h-[calc(100dvh-19rem)] min-h-[440px] overflow-hidden rounded-card border border-crema-contorno bg-white">
                {vista === "giorno" ? (
                  <VistaGiorno
                    giorno={riferimento}
                    oggiChiave={oggiChiave}
                    eventi={eventiVisibili}
                    onSlotClick={apriPopoverNuovo}
                    onEventoClick={apriPopoverEvento}
                    onSpostaEvento={spostaEvento}
                    onRidimensionaEvento={ridimensionaEvento}
                    onNudge={nudgeEvento}
                  />
                ) : (
                  <VistaSettimanaOraria
                    giorni={giorniVista}
                    oggiChiave={oggiChiave}
                    eventi={eventiVisibili}
                    onSlotClick={apriPopoverNuovo}
                    onEventoClick={apriPopoverEvento}
                    onSpostaEvento={spostaEvento}
                    onRidimensionaEvento={ridimensionaEvento}
                    onNudge={nudgeEvento}
                    onSelezionaGiorno={(k) => {
                      setRiferimento(daChiaveGiorno(k));
                      setVista("giorno");
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Drawer del pannello (sotto lg). Fuori da <main> perché `main > *`
          ha un'animazione con transform, che sposterebbe un position: fixed. */}
      {showPannello && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Chiudi agende e filtri"
            onClick={chiudiPannello}
            className="absolute inset-0 h-full w-full cursor-default bg-inchiostro/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Agende e filtri"
            className="absolute inset-y-0 left-0 w-[86vw] max-w-[320px] overflow-y-auto overscroll-contain bg-crema p-3 pb-20 md:left-[84px]"
          >
            <div className="mb-2 flex justify-end">
              <button
                ref={drawerCloseRef}
                type="button"
                onClick={chiudiPannello}
                aria-label="Chiudi"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-caldo-testo shadow-soft transition-colors duration-200 hover:text-inchiostro"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {pannello}
          </div>
        </div>
      )}

      {popover && (
        <PopoverEvento
          evento={popover.evento}
          dati={popover.dati}
          ancora={popover.ancora}
          etichette={etichette}
          progetti={progetti}
          clienti={clienti}
          operatori={team}
          saving={popoverSaving}
          errore={popoverErrore}
          onCambia={cambiaPopover}
          onSalva={salvaPopover}
          onChiudi={chiudiPopover}
          onElimina={eliminaPopover}
          onDuplica={duplicaPopover}
          onDettagli={vaiAiDettagli}
        />
      )}
    </div>
  );
}

function VistaMese({
  riferimento,
  perGiorno,
  oggiChiave,
  onNuovo,
  onModifica,
}: {
  riferimento: Date;
  perGiorno: Map<string, EventoCalendario[]>;
  oggiChiave: string;
  onNuovo: (giorno: Date) => void;
  onModifica: (e: EventoCalendario) => void;
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
                  <ChipEvento key={e.id} e={e} onModifica={onModifica} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VistaAgenda({
  perGiorno,
  onModifica,
}: {
  perGiorno: Map<string, EventoCalendario[]>;
  onModifica: (e: EventoCalendario) => void;
}) {
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
                      {(e.etichette ?? []).map((et) => (
                        <span
                          key={et.id}
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: et.colore }}
                          title={et.nome}
                        />
                      ))}
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
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onModifica(e)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-crema-bordo px-4 py-3 text-left transition-colors duration-200 hover:bg-crema-scuro"
                    title="Clicca per modificare"
                  >
                    {corpo}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
