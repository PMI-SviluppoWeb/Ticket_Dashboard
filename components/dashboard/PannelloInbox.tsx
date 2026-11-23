"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { caricaApi, invalidaCache } from "@/lib/api-cache";
import { usePolling } from "@/lib/usePolling";
import SectionBar from "@/components/SectionBar";
import Pannello from "./Pannello";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LoaderIcon,
  MailIcon,
  RefreshIcon,
} from "@/components/icons";

interface InboxRiga {
  id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  numero_ticket: string | null;
  stato_triage: string | null;
  confidenza: number | null;
  motivo: string | null;
  data_creazione: string;
}

interface PannelloInboxProps {
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function quando(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Posta in arrivo in dashboard: le sole email che il triage ha lasciato a un
// umano. Le azioni sono le due che servono davvero in un cruscotto (crea
// ticket / ignora); l'aggancio a un ticket esistente resta nella pagina
// completa, dove c'e' spazio per cercarlo.
function PannelloInbox({ className = "" }: PannelloInboxProps) {
  const [righe, setRighe] = useState<InboxRiga[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [esito, setEsito] = useState<{ testo: string; ticketId?: string } | null>(null);

  const carica = useCallback(async (forza = false) => {
    setErrore("");
    try {
      const data = await caricaApi<{ inbox?: InboxRiga[] }>(
        "/api/inbox?stato=da_verificare&limit=20",
        { forza }
      );
      setRighe(data.inbox ?? []);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Differito: la posta e' sotto la piega e non deve precedere ticket e KPI.
    const timer = window.setTimeout(() => void carica(false), 300);
    return () => window.clearTimeout(timer);
  }, [carica]);

  // La coda non e' un flusso real-time: un minuto basta, e la scheda nascosta
  // ferma il polling (lib/usePolling).
  usePolling(
    useCallback(() => {
      void carica(true);
    }, [carica]),
    60_000
  );

  const esegui = useCallback(
    async (id: string, azione: "crea_ticket" | "ignora") => {
      setBusyId(id);
      setErrore("");
      setEsito(null);
      try {
        const res = await fetch(`/api/inbox/${id}/azione`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ azione }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          ticketId?: string;
          numero?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Operazione non riuscita.");

        setRighe((prev) => prev.filter((r) => r.id !== id));
        invalidaCache("/api/inbox");
        setEsito(
          azione === "crea_ticket"
            ? {
                testo: data.numero ? `Ticket ${data.numero} creato` : "Email trasformata in ticket",
                ticketId: data.ticketId,
              }
            : { testo: "Email ignorata" }
        );
      } catch (err) {
        setErrore(err instanceof Error ? err.message : "Operazione non riuscita.");
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  return (
    <Pannello ariaLabel="Email da verificare" className={className}>
      <SectionBar titolo="Email da verificare" icona={MailIcon} conteggio={loading ? undefined : righe.length}>
        <button
          type="button"
          onClick={() => void carica(true)}
          disabled={loading}
          aria-label="Aggiorna le email"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshIcon className="h-3.5 w-3.5" />
        </button>
        <Link
          href="/inbox"
          className="flex items-center gap-1 rounded-full border border-crema-contorno bg-white px-2.5 py-1 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
        >
          Apri inbox
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </SectionBar>

      {esito && (
        <p className="mx-4 mt-3 flex items-center gap-1.5 rounded-control border border-stato-ok-bordo bg-stato-ok-bg px-3 py-2 text-xs font-medium text-stato-ok-testo">
          <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{esito.testo}</span>
          {esito.ticketId && (
            <Link href={`/tickets/${esito.ticketId}`} className="ml-auto font-semibold underline underline-offset-2">
              Apri
            </Link>
          )}
        </p>
      )}

      {errore && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
        >
          {errore}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && righe.length === 0 ? (
          <Scheletro />
        ) : righe.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stato-ok-bg text-stato-ok-testo">
              <CheckCircleIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-inchiostro">Nessuna email da verificare</p>
            <p className="text-xs text-caldo-testo">La coda di triage e&apos; vuota.</p>
          </div>
        ) : (
          <div className="divide-y divide-crema-bordo">
            {righe.map((r) => {
              const occupato = busyId === r.id;
              return (
                <article key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-stato-neutro-bg text-caldo-testo">
                    <MailIcon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-inchiostro">{r.subject}</p>
                    <p className="truncate text-[11px] text-caldo-testo">
                      Da {r.from_nome || r.from_email} · {quando(r.data_creazione)}
                    </p>
                    {r.body_preview && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-caldo-testo">
                        {r.body_preview}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={occupato}
                        onClick={() => esegui(r.id, "crea_ticket")}
                        className="cursor-pointer rounded-control bg-inchiostro px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Crea ticket
                      </button>
                      <button
                        type="button"
                        disabled={occupato}
                        onClick={() => esegui(r.id, "ignora")}
                        className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Ignora
                      </button>

                      {occupato && <LoaderIcon className="h-3.5 w-3.5 animate-spin text-caldo-testo" />}

                      {r.confidenza !== null && (
                        <span
                          className={`ml-auto tabular rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            r.confidenza < 0.55
                              ? "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo"
                              : "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo"
                          }`}
                          title={r.motivo ?? "Confidenza del triage"}
                        >
                          AI {Math.round(r.confidenza * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Pannello>
  );
}

function Scheletro() {
  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-control bg-crema-scuro" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 rounded-full bg-crema-scuro" />
            <div className="h-2 w-1/2 rounded-full bg-crema-scuro" />
            <div className="h-5 w-24 rounded-full bg-crema-scuro" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(PannelloInbox);
