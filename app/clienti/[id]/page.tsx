"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import CommercialeForm from "@/components/clienti/CommercialeForm";
import QuestionariPanel from "@/components/clienti/QuestionariPanel";
import InventarioPanel from "@/components/clienti/InventarioPanel";
import TicketReportPanel from "@/components/clienti/TicketReportPanel";
import {
  AlertTriangleIcon,
  BookIcon,
  FolderIcon,
  LoaderIcon,
  RefreshIcon,
  UserIcon,
} from "@/components/icons";
import type {
  ClienteCommerciale,
  ClienteScheda,
  PrioritaCommerciale,
  Questionario,
  StatoClienteCommerciale,
} from "@/lib/types";

type Tab = "panoramica" | "questionari" | "inventario" | "ticket" | "progetti";

const STATO_LABEL: Record<StatoClienteCommerciale, string> = {
  attivo: "Attivo",
  prospect: "Prospect",
  a_rischio: "A rischio",
  perso: "Perso",
};

const STATO_CLASSE: Record<StatoClienteCommerciale, string> = {
  attivo: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  prospect: "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo",
  a_rischio: "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo",
  perso: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
};

const PRIORITA_LABEL: Record<PrioritaCommerciale, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};

function data(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function minutiLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ClientePage({ params }: { params: { id: string } }) {
  const { operatore, caricamento } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";

  const [scheda, setScheda] = useState<ClienteScheda | null>(null);
  const [commerciale, setCommerciale] = useState<ClienteCommerciale | null>(null);
  const [questionari, setQuestionari] = useState<Questionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [tab, setTab] = useState<Tab>("panoramica");

  const caricaScheda = useCallback(async () => {
    const res = await fetch(`/api/clienti/${params.id}/scheda`, {
      cache: "no-store",
    });
    const dati = await res.json();
    if (!res.ok) {
      throw new Error((dati as { error?: string }).error ?? "Errore nel caricamento.");
    }
    setScheda(dati as ClienteScheda);
  }, [params.id]);

  const caricaAdmin = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    setAdminError("");
    try {
      const [resC, resQ] = await Promise.all([
        fetch(`/api/clienti/${params.id}/commerciale`, { cache: "no-store" }),
        fetch(`/api/clienti/${params.id}/questionari`, { cache: "no-store" }),
      ]);
      if (resC.ok) {
        const dataC = (await resC.json()) as {
          commerciale?: ClienteCommerciale | null;
        };
        setCommerciale(dataC.commerciale ?? null);
      }
      if (resQ.ok) {
        const dataQ = (await resQ.json()) as { questionari?: Questionario[] };
        setQuestionari(dataQ.questionari ?? []);
      }
    } catch {
      setAdminError("Impossibile caricare la scheda commerciale.");
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, params.id]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        await caricaScheda();
      } catch (err) {
        if (!annullato) {
          setError(err instanceof Error ? err.message : "Errore nel caricamento.");
        }
      } finally {
        if (!annullato) setLoading(false);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [caricaScheda]);

  useEffect(() => {
    if (isAdmin) void caricaAdmin();
  }, [isAdmin, caricaAdmin]);

  useEffect(() => {
    if (!isAdmin && (tab === "questionari" || tab === "inventario")) {
      setTab("panoramica");
    }
  }, [isAdmin, tab]);

  const ricarica = useCallback(async () => {
    try {
      await Promise.all([caricaScheda(), caricaAdmin()]);
    } catch {
      // Gli errori sono già mostrati dai singoli caricamenti.
    }
  }, [caricaScheda, caricaAdmin]);

  if (caricamento || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Link
          href={`/login?redirect=/clienti/${params.id}`}
          className="rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white"
        >
          Vai al login
        </Link>
      </div>
    );
  }

  if (error || !scheda) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="alert"
          className="rounded-card border border-stato-urgenza-bordo bg-stato-urgenza-bg p-4 text-sm text-stato-urgenza-testo"
        >
          {error || "Cliente non trovato."}
        </div>
      </div>
    );
  }

  const { cliente } = scheda;
  const ticketsAperti = scheda.tickets.filter(
    (t) => t.stato === "NUOVO" || t.stato === "IN_CORSO"
  ).length;
  const ticketsChiusi = scheda.tickets.filter(
    (t) => t.stato === "CHIUSO" || t.stato === "RISOLTO"
  ).length;
  const questionariCompilati = questionari.filter((q) => q.stato === "compilato").length;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "panoramica", label: "Panoramica" },
    ...(isAdmin
      ? ([
          { id: "questionari", label: "Questionari" },
          { id: "inventario", label: "Inventario" },
        ] as Array<{ id: Tab; label: string }>)
      : []),
    { id: "ticket", label: "Ticket e ore" },
    { id: "progetti", label: "Progetti e rapportini" },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl">
        {isAdmin && (
          <Link
            href="/clienti"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            ← Tutti i clienti
          </Link>
        )}

        <PageHeader
          titolo={cliente.ragione_sociale}
          sottotitolo="Scheda cliente: contatti, lavoro svolto e informazioni commerciali. L'anagrafica resta quella dell'ERP."
          azioni={
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    STATO_CLASSE[commerciale?.stato_cliente ?? "attivo"]
                  }`}
                >
                  {STATO_LABEL[commerciale?.stato_cliente ?? "attivo"]}
                </span>
              )}
              {isAdmin && commerciale && (
                <span className="text-[11px] text-caldo-testo">
                  Priorità {PRIORITA_LABEL[commerciale.priorita_commerciale]}
                </span>
              )}
              <button
                type="button"
                onClick={() => void ricarica()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno bg-white px-3 py-2 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                Aggiorna
              </button>
            </div>
          }
        />

        <div className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-crema-contorno bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                tab === t.id
                  ? "bg-inchiostro text-white"
                  : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {adminError && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
          >
            <AlertTriangleIcon className="h-4 w-4" />
            {adminError}
          </p>
        )}

        {tab === "panoramica" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Tessera etichetta="Ticket aperti" valore={String(ticketsAperti)} />
              <Tessera etichetta="Ticket chiusi" valore={String(ticketsChiusi)} />
              <Tessera
                etichetta="Ore registrate"
                valore={minutiLabel(scheda.ore.minuti)}
                nota={`${scheda.ore.voci} voci`}
              />
              <Tessera etichetta="Progetti" valore={String(scheda.progetti.length)} />
              <Tessera etichetta="Rapportini" valore={String(scheda.rapportini.length)} />
              {isAdmin && (
                <Tessera
                  etichetta="Questionari compilati"
                  valore={String(questionariCompilati)}
                  nota={
                    questionari[0]
                      ? `ultimo ${data(questionari[0].data_creazione)}`
                      : "nessuno"
                  }
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className="rounded-card border border-crema-contorno bg-white p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                  <UserIcon className="h-4 w-4" />
                  Contatti
                </p>
                <ul className="space-y-1.5 text-sm text-inchiostro">
                  {cliente.nome_contatto && <li>{cliente.nome_contatto}</li>}
                  {cliente.email && (
                    <li className="break-all text-caldo-testo">{cliente.email}</li>
                  )}
                  {cliente.telefono && (
                    <li className="tabular text-caldo-testo">{cliente.telefono}</li>
                  )}
                  {(cliente.indirizzo || cliente.citta) && (
                    <li className="text-caldo-testo">
                      {[cliente.indirizzo, cliente.citta, cliente.provincia]
                        .filter(Boolean)
                        .join(", ")}
                    </li>
                  )}
                  {cliente.partita_iva && (
                    <li className="tabular text-caldo-testo">P.IVA {cliente.partita_iva}</li>
                  )}
                </ul>
              </section>

              <section className="rounded-card border border-crema-contorno bg-white p-4 lg:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                  Ultimi ticket
                </p>
                {scheda.tickets.length === 0 ? (
                  <p className="text-sm text-caldo-testo">Nessun ticket per questo cliente.</p>
                ) : (
                  <ul className="divide-y divide-crema-bordo">
                    {scheda.tickets.slice(0, 5).map((t) => (
                      <li key={t.id} className="py-2 first:pt-0 last:pb-0">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="truncate text-sm font-medium text-inchiostro underline-offset-2 hover:underline"
                        >
                          {t.numero} · {t.sommario_problema}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-caldo-testo">
                          {t.modulo_software} · aperto {data(t.creato_il)}
                          {t.chiuso_il ? ` · chiuso ${data(t.chiuso_il)}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {isAdmin && (
              <CommercialeForm
                clienteId={params.id}
                commerciale={commerciale}
                onSalvato={setCommerciale}
              />
            )}
          </div>
        )}

        {tab === "questionari" && isAdmin && (
          <QuestionariPanel
            clienteId={params.id}
            clienteEmail={cliente.email}
            questionari={questionari}
            onAggiorna={() => void ricarica()}
          />
        )}

        {tab === "inventario" && isAdmin && (
          <InventarioPanel questionari={questionari} />
        )}

        {tab === "ticket" && (
          <TicketReportPanel tickets={scheda.tickets} ore={scheda.ore} />
        )}

        {tab === "progetti" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
              <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
                <FolderIcon className="h-4 w-4 text-caldo-testo" />
                <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                  Progetti ({scheda.progetti.length})
                </p>
              </div>
              {scheda.progetti.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-caldo-testo">
                  Nessun progetto.
                </p>
              ) : (
                <ul className="divide-y divide-crema-bordo">
                  {scheda.progetti.map((p) => (
                    <li key={p.id} className="px-4 py-2.5">
                      <Link
                        href={`/progetti/${p.id}`}
                        className="text-sm font-medium text-inchiostro underline-offset-2 hover:underline"
                      >
                        {p.codice} · {p.nome}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-caldo-testo">{p.stato}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
              <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
                <BookIcon className="h-4 w-4 text-caldo-testo" />
                <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                  Rapportini ({scheda.rapportini.length})
                </p>
              </div>
              {scheda.rapportini.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-caldo-testo">
                  Nessun rapportino.
                </p>
              ) : (
                <ul className="divide-y divide-crema-bordo">
                  {scheda.rapportini.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/rapportini/${r.id}`}
                          className="text-sm font-medium text-inchiostro underline-offset-2 hover:underline"
                        >
                          {r.numero}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-caldo-testo">
                          {r.stato} · {data(r.data_creazione)}
                        </p>
                      </div>
                      <span className="tabular text-xs font-semibold text-inchiostro">
                        {minutiLabel(r.minuti_totali)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Tessera({
  etichetta,
  valore,
  nota,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
}) {
  return (
    <div className="rounded-card border border-crema-contorno bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">
        {etichetta}
      </p>
      <p className="tabular mt-1 text-xl font-semibold text-inchiostro">{valore}</p>
      {nota && <p className="text-[10px] text-caldo-testo">{nota}</p>}
    </div>
  );
}
