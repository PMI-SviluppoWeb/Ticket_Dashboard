"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderIcon, XIcon } from "@/components/icons";

export type AzioneInbox = "crea_ticket" | "aggancia" | "ignora" | "recupera";

// Dati minimi che la lista ha gia': il modale si apre subito con questi e poi
// sostituisce il corpo con il messaggio completo arrivato dall'API.
export interface RigaInboxDettaglio {
  id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  ticket_id: string | null;
  numero_ticket: string | null;
  stato: string;
  stato_triage: string | null;
  esito_ai: string | null;
  confidenza: number | null;
  motivo: string | null;
  correzione_umana: string | null;
  data_creazione: string;
}

export interface DettaglioInbox extends RigaInboxDettaglio {
  message_id: string;
  body_text: string;
  body_html_disponibile: boolean;
  html_convertito: boolean;
  casella_id: string | null;
  casella_indirizzo: string | null;
  in_reply_to: string | null;
  riferimenti: string | null;
  corretto_da: string | null;
}

interface Props {
  riga: RigaInboxDettaglio | null;
  dettaglio: DettaglioInbox | null;
  caricando: boolean;
  errore: string;
  busy: boolean;
  onClose: () => void;
  onAzione: (azione: AzioneInbox, ticketId?: string) => Promise<boolean>;
}

const pad = (n: number) => String(n).padStart(2, "0");

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function badgeDi(riga: RigaInboxDettaglio): { label: string; classe: string } {
  const esito =
    riga.stato_triage ??
    (riga.stato === "processata" ? "ticket" : riga.stato === "ignorata" ? "ignora" : null);
  if (esito === "ticket") {
    return { label: "Ticket", classe: "bg-stato-ok-bg border-stato-ok-bordo text-stato-ok-testo" };
  }
  if (esito === "ignora") {
    return { label: "Ignorata", classe: "bg-stato-neutro-bg border-stato-neutro-bordo text-stato-neutro-testo" };
  }
  return { label: "Da verificare", classe: "bg-stato-urgenza-bg border-stato-urgenza-bordo text-stato-urgenza-testo" };
}

function Info({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">{label}</p>
      <p className="mt-0.5 break-words text-xs text-inchiostro">{value || "—"}</p>
    </div>
  );
}

