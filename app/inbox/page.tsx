"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import InboxDettaglio, { type DettaglioInbox } from "@/components/InboxDettaglio";
import { EyeIcon, LoaderIcon, MailIcon, RefreshIcon } from "@/components/icons";

interface InboxRiga {
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

type Tab = "da_verificare" | "processata" | "ignorata";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "da_verificare", label: "Da verificare" },
  { id: "processata", label: "Ticket" },
  { id: "ignorata", label: "Ignorate" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function quando(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statoRiga(r: InboxRiga): { label: string; classe: string } {
  const esito = r.stato_triage ?? (r.stato === "processata" ? "ticket" : r.stato === "ignorata" ? "ignora" : null);
  if (esito === "ticket") {
    return { label: "Ticket", classe: "bg-stato-ok-bg border-stato-ok-bordo text-stato-ok-testo" };
  }
  if (esito === "ignora") {
    return { label: "Ignorata", classe: "bg-stato-neutro-bg border-stato-neutro-bordo text-stato-neutro-testo" };
  }
  return { label: "Da verificare", classe: "bg-stato-urgenza-bg border-stato-urgenza-bordo text-stato-urgenza-testo" };
}

// Posta in arrivo: le email che il triage non ha deciso di trasformare
// automaticamente in ticket vengono qui. L'umano conferma, aggancia o ignora;
// ogni scelta viene registrata per migliorare il triage.
export default function InboxPage() {
  const { operatore, caricamento } = useOperatore();

  const [tab, setTab] = useState<Tab>("da_verificare");
  const [righe, setRighe] = useState<InboxRiga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aggancia, setAggancia] = useState<{ id: string; valore: string } | null>(null);

  // Dettaglio del messaggio completo: si apre subito con i dati della lista e
  // poi carica corpo e metadati da /api/inbox/[id].
  const [dettaglioRiga, setDettaglioRiga] = useState<InboxRiga | null>(null);
  const [dettaglio, setDettaglio] = useState<DettaglioInbox | null>(null);
  const [caricandoDettaglio, setCaricandoDettaglio] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inbox?stato=${tab}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Errore nel caricamento.");
      setRighe((data as { inbox?: InboxRiga[] }).inbox ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!operatore) return;
    void carica();
  }, [operatore, carica]);

  const eseguiAzione = useCallback(
    async (id: string, azione: "crea_ticket" | "aggancia" | "ignora" | "recupera", ticketId?: string) => {
      setBusyId(id);
      setError("");
      try {
        const res = await fetch(`/api/inbox/${id}/azione`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ azione, ticketId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Operazione non riuscita.");
        setAggancia(null);
        await carica();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Operazione non riuscita.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [carica]
  );

  const apriDettaglio = useCallback(async (riga: InboxRiga) => {
    setDettaglioRiga(riga);
    setDettaglio(null);
    setCaricandoDettaglio(true);
    setError("");
    try {
      const res = await fetch(`/api/inbox/${riga.id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Errore nel caricamento dell'email.");
      }
      setDettaglio((data as { email: DettaglioInbox }).email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dell'email.");
    } finally {
      setCaricandoDettaglio(false);
    }
  }, []);

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

  if (operatore.ruolo !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-inchiostro">Accesso riservato</h2>
          <p className="mt-2 text-sm text-caldo-testo">La posta in arrivo è visibile solo agli amministratori.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Posta in arrivo"
          sottotitolo="Email che il triage ha lasciato a un umano: crea il ticket, aggancialo a uno esistente oppure ignora. Ogni scelta viene registrata."
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

        <AreaTabs areaId="email" />

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-crema-contorno bg-white p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`cursor-pointer rounded-control px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                tab === t.id
                  ? "bg-inchiostro text-white"
                  : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto tabular pr-2 text-xs text-caldo-testo">{righe.length} email</span>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm font-medium text-stato-urgenza-testo">
            {error}
          </div>
        )}

        {righe.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-crema-contorno bg-white p-10 text-center">
            <MailIcon className="h-8 w-8 text-caldo-testo" />
            <p className="text-sm text-caldo-testo">
              {tab === "da_verificare"
                ? "Nessuna email in attesa di verifica."
                : tab === "processata"
                  ? "Nessuna email trasformata in ticket."
                  : "Nessuna email ignorata."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {righe.map((r) => {
              const badge = statoRiga(r);
              const occupato = busyId === r.id;
              return (
                <article
                  key={r.id}
                  className="cursor-pointer rounded-card border border-crema-contorno bg-white p-4 transition-colors duration-200 hover:border-inchiostro/30"
                  onClick={() => void apriDettaglio(r)}
                >
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

                  {(r.motivo || r.confidenza !== null || r.correzione_umana) && (
                    <p className="mt-2 text-[11px] text-caldo-testo">
                      {r.motivo && <span>Triage: {r.motivo}</span>}
                      {r.confidenza !== null && (
                        <span className="ml-2 tabular">
                          confidenza {(r.confidenza * 100).toFixed(0)}%
                        </span>
                      )}
                      {r.correzione_umana && (
                        <span className="ml-2">· correzione: {r.correzione_umana}</span>
                      )}
                    </p>
                  )}

                  <div
                    className="mt-3 flex flex-wrap items-center gap-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void apriDettaglio(r)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-2.5 py-1 font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                    >
                      <EyeIcon className="h-3.5 w-3.5" />
                      Apri
                    </button>

                    {r.numero_ticket && r.ticket_id && (
                      <Link
                        href={`/tickets/${r.ticket_id}`}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-2.5 py-1 font-semibold text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
                      >
                        Ticket {r.numero_ticket}
                      </Link>
                    )}

                    {tab === "da_verificare" && (
                      <>
                        <button
                          type="button"
                          disabled={occupato}
                          onClick={() => eseguiAzione(r.id, "crea_ticket")}
                          className="cursor-pointer rounded-control bg-inchiostro px-2.5 py-1 font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Crea ticket
                        </button>
                        <button
                          type="button"
                          disabled={occupato}
                          onClick={() =>
                            setAggancia(
                              aggancia?.id === r.id ? null : { id: r.id, valore: "" }
                            )
                          }
                          className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Aggancia a ticket
                        </button>
                        <button
                          type="button"
                          disabled={occupato}
                          onClick={() => eseguiAzione(r.id, "ignora")}
                          className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Ignora
                        </button>
                      </>
                    )}

                    {tab === "ignorata" && (
                      <button
                        type="button"
                        disabled={occupato}
                        onClick={() => eseguiAzione(r.id, "recupera")}
                        className="cursor-pointer rounded-control border border-crema-contorno px-2.5 py-1 font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Recupera
                      </button>
                    )}

                    {occupato && <LoaderIcon className="h-4 w-4 animate-spin text-caldo-testo" />}
                  </div>

                  {aggancia?.id === r.id && (
                    <form
                      className="mt-3 flex flex-wrap items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (aggancia.valore.trim()) {
                          void eseguiAzione(r.id, "aggancia", aggancia.valore.trim());
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={aggancia.valore}
                        onChange={(e) => setAggancia({ id: r.id, valore: e.target.value })}
                        placeholder="Numero (TICK-000123) o id del ticket"
                        className="min-w-[240px] flex-1 rounded-control border border-crema-contorno px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                      />
                      <button
                        type="submit"
                        disabled={occupato || !aggancia.valore.trim()}
                        className="cursor-pointer rounded-control bg-inchiostro px-2.5 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Conferma
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <InboxDettaglio
        riga={dettaglioRiga}
        dettaglio={dettaglio}
        caricando={caricandoDettaglio}
        errore={error}
        busy={dettaglioRiga ? busyId === dettaglioRiga.id : false}
        onClose={() => {
          setDettaglioRiga(null);
          setDettaglio(null);
        }}
        onAzione={(azione, ticketId) =>
          dettaglioRiga
            ? eseguiAzione(dettaglioRiga.id, azione, ticketId)
            : Promise.resolve(false)
        }
      />
    </div>
  );
}
