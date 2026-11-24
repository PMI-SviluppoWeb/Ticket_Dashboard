"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EditIcon,
  LoaderIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import SectionBar from "@/components/SectionBar";
import AgenteForm from "@/components/agenti/AgenteForm";
import { useCopilot } from "@/components/copilot/CopilotContext";
import { useOperatore } from "@/lib/operatore-client";
import type {
  AgenteAttivita,
  AgenteConversazione,
  AgentePerOperatore,
  RuoloAgente,
} from "@/lib/types";

const RUOLO_LABEL: Record<RuoloAgente, string> = {
  assistente: "Assistente ticket",
  contenuti: "Contenuti social",
  clienti: "Gestione clienti",
  custom: "Personalizzato",
};

const STATO_LABEL: Record<string, string> = {
  in_corso: "In corso",
  completata: "Completata",
  errore: "Errore",
};

function dataBreve(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AgentiPage() {
  const { operatore } = useOperatore();
  const { apri, apriConversazione } = useCopilot();

  const [agenti, setAgenti] = useState<AgentePerOperatore[]>([]);
  const [conversazioni, setConversazioni] = useState<AgenteConversazione[]>([]);
  const [attivita, setAttivita] = useState<AgenteAttivita[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [inModifica, setInModifica] = useState<AgentePerOperatore | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const caricaAgenti = useCallback(async () => {
    try {
      const res = await fetch("/api/agenti?vista=miei", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { agenti?: AgentePerOperatore[] };
      setAgenti(
        (data.agenti ?? []).map((a) => ({ ...a, pinnato: Boolean(a.pinnato) }))
      );
    } catch {
      setErrore("Impossibile caricare gli agenti.");
    }
  }, []);

  const caricaContesto = useCallback(async () => {
    try {
      const [resConv, resAtt] = await Promise.all([
        fetch("/api/agenti/conversazioni?limit=8", { cache: "no-store" }),
        fetch("/api/agenti/attivita?limit=8", { cache: "no-store" }),
      ]);
      if (resConv.ok) {
        const data = (await resConv.json()) as {
          conversazioni?: AgenteConversazione[];
        };
        setConversazioni(data.conversazioni ?? []);
      }
      if (resAtt.ok) {
        const data = (await resAtt.json()) as { esecuzioni?: AgenteAttivita[] };
        setAttivita(data.esecuzioni ?? []);
      }
    } catch {
      // I pannelli laterali sono secondari: non bloccano la pagina.
    }
  }, []);

  useEffect(() => {
    let annullato = false;
    (async () => {
      await Promise.all([caricaAgenti(), caricaContesto()]);
      if (!annullato) setLoading(false);
    })();
    return () => {
      annullato = true;
    };
  }, [caricaAgenti, caricaContesto]);

  const nomeAgente = useMemo(() => {
    const mappa = new Map(agenti.map((a) => [a.id, a.nome]));
    return (id: string) => mappa.get(id) ?? "Agente";
  }, [agenti]);

  const ricarica = async () => {
    await Promise.all([caricaAgenti(), caricaContesto()]);
  };

  const togglePin = async (agenteId: string, pinnato: boolean) => {
    setAgenti((prev) =>
      prev.map((a) => (a.id === agenteId ? { ...a, pinnato } : a))
    );
    try {
      await fetch(`/api/agenti/${agenteId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinnato }),
      });
      await caricaAgenti();
    } catch {
      setErrore("Impossibile aggiornare la barra rapida.");
    }
  };

  const elimina = async (agenteId: string) => {
    try {
      const res = await fetch(`/api/agenti/${agenteId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Errore nell'eliminazione.");
      setConfirmDelete(null);
      await ricarica();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nell'eliminazione.");
    }
  };

  const eMio = (a: AgentePerOperatore) =>
    a.visibilita === "personale" && a.proprietario_id === operatore?.id;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo="Agenti AI"
          sottotitolo="I tuoi agenti e quelli condivisi: aprili ovunque dal Copilot, guarda cosa fanno e gestisci la barra rapida."
          azioni={
            <button
              onClick={() => {
                setInModifica(null);
                setShowForm(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
            >
              <PlusIcon className="h-4 w-4" />
              Nuovo agente
            </button>
          }
        />

        <AreaTabs areaId="ai" />

        {errore && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo">
            <span className="flex-1">{errore}</span>
            <button
              onClick={() => setErrore(null)}
              aria-label="Chiudi il messaggio"
              className="cursor-pointer text-stato-urgenza-testo/70 hover:text-stato-urgenza-testo"
            >
              &times;
            </button>
          </div>
        )}

        {showForm && (
          <div className="mb-6">
            <AgenteForm
              agente={inModifica}
              onSalvato={async () => {
                setShowForm(false);
                setInModifica(null);
                await ricarica();
              }}
              onAnnulla={() => {
                setShowForm(false);
                setInModifica(null);
              }}
            />
          </div>
        )}

        <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
          <SectionBar
            titolo="I miei agenti"
            icona={SparklesIcon}
            conteggio={agenti.length}
          >
            <button
              onClick={() => void ricarica()}
              className="cursor-pointer text-xs font-medium text-caldo-testo underline-offset-2 hover:text-inchiostro hover:underline"
            >
              Aggiorna
            </button>
          </SectionBar>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
            </div>
          ) : agenti.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-caldo-testo">
              Nessun agente disponibile. Creane uno personale oppure chiedi
              all&apos;admin di assegnartene uno di libreria.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-px bg-crema-bordo sm:grid-cols-2">
              {agenti.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 bg-white p-4">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => void togglePin(a.id, !a.pinnato)}
                      title={a.pinnato ? "Togli dalla barra rapida" : "Aggiungi alla barra rapida"}
                      aria-label={a.pinnato ? "Togli dalla barra rapida" : "Aggiungi alla barra rapida"}
                      className={`mt-0.5 cursor-pointer text-lg leading-none transition-colors duration-200 ${
                        a.pinnato ? "text-amber-500" : "text-crema-contorno hover:text-caldo-testo"
                      }`}
                    >
                      {a.pinnato ? "★" : "☆"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-inchiostro">
                        {a.nome}
                        {a.visibilita === "libreria" ? (
                          <span className="rounded-full border border-stato-info-bordo bg-stato-info-bg px-1.5 py-0.5 text-[10px] font-medium text-stato-info-testo">
                            libreria
                          </span>
                        ) : (
                          <span className="rounded-full border border-crema-contorno bg-crema-scuro px-1.5 py-0.5 text-[10px] font-medium text-caldo-testo">
                            personale
                          </span>
                        )}
                        {!a.attivo && (
                          <span className="rounded-full border border-stato-neutro-bordo bg-stato-neutro-bg px-1.5 py-0.5 text-[10px] font-medium text-stato-neutro-testo">
                            disattivato
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-caldo-testo">
                        {RUOLO_LABEL[a.ruolo] ?? a.ruolo}
                        {a.strumenti.length > 0 && " · dati app"}
                      </p>
                      {a.descrizione && (
                        <p className="mt-1 line-clamp-2 text-xs text-caldo-testo">
                          {a.descrizione}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => apri(a.id)}
                      disabled={!a.attivo}
                      className="flex cursor-pointer items-center gap-1.5 rounded-control bg-inchiostro px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SendIcon className="h-3.5 w-3.5" />
                      Apri
                    </button>
                    {eMio(a) && (
                      <>
                        <button
                          onClick={() => {
                            setInModifica(a);
                            setShowForm(true);
                          }}
                          className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </button>
                        {confirmDelete === a.id ? (
                          <button
                            onClick={() => void elimina(a.id)}
                            className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1.5 text-xs font-semibold text-stato-urgenza-testo"
                          >
                            Conferma
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(a.id)}
                            aria-label={`Elimina ${a.nome}`}
                            className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-caldo-testo transition-colors duration-200 hover:border-stato-urgenza-bordo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo="Conversazioni recenti" icona={SparklesIcon}>
              <Link
                href="/agenti/attivita"
                className="text-xs font-medium text-caldo-testo underline-offset-2 hover:text-inchiostro hover:underline"
              >
                Attività
              </Link>
            </SectionBar>
            {conversazioni.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-caldo-testo">
                Nessuna conversazione. Apri un agente dal Copilot per iniziare.
              </p>
            ) : (
              <ul className="divide-y divide-crema-bordo">
                {conversazioni.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => void apriConversazione(c)}
                      className="flex w-full cursor-pointer flex-col gap-0.5 px-5 py-3 text-left transition-colors duration-200 hover:bg-crema-scuro"
                    >
                      <span className="truncate text-sm text-inchiostro">
                        {c.titolo || "Nuova conversazione"}
                      </span>
                      <span className="text-[11px] text-caldo-testo">
                        {nomeAgente(c.agente_id)} · {dataBreve(c.data_aggiornamento)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
            <SectionBar titolo="Ultime esecuzioni" icona={SparklesIcon} />
            {attivita.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-caldo-testo">
                Nessuna esecuzione registrata.
              </p>
            ) : (
              <ul className="divide-y divide-crema-bordo">
                {attivita.map((es) => (
                  <li key={es.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${
                          es.stato === "completata"
                            ? "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo"
                            : es.stato === "errore"
                              ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
                              : "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo"
                        }`}
                      >
                        {STATO_LABEL[es.stato] ?? es.stato}
                      </span>
                      <span className="text-caldo-testo">{es.agente_nome ?? "Agente"}</span>
                      <span className="text-caldo-testo">{dataBreve(es.data_creazione)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-inchiostro">
                      {es.input_utente}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
