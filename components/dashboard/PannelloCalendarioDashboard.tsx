"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { EventoCalendario, OrigineEvento } from "@/lib/types";
import { caricaApi } from "@/lib/api-cache";
import {
  chiaveGiorno,
  etichettaOrigine,
  formatOra,
  giorniOrdinati,
  origineEvento,
  raggruppaPerGiorno,
  rangeVista,
} from "@/lib/calendario";
import { AttivitaStatusBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import MiniMese from "@/components/calendario/MiniMese";
import { useOperatore } from "@/lib/operatore-client";
import Pannello from "./Pannello";
import { ArrowRightIcon, CalendarIcon, RefreshIcon } from "@/components/icons";

function inRitardo(evento: EventoCalendario): boolean {
  if (!evento.data_scadenza) return false;
  return new Date(evento.data_scadenza).getTime() < Date.now();
}

const ORIGINE_DOT: Record<OrigineEvento, string> = {
  progetto: "bg-stato-info-testo",
  cliente: "bg-stato-ok-testo",
  generico: "bg-stato-neutro-testo",
};

interface PannelloCalendarioDashboardProps {
  className?: string;
}

// Calendario compatto: mini-mese + impegni del giorno selezionato.
//
// Non riusa i dati della dashboard (`agenda` copre solo 7 giorni): per i
// pallini del mese serve la finestra intera, quindi si chiede a
// /api/calendario una volta per mese. Cambiare giorno NON rifà la richiesta:
// il mese e' gia' in memoria, il click e' istantaneo.
function PannelloCalendarioDashboard({
  className = "",
}: PannelloCalendarioDashboardProps) {
  // La data "oggi" nasce SOLO nel browser: la pagina e' prerenderizzata a
  // build time, quindi un `new Date()` nel primo render produrrebbe un mese
  // diverso da quello dell'utente e un errore di idratazione. Fino al mount
  // mostriamo una sagoma, poi il calendario vero.
  const [riferimento, setRiferimento] = useState<Date | null>(null);
  const [eventi, setEventi] = useState<EventoCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ricarica, setRicarica] = useState(0);
  const { operatore } = useOperatore();
  const nomeOperatore = operatore?.nome ?? "";

  const anno = riferimento?.getFullYear();
  const mese = riferimento?.getMonth();
  const seq = useRef(0);

  useEffect(() => {
    setRiferimento(new Date());
  }, []);

  useEffect(() => {
    if (anno === undefined || mese === undefined) return;
    const corrente = ++seq.current;
    // L'ancora del mese e' il giorno 1: la finestra e' la stessa griglia a 42
    // celle di MiniMese, cosi' i pallini non possono sfasarsi di una settimana.
    const ancora = new Date(anno, mese, 1);
    const { dal, al } = rangeVista("mese", ancora);

    setLoading(true);
    setError("");
    // Gli eventi del mese precedente non vanno mostrati sulla nuova griglia:
    // per un istante i pallini indicherebbero giorni sbagliati.
    setEventi([]);
    const url = `/api/calendario?dal=${encodeURIComponent(dal)}&al=${encodeURIComponent(al)}&light=1`;
    // Differito: il pannello calendario non deve competere con dashboard e
    // ticket per la prima risposta. `caricaApi` riusa il mese gia' visto.
    const timer = window.setTimeout(() => {
      caricaApi<{ eventi?: EventoCalendario[] }>(url)
        .then((data) => {
          if (corrente === seq.current) setEventi(data.eventi ?? []);
        })
        .catch((err) => {
          if (corrente === seq.current) {
            setError(err instanceof Error ? err.message : "Errore di caricamento.");
          }
        })
        .finally(() => {
          if (corrente === seq.current) setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [anno, mese, ricarica]);

  const oggiChiave = riferimento ? chiaveGiorno(new Date()) : "";
  const chiaveSel = riferimento ? chiaveGiorno(riferimento) : "";

  const perGiorno = useMemo(() => raggruppaPerGiorno(eventi), [eventi]);
  const giorniConEventi = useMemo(() => new Set(perGiorno.keys()), [perGiorno]);
  const impegniGiorno = perGiorno.get(chiaveSel) ?? [];

  // Quando il giorno scelto e' libero, la lista non resta vuota: mostra i
  // primi impegni successivi del mese. E' utile senza mentire, perche' il
  // titolo dice che non sono del giorno selezionato.
  const prossimi = useMemo(
    () =>
      giorniOrdinati(perGiorno)
        .filter((giorno) => giorno > chiaveSel)
        .flatMap((giorno) => perGiorno.get(giorno) ?? [])
        .slice(0, 4),
    [perGiorno, chiaveSel]
  );

  const etichettaData = riferimento
    ? riferimento.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const ricaricaMese = useCallback(() => setRicarica((n) => n + 1), []);

  if (!riferimento) {
    return (
      <Pannello ariaLabel="Calendario e impegni" className={className}>
        <SectionBar titolo="Calendario" icona={CalendarIcon} />
        <div className="animate-pulse p-4">
          <div className="h-3 w-28 rounded-full bg-crema-scuro" />
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="mx-auto h-6 w-6 rounded-full bg-crema-scuro" />
            ))}
          </div>
          <div className="mt-4 h-2.5 w-32 rounded-full bg-crema-scuro" />
          <div className="mt-3 space-y-2">
            <div className="h-8 rounded-control bg-crema-scuro" />
            <div className="h-8 rounded-control bg-crema-scuro" />
          </div>
        </div>
      </Pannello>
    );
  }

  return (
    <Pannello ariaLabel="Calendario e impegni" className={className}>
      <SectionBar titolo="Calendario" icona={CalendarIcon} conteggio={loading ? undefined : eventi.length}>
        <Link
          href="/calendario"
          className="flex items-center gap-1 rounded-full border border-crema-contorno bg-white px-2.5 py-1 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
        >
          Apri
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </SectionBar>

      <div className="border-b border-crema-bordo px-4 pb-3 pt-4">
        <MiniMese
          riferimento={riferimento}
          oggiChiave={oggiChiave}
          giorniConEventi={giorniConEventi}
          onSeleziona={setRiferimento}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
            {etichettaData}
          </p>
          {error && (
            <button
              type="button"
              onClick={ricaricaMese}
              className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-stato-urgenza-testo hover:underline"
            >
              <RefreshIcon className="h-3 w-3" />
              Riprova
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && eventi.length === 0 ? (
            <Scheletro />
          ) : error && eventi.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-stato-urgenza-testo">{error}</p>
          ) : impegniGiorno.length > 0 ? (
            <div className="divide-y divide-crema-bordo">
              {impegniGiorno.map((e) => (
                <RigaEvento key={e.id} evento={e} nomeOperatore={nomeOperatore} />
              ))}
            </div>
          ) : (
            <div>
              <p className="px-4 py-4 text-center text-xs text-caldo-testo">
                Nessun impegno in questa giornata.
              </p>
              {prossimi.length > 0 && (
                <>
                  <p className="border-y border-crema-bordo bg-crema-scuro/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-caldo-testo">
                    Prossimi impegni
                  </p>
                  <div className="divide-y divide-crema-bordo">
                    {prossimi.map((e) => (
                      <RigaEvento key={e.id} evento={e} mostraGiorno nomeOperatore={nomeOperatore} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Pannello>
  );
}

function RigaEvento({
  evento,
  mostraGiorno = false,
  nomeOperatore,
}: {
  evento: EventoCalendario;
  mostraGiorno?: boolean;
  nomeOperatore: string;
}) {
  const origine = origineEvento(evento);
  const href = evento.progetto_id ? `/progetti/${evento.progetto_id}` : "/calendario";
  const miei = nomeOperatore
    ? [evento.assegnatario, ...(evento.persone ?? [])].some(
        (p) => p?.trim().toLowerCase() === nomeOperatore.trim().toLowerCase()
      )
    : false;
  const giorno = mostraGiorno
    ? new Date(`${(evento.data_scadenza ?? "").slice(0, 10)}T00:00`).toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 px-4 py-2.5 transition-colors duration-200 hover:bg-crema-scuro"
    >
      <span
        className={`tabular w-10 shrink-0 pt-0.5 text-xs ${
          inRitardo(evento)
            ? "font-semibold text-stato-urgenza-testo"
            : "text-caldo-testo"
        }`}
      >
        {formatOra(evento.data_scadenza)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-inchiostro">{evento.titolo}</p>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-caldo-testo">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ORIGINE_DOT[origine]}`} />
          <span className="truncate">{etichettaOrigine(evento)}</span>
          {giorno && <span className="shrink-0 capitalize">· {giorno}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        {(evento.etichette ?? []).slice(0, 3).map((et) => (
          <span
            key={et.id}
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: et.colore }}
            title={et.nome}
            aria-label={`Etichetta ${et.nome}`}
          />
        ))}
        {miei && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-lime ring-2 ring-lime/30"
            title="Assegnata a te"
            aria-label="Assegnata a te"
          />
        )}
        <AttivitaStatusBadge stato={evento.stato} />
      </div>
    </Link>
  );
}

function Scheletro() {
  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-2.5 w-8 rounded-full bg-crema-scuro" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 rounded-full bg-crema-scuro" />
            <div className="h-2 w-1/3 rounded-full bg-crema-scuro" />
          </div>
          <div className="h-5 w-14 rounded-full bg-crema-scuro" />
        </div>
      ))}
    </div>
  );
}

export default memo(PannelloCalendarioDashboard);
