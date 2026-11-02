"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import { LoaderIcon, MailIcon, RefreshIcon } from "@/components/icons";

interface InboxRiga {
  id: string;
  from_email: string;
  from_nome: string | null;
  subject: string;
  body_preview: string | null;
  ticket_id: string | null;
  numero_ticket: string | null;
  stato: string;
  data_creazione: string;
}

const STATO_BADGE: Record<string, { label: string; classe: string }> = {
  processata: { label: "Processata", classe: "bg-stato-ok-bg border-stato-ok-bordo text-stato-ok-testo" },
  errore: { label: "Errore", classe: "bg-stato-urgenza-bg border-stato-urgenza-bordo text-stato-urgenza-testo" },
  ignorata: { label: "Ignorata", classe: "bg-stato-neutro-bg border-stato-neutro-bordo text-stato-neutro-testo" },
};

const pad = (n: number) => String(n).padStart(2, "0");

function quando(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Registro delle email in entrata (IMAP worker -> webhook). Serve a vedere
// cosa e' arrivato e se ha generato un ticket: e' un registro di sola
// lettura, non si risponde da qui.
export default function InboxPage() {
  const { operatore, caricamento } = useOperatore();

  const [righe, setRighe] = useState<InboxRiga[]>([]);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = filtro ? `?stato=${filtro}` : "";
      const res = await fetch(`/api/inbox${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel caricamento.");
      setRighe((data as { inbox?: InboxRiga[] }).inbox ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => {
    if (!operatore) return;
    void carica();
  }, [operatore, carica]);

  if (caricamento) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-inchiostro">Accesso richiesto</h2>
          <p className="mt-2 text-sm text-caldo-testo">Devi effettuare il login per accedere a questa pagina.</p>
          <Link href="/login?redirect=/inbox" className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo">
            Vai al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Inbox Email"
          sottotitolo="Email arrivate via IMAP e stato di elaborazione — registro in sola lettura."
          azioni={
            <button
              type="button"
              onClick={carica}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-3 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon className="h-4 w-4" />
              {loading ? "Caricamento..." : "Aggiorna"}
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-crema-contorno bg-white p-4">
          <label htmlFor="inbox-stato" className="text-xs font-semibold text-caldo-testo">Stato</label>
          <select
            id="inbox-stato"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro transition-colors duration-200 focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            <option value="">Tutte</option>
            <option value="processata">Processate</option>
            <option value="errore">Con errore</option>
            <option value="ignorata">Ignorate</option>
          </select>
          <span className="tabular text-xs text-caldo-testo">{righe.length} email</span>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo">
            {error}
          </div>
        )}

        {righe.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-crema-contorno bg-white p-10 text-center">
            <MailIcon className="h-8 w-8 text-caldo-testo" />
            <p className="text-sm text-caldo-testo">Nessuna email in archivio.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r) => {
              const badge = STATO_BADGE[r.stato] ?? STATO_BADGE.ignorata;
              return (
                <article key={r.id} className="rounded-card border border-crema-contorno bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-inchiostro">{r.subject}</p>
                      <p className="mt-0.5 truncate text-xs text-caldo-testo">
                        Da: <span className="font-medium text-inchiostro">{r.from_nome || r.from_email}</span>
                        {r.from_nome && r.from_nome !== r.from_email && (
                          <span className="ml-1">&lt;{r.from_email}&gt;</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.classe}`}>
                        {badge.label}
                      </span>
                      <span className="tabular text-[11px] text-caldo-testo">{quando(r.data_creazione)}</span>
                    </div>
                  </div>
                  {r.body_preview && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-caldo-testo">{r.body_preview}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {r.numero_ticket ? (
                      <Link
                        href={`/tickets/${r.ticket_id}`}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-2.5 py-1 font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
                      >
                        Ticket {r.numero_ticket}
                      </Link>
                    ) : (
                      <span className="rounded-control border border-dashed border-crema-contorno px-2.5 py-1 text-caldo-testo">
                        Nessun ticket collegato
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
