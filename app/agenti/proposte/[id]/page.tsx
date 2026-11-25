"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import AreaTabs from "@/components/AreaTabs";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  LoaderIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import type {
  AgenteProposta,
  Cliente,
  Priorita,
  PropostaAttivita,
  PropostaProgettoPayload,
  StatoProposta,
} from "@/lib/types";

const STATI: Array<{ vero: StatoProposta; label: string; classe: string }> = [
  {
    vero: "in_attesa",
    label: "In attesa",
    classe: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  },
  {
    vero: "approvata",
    label: "Approvata",
    classe: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  },
  {
    vero: "rifiutata",
    label: "Rifiutata",
    classe: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
  },
];

const PRIORITA: Priorita[] = ["BASSA", "MEDIA", "ALTA"];

function dataBreve(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function nuovoTask(): PropostaAttivita {
  return {
    titolo: "",
    descrizione: "",
    priorita: "MEDIA",
    data_scadenza: null,
    assegnatario: null,
    persone: [],
  };
}

export default function PropostaPage({ params }: { params: { id: string } }) {
  const { operatore, caricamento } = useOperatore();

  const [proposta, setProposta] = useState<AgenteProposta | null>(null);
  const [payload, setPayload] = useState<PropostaProgettoPayload | null>(null);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [operatori, setOperatori] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [successo, setSuccesso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [approvando, setApprovando] = useState(false);
  const [rifiutando, setRifiutando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      const res = await fetch(`/api/agenti/proposte/${params.id}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        proposta?: AgenteProposta;
        error?: string;
      };
      if (!res.ok || !data.proposta) {
        throw new Error(data.error ?? "Proposta non trovata.");
      }
      setProposta(data.proposta);
      setPayload(data.proposta.payload);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Proposta non trovata.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!operatore) return;
    void carica();
    Promise.all([
      fetch("/api/clienti?limit=300", { cache: "no-store" }),
      fetch("/api/operatori", { cache: "no-store" }),
    ])
      .then(async ([rc, ro]) => {
        if (rc.ok) {
          const dc = (await rc.json()) as { clienti?: Cliente[] };
          setClienti(dc.clienti ?? []);
        }
        if (ro.ok) {
          const dor = (await ro.json()) as {
            operatori?: Array<{ nome: string; attivo?: boolean }>;
          };
          setOperatori(
            (dor.operatori ?? [])
              .filter((o) => o.attivo !== false)
              .map((o) => o.nome)
          );
        }
      })
      .catch(() => {
        // Select secondarie: la pagina funziona anche senza.
      });
  }, [operatore, carica]);

  const puoGestire =
    proposta != null &&
    (operatore?.ruolo === "admin" || proposta.proposta_da === operatore?.id);
  const modificabile = puoGestire && proposta?.stato === "in_attesa";

  const salvaPayload = useCallback(async (): Promise<boolean> => {
    if (!payload) return false;
    const res = await fetch(`/api/agenti/proposte/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      proposta?: AgenteProposta;
      error?: string;
    };
    if (!res.ok || !data.proposta) {
      throw new Error(data.error ?? "Errore nel salvataggio.");
    }
    setProposta(data.proposta);
    setPayload(data.proposta.payload);
    return true;
  }, [payload, params.id]);

  const salva = async () => {
    setSalvando(true);
    setErrore("");
    setSuccesso("");
    try {
      await salvaPayload();
      setSuccesso("Proposta salvata.");
      setTimeout(() => setSuccesso(""), 2500);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSalvando(false);
    }
  };

  const approva = async () => {
    setApprovando(true);
    setErrore("");
    setSuccesso("");
    try {
      await salvaPayload();
      const res = await fetch(`/api/agenti/proposte/${params.id}/approva`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        progetto_id?: string;
        progetto_codice?: string;
        attivita_create?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Approvazione non riuscita.");
      setSuccesso(
        `Progetto ${data.progetto_codice ?? ""} creato con ${data.attivita_create ?? 0} attività.`
      );
      await carica();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Approvazione non riuscita.");
    } finally {
      setApprovando(false);
    }
  };

  const rifiuta = async () => {
    setRifiutando(true);
    setErrore("");
    setSuccesso("");
    try {
      const res = await fetch(`/api/agenti/proposte/${params.id}/rifiuta`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rifiuto non riuscito.");
      setSuccesso("Proposta rifiutata.");
      await carica();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Rifiuto non riuscito.");
    } finally {
      setRifiutando(false);
    }
  };

  if (caricamento || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (errore && !proposta) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p
          role="alert"
          className="rounded-card border border-stato-urgenza-bordo bg-stato-urgenza-bg p-4 text-sm text-stato-urgenza-testo"
        >
          {errore}
        </p>
      </div>
    );
  }

  if (!proposta || !payload) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-caldo-testo">
        Proposta non disponibile.
      </div>
    );
  }

  const stato = STATI.find((s) => s.vero === proposta.stato) ?? STATI[0];
  const opzioniResponsabile = conValore(operatori, payload.progetto.responsabile);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/agenti/proposte"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
        >
          ← Tutte le proposte
        </Link>

        <PageHeader
          titolo={payload.progetto.nome || "Proposta di progetto"}
          sottotitolo={`Proposta di ${proposta.operatore_nome ?? "un operatore"} · ${proposta.agente_nome ?? "agente"} · ${dataBreve(proposta.data_creazione)}`}
          azioni={
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${stato.classe}`}
            >
              {stato.label}
            </span>
          }
        />

        <AreaTabs areaId="ai" />

        {proposta.errore && (
          <p className="mb-4 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo">
            <AlertTriangleIcon className="h-4 w-4" />
            {proposta.errore}
          </p>
        )}
        {errore && (
          <p
            role="alert"
            className="mb-4 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
          >
            {errore}
          </p>
        )}
        {successo && (
          <p className="mb-4 flex items-center gap-2 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo">
            <CheckCircleIcon className="h-4 w-4" />
            {successo}
            {proposta.stato === "approvata" && proposta.progetto_id && (
              <Link
                href={`/progetti/${proposta.progetto_id}`}
                className="font-semibold underline underline-offset-2"
              >
                Apri progetto
              </Link>
            )}
          </p>
        )}

        {!puoGestire && (
          <p className="mb-4 rounded-control border border-crema-contorno bg-crema-scuro p-3 text-xs text-caldo-testo">
            Questa proposta è visibile ma può essere gestita solo da chi l&apos;ha
            richiesta o da un admin.
          </p>
        )}

        <div className="space-y-4">
          <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
            <div className="border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                Progetto
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <Campo label="Nome">
                {modificabile ? (
                  <input
                    value={payload.progetto.nome}
                    onChange={(e) =>
                      setPayload({
                        ...payload,
                        progetto: { ...payload.progetto, nome: e.target.value },
                      })
                    }
                    className={inputClasse}
                  />
                ) : (
                  <p className="text-sm text-inchiostro">{payload.progetto.nome}</p>
                )}
              </Campo>
              <Campo label="Cliente">
                {modificabile ? (
                  <select
                    value={payload.progetto.cliente_id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      const cliente = clienti.find((c) => c.id === id);
                      setPayload({
                        ...payload,
                        progetto: {
                          ...payload.progetto,
                          cliente_id: id || null,
                          cliente_nome: cliente?.ragione_sociale ?? null,
                        },
                      });
                    }}
                    className={inputClasse}
                  >
                    <option value="">Seleziona cliente…</option>
                    {payload.progetto.cliente_id &&
                      !clienti.some((c) => c.id === payload.progetto.cliente_id) && (
                        <option value={payload.progetto.cliente_id}>
                          {payload.progetto.cliente_nome ??
                            payload.progetto.cliente_id}{" "}
                          (non in elenco)
                        </option>
                      )}
                    {clienti.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ragione_sociale}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-inchiostro">
                    {payload.progetto.cliente_nome ?? payload.progetto.cliente_id ?? "—"}
                  </p>
                )}
              </Campo>
              <Campo label="Priorità">
                {modificabile ? (
                  <select
                    value={payload.progetto.priorita}
                    onChange={(e) =>
                      setPayload({
                        ...payload,
                        progetto: {
                          ...payload.progetto,
                          priorita: e.target.value as Priorita,
                        },
                      })
                    }
                    className={inputClasse}
                  >
                    {PRIORITA.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-inchiostro">{payload.progetto.priorita}</p>
                )}
              </Campo>
              <Campo label="Responsabile">
                {modificabile ? (
                  <select
                    value={payload.progetto.responsabile ?? ""}
                    onChange={(e) =>
                      setPayload({
                        ...payload,
                        progetto: {
                          ...payload.progetto,
                          responsabile: e.target.value || null,
                        },
                      })
                    }
                    className={inputClasse}
                  >
                    <option value="">Non assegnato</option>
                    {opzioniResponsabile.map((nome) => (
                      <option key={nome} value={nome}>
                        {nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-inchiostro">
                    {payload.progetto.responsabile ?? "—"}
                  </p>
                )}
              </Campo>
              <Campo label="Data inizio">
                {modificabile ? (
                  <input
                    type="datetime-local"
                    value={payload.progetto.data_inizio ?? ""}
                    onChange={(e) =>
                      setPayload({
                        ...payload,
                        progetto: {
                          ...payload.progetto,
                          data_inizio: e.target.value || null,
                        },
                      })
                    }
                    className={inputClasse}
                  />
                ) : (
                  <p className="text-sm text-inchiostro">
                    {payload.progetto.data_inizio ?? "—"}
                  </p>
                )}
              </Campo>
              <Campo label="Data fine">
                {modificabile ? (
                  <input
                    type="datetime-local"
                    value={payload.progetto.data_fine ?? ""}
                    onChange={(e) =>
                      setPayload({
                        ...payload,
                        progetto: {
                          ...payload.progetto,
                          data_fine: e.target.value || null,
                        },
                      })
                    }
                    className={inputClasse}
                  />
                ) : (
                  <p className="text-sm text-inchiostro">
                    {payload.progetto.data_fine ?? "—"}
                  </p>
                )}
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Descrizione">
                  {modificabile ? (
                    <textarea
                      rows={3}
                      value={payload.progetto.descrizione}
                      onChange={(e) =>
                        setPayload({
                          ...payload,
                          progetto: {
                            ...payload.progetto,
                            descrizione: e.target.value,
                          },
                        })
                      }
                      className={`${inputClasse} resize-none`}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-inchiostro">
                      {payload.progetto.descrizione || "—"}
                    </p>
                  )}
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo label="Note">
                  {modificabile ? (
                    <textarea
                      rows={2}
                      value={payload.progetto.note}
                      onChange={(e) =>
                        setPayload({
                          ...payload,
                          progetto: { ...payload.progetto, note: e.target.value },
                        })
                      }
                      className={`${inputClasse} resize-none`}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-inchiostro">
                      {payload.progetto.note || "—"}
                    </p>
                  )}
                </Campo>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
            <div className="flex items-center justify-between border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
                Attività ({payload.attivita.length})
              </p>
              {modificabile && (
                <button
                  type="button"
                  onClick={() =>
                    setPayload({ ...payload, attivita: [...payload.attivita, nuovoTask()] })
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-crema-contorno bg-white px-2 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Aggiungi attività
                </button>
              )}
            </div>

            {payload.attivita.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-caldo-testo">
                Nessuna attività nella proposta.
              </p>
            ) : (
              <ul className="divide-y divide-crema-bordo">
                {payload.attivita.map((a, i) => (
                  <li key={i} className="p-4">
                    {modificabile ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                          <Campo label="Titolo">
                            <input
                              value={a.titolo}
                              onChange={(e) =>
                                setAttivita(i, { titolo: e.target.value })
                              }
                              className={inputClasse}
                            />
                          </Campo>
                        </div>
                        <div className="sm:col-span-1">
                          <Campo label="Priorità">
                            <select
                              value={a.priorita}
                              onChange={(e) =>
                                setAttivita(i, {
                                  priorita: e.target.value as Priorita,
                                })
                              }
                              className={inputClasse}
                            >
                              {PRIORITA.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </Campo>
                        </div>
                        <div className="sm:col-span-2">
                          <Campo label="Scadenza">
                            <input
                              type="datetime-local"
                              value={a.data_scadenza ?? ""}
                              onChange={(e) =>
                                setAttivita(i, {
                                  data_scadenza: e.target.value || null,
                                })
                              }
                              className={inputClasse}
                            />
                          </Campo>
                        </div>
                        <div className="sm:col-span-4">
                          <Campo label="Descrizione">
                            <textarea
                              rows={2}
                              value={a.descrizione}
                              onChange={(e) =>
                                setAttivita(i, { descrizione: e.target.value })
                              }
                              className={`${inputClasse} resize-none`}
                            />
                          </Campo>
                        </div>
                        <div className="sm:col-span-2">
                          <Campo label="Assegnatario">
                            <select
                              value={a.assegnatario ?? ""}
                              onChange={(e) =>
                                setAttivita(i, {
                                  assegnatario: e.target.value || null,
                                })
                              }
                              className={inputClasse}
                            >
                              <option value="">Non assegnato</option>
                              {conValore(operatori, a.assegnatario).map((nome) => (
                                <option key={nome} value={nome}>
                                  {nome}
                                </option>
                              ))}
                            </select>
                          </Campo>
                        </div>
                        <div className="flex items-end sm:col-span-6">
                          <button
                            type="button"
                            onClick={() =>
                              setPayload({
                                ...payload,
                                attivita: payload.attivita.filter((_, idx) => idx !== i),
                              })
                            }
                            className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-crema-contorno px-2 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            Rimuovi
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-inchiostro">
                          {a.titolo}
                        </p>
                        <p className="mt-0.5 text-[11px] text-caldo-testo">
                          {a.priorita}
                          {a.data_scadenza ? ` · ${a.data_scadenza}` : ""}
                          {a.assegnatario ? ` · ${a.assegnatario}` : ""}
                        </p>
                        {a.descrizione && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-caldo-testo">
                            {a.descrizione}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {modificabile && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void salva()}
                disabled={salvando || approvando || rifiutando}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
                Salva modifiche
              </button>
              <button
                type="button"
                onClick={() => void approva()}
                disabled={salvando || approvando || rifiutando}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approvando ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
                Approva e crea progetto
              </button>
              <button
                type="button"
                onClick={() => void rifiuta()}
                disabled={salvando || approvando || rifiutando}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rifiutando ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <XIcon className="h-4 w-4" />
                )}
                Rifiuta
              </button>
            </div>
          )}

          {proposta.stato === "approvata" && proposta.progetto_id && (
            <Link
              href={`/progetti/${proposta.progetto_id}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-inchiostro underline underline-offset-2"
            >
              Apri il progetto creato
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  function setAttivita(index: number, patch: Partial<PropostaAttivita>) {
    setPayload((prev) =>
      prev
        ? {
            ...prev,
            attivita: prev.attivita.map((a, i) =>
              i === index ? { ...a, ...patch } : a
            ),
          }
        : prev
    );
  }
}

const inputClasse =
  "w-full rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
        {label}
      </span>
      {children}
    </label>
  );
}

function conValore(operatori: string[], valore: string | null): string[] {
  if (!valore || operatori.includes(valore)) return operatori;
  return [...operatori, valore];
}