// Dettaglio dell'email in arrivo: serve a decidere con il contenuto completo
// (non solo l'anteprima) se creare il ticket, agganciarlo o ignorarlo.
export default function InboxDettaglio({
  riga,
  dettaglio,
  caricando,
  errore,
  busy,
  onClose,
  onAzione,
}: Props) {
  const [mostraAggancia, setMostraAggancia] = useState(false);
  const [ticketInput, setTicketInput] = useState("");

  useEffect(() => {
    if (!riga) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [riga, onClose]);

  useEffect(() => {
    setMostraAggancia(false);
    setTicketInput("");
  }, [riga?.id]);

  if (!riga) return null;

  const badge = badgeDi(riga);
  const stato =
    riga.stato_triage ??
    (riga.stato === "processata" ? "ticket" : riga.stato === "ignorata" ? "ignora" : "da_verificare");
  const puoCreare = stato === "da_verificare";
  const puoRecuperare = stato === "ignora";

  async function esegui(azione: AzioneInbox, ticketId?: string) {
    const ok = await onAzione(azione, ticketId);
    if (ok) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dettaglio email"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-panel border border-crema-contorno bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-crema-bordo p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.classe}`}>
                {badge.label}
              </span>
              <span className="tabular text-[11px] text-caldo-testo">{quando(riga.data_creazione)}</span>
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-inchiostro">{riga.subject}</h2>
            <p className="mt-1 break-words text-xs text-caldo-testo">
              Da <span className="font-medium text-inchiostro">{riga.from_nome || riga.from_email}</span>
              {riga.from_nome && riga.from_nome !== riga.from_email && (
                <span> &lt;{riga.from_email}&gt;</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi dettaglio"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {errore && (
            <p role="alert" className="mb-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-2 text-xs font-medium text-stato-urgenza-testo">
              {errore}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Casella" value={dettaglio?.casella_indirizzo ?? dettaglio?.casella_id ?? "—"} />
            <Info label="Stato triage" value={badge.label} />
            <Info label="Esito AI" value={dettaglio?.esito_ai ?? "—"} />
            <Info
              label="Confidenza"
              value={dettaglio?.confidenza != null ? `${Math.round(dettaglio.confidenza * 100)}%` : "—"}
            />
            <Info label="Motivo" value={dettaglio?.motivo ?? "—"} className="sm:col-span-2" />
            {dettaglio?.correzione_umana && (
              <Info label="Correzione umana" value={dettaglio.correzione_umana} />
            )}
            {dettaglio?.numero_ticket && (
              <Info label="Ticket collegato" value={dettaglio.numero_ticket} />
            )}
          </div>

          <div className="mt-4 rounded-control border border-crema-contorno bg-crema-scuro/40 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">
              Messaggio
            </p>
            {caricando ? (
              <div className="flex items-center gap-2 py-4 text-xs text-caldo-testo">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Caricamento del messaggio completo...
              </div>
            ) : dettaglio ? (
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-inchiostro">
                {dettaglio.body_text || "(nessun corpo testuale)"}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-caldo-testo">
                {riga.body_preview || "Corpo del messaggio non disponibile."}
              </p>
            )}
            {dettaglio?.html_convertito && (
              <p className="mt-3 text-[11px] text-caldo-testo">
                Il messaggio originale era HTML: qui viene mostrato come testo.
              </p>
            )}
          </div>

          {dettaglio && (
            <details className="mt-4 rounded-control border border-crema-contorno p-3 text-xs text-caldo-testo">
              <summary className="cursor-pointer font-semibold text-caldo-testo">
                Dettagli tecnici
              </summary>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="inline font-semibold">Message-ID: </dt>
                  <dd className="inline break-all">{dettaglio.message_id}</dd>
                </div>
                {dettaglio.in_reply_to && (
                  <div>
                    <dt className="inline font-semibold">In-Reply-To: </dt>
                    <dd className="inline break-all">{dettaglio.in_reply_to}</dd>
                  </div>
                )}
                {dettaglio.riferimenti && (
                  <div>
                    <dt className="inline font-semibold">Riferimenti: </dt>
                    <dd className="inline break-all">{dettaglio.riferimenti}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-semibold">Id interno: </dt>
                  <dd className="inline break-all">{dettaglio.id}</dd>
                </div>
              </dl>
            </details>
          )}
        </div>

        <footer className="border-t border-crema-bordo p-4">
          <div className="flex flex-wrap items-center gap-2">
            {dettaglio?.ticket_id && (
              <Link
                href={`/tickets/${dettaglio.ticket_id}`}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-2.5 py-1.5 text-xs font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
              >
                Apri ticket {dettaglio.numero_ticket}
              </Link>
            )}

            {puoCreare && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void esegui("crea_ticket")}
                  className="cursor-pointer rounded-control bg-inchiostro px-2.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Crea ticket
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMostraAggancia((v) => !v)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Aggancia a ticket
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void esegui("ignora")}
                  className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Ignora
                </button>
              </>
            )}

            {puoRecuperare && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void esegui("recupera")}
                className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
              >
                Recupera
              </button>
            )}

            {busy && <LoaderIcon className="h-4 w-4 animate-spin text-caldo-testo" />}
          </div>

          {puoCreare && mostraAggancia && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (ticketInput.trim()) {
                  void esegui("aggancia", ticketInput.trim());
                }
              }}
            >
              <input
                type="text"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="Numero (TICK-000123) o id del ticket"
                className="min-w-[240px] flex-1 rounded-control border border-crema-contorno px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
              <button
                type="submit"
                disabled={busy || !ticketInput.trim()}
                className="cursor-pointer rounded-control bg-inchiostro px-2.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
              >
                Conferma
              </button>
            </form>
          )}
        </footer>
      </div>
    </div>
  );
}
