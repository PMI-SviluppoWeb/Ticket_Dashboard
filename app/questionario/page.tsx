"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircleIcon,
  LoaderIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import {
  MODULI_ARCA,
  OPZIONI_ANTIVIRUS,
  OPZIONI_BACKUP,
  OPZIONI_CLOUD,
  OPZIONI_ESIGENZE,
  OPZIONI_SICUREZZA,
  OPZIONI_SI_NO,
  OPZIONI_VPN,
  risposteVuote,
  type Opzione,
} from "@/lib/questionari-schema";
import type {
  QuestionarioTokenInfo,
  RisposteQuestionario,
  SoftwareInventario,
} from "@/lib/types";

function dataBreve(iso: string | null): string {
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

function QuestionarioForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [caricamento, setCaricamento] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [info, setInfo] = useState<QuestionarioTokenInfo | null>(null);
  const [risposte, setRisposte] = useState<RisposteQuestionario>(risposteVuote());
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState("");
  const [inviato, setInviato] = useState(false);

  useEffect(() => {
    if (!token) {
      setCaricamento(false);
      setMotivo("non_trovato");
      return;
    }
    let annullato = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/questionario?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          info?: QuestionarioTokenInfo;
          motivo?: string;
        };
        if (annullato) return;
        if (!res.ok || !data.info) {
          setMotivo(data.motivo ?? "non_trovato");
          return;
        }
        setInfo(data.info);
      } catch {
        if (!annullato) setMotivo("non_trovato");
      } finally {
        if (!annullato) setCaricamento(false);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [token]);

  const invia = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrore("");
    if (!risposte.azienda.referente.trim()) {
      setErrore("Indica il referente aziendale.");
      return;
    }
    if (!risposte.consenso_privacy) {
      setErrore("Devi accettare il trattamento dei dati.");
      return;
    }
    setInvio(true);
    try {
      const res = await fetch("/api/questionario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, risposte }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Invio non riuscito.");
      setInviato(true);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setInvio(false);
    }
  };

  if (caricamento) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (motivo || !info) {
    const messaggi: Record<string, string> = {
      compilato: "Questo questionario è già stato compilato. Grazie!",
      scaduto: "Questo link è scaduto. Chiedi al nostro team un nuovo questionario.",
      annullato: "Questo questionario non è più valido.",
      non_trovato: "Il link non è valido o è incompleto.",
    };
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-inchiostro">
            Questionario non disponibile
          </h1>
          <p className="mt-2 text-sm text-caldo-testo">
            {messaggi[motivo ?? "non_trovato"] ?? messaggi.non_trovato}
          </p>
        </div>
      </div>
    );
  }

  if (inviato) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-stato-ok-bg text-stato-ok-testo">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-inchiostro">Grazie!</h1>
          <p className="mt-2 text-sm text-caldo-testo">
            Abbiamo ricevuto le tue risposte. Il nostro team le userà per
            capire come esserti più utile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-caldo-testo">
          {info.azienda}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-inchiostro">
          {info.titolo}
        </h1>
        {info.messaggio && (
          <p className="mx-auto mt-2 max-w-xl whitespace-pre-wrap text-sm text-caldo-testo">
            {info.messaggio}
          </p>
        )}
        {info.scadenza && (
          <p className="mt-2 text-[11px] text-caldo-testo">
            Compilabile fino al {dataBreve(info.scadenza)}
          </p>
        )}
      </header>

      <form onSubmit={invia} className="space-y-5">
        <Sezione titolo="1. Azienda e referenti">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Referente *">
              <input
                required
                value={risposte.azienda.referente}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    azienda: { ...risposte.azienda, referente: e.target.value },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Ruolo">
              <input
                value={risposte.azienda.ruolo}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    azienda: { ...risposte.azienda, ruolo: e.target.value },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Email">
              <input
                type="email"
                value={risposte.azienda.email}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    azienda: { ...risposte.azienda, email: e.target.value },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Telefono">
              <input
                value={risposte.azienda.telefono}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    azienda: { ...risposte.azienda, telefono: e.target.value },
                  })
                }
                className={inputClasse}
              />
            </Campo>
          </div>
        </Sezione>

        <Sezione titolo="2. Parco computer">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Computer">
              <input
                type="number"
                min={0}
                value={risposte.parco_pc.computer}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    parco_pc: {
                      ...risposte.parco_pc,
                      computer: Number(e.target.value) || 0,
                    },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Server">
              <input
                type="number"
                min={0}
                value={risposte.parco_pc.server}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    parco_pc: {
                      ...risposte.parco_pc,
                      server: Number(e.target.value) || 0,
                    },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Postazioni">
              <input
                type="number"
                min={0}
                value={risposte.parco_pc.postazioni}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    parco_pc: {
                      ...risposte.parco_pc,
                      postazioni: Number(e.target.value) || 0,
                    },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Anni medi PC">
              <input
                type="number"
                min={0}
                max={60}
                value={risposte.parco_pc.anni_medi ?? ""}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    parco_pc: {
                      ...risposte.parco_pc,
                      anni_medi:
                        e.target.value === "" ? null : Number(e.target.value) || 0,
                    },
                  })
                }
                className={inputClasse}
              />
            </Campo>
          </div>
          <Campo label="Note sul parco PC">
            <textarea
              rows={2}
              value={risposte.parco_pc.note}
              onChange={(e) =>
                setRisposte({
                  ...risposte,
                  parco_pc: { ...risposte.parco_pc, note: e.target.value },
                })
              }
              className={`${inputClasse} resize-none`}
            />
          </Campo>
        </Sezione>

        <Sezione titolo="3. Software utilizzati">
          <p className="mb-3 text-xs text-caldo-testo">
            Indica i programmi principali usati in azienda (oltre ad Arca).
          </p>
          <div className="space-y-2">
            {risposte.software.map((s, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 rounded-control border border-crema-contorno p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <Campo label="Software">
                    <input
                      value={s.nome}
                      onChange={(e) => setSoftware(i, { nome: e.target.value })}
                      className={inputClasse}
                    />
                  </Campo>
                </div>
                <div className="sm:col-span-2">
                  <Campo label="Versione">
                    <input
                      value={s.versione}
                      onChange={(e) => setSoftware(i, { versione: e.target.value })}
                      className={inputClasse}
                    />
                  </Campo>
                </div>
                <div className="sm:col-span-2">
                  <Campo label="Licenze">
                    <input
                      type="number"
                      min={0}
                      value={s.licenze ?? ""}
                      onChange={(e) =>
                        setSoftware(i, {
                          licenze:
                            e.target.value === "" ? null : Number(e.target.value) || 0,
                        })
                      }
                      className={inputClasse}
                    />
                  </Campo>
                </div>
                <div className="sm:col-span-3">
                  <Campo label="Fornitore">
                    <input
                      value={s.fornitore}
                      onChange={(e) => setSoftware(i, { fornitore: e.target.value })}
                      className={inputClasse}
                    />
                  </Campo>
                </div>
                <div className="flex items-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => rimuoviSoftware(i)}
                    aria-label="Rimuovi software"
                    className="grid h-9 w-9 cursor-pointer place-items-center rounded-control border border-crema-contorno text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={aggiungiSoftware}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-crema-contorno px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Aggiungi software
          </button>
        </Sezione>

        <Sezione titolo="4. Arca">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Versione di Arca">
              <input
                value={risposte.arca.versione}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    arca: { ...risposte.arca, versione: e.target.value },
                  })
                }
                placeholder="es. Arca Evolution 2024"
                className={inputClasse}
              />
            </Campo>
            <Campo label="Numero licenze acquistate">
              <input
                type="number"
                min={0}
                value={risposte.arca.licenze}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    arca: {
                      ...risposte.arca,
                      licenze: Number(e.target.value) || 0,
                    },
                  })
                }
                className={inputClasse}
              />
            </Campo>
            <Campo label="Ultimo aggiornamento">
              <input
                value={risposte.arca.ultimo_aggiornamento}
                onChange={(e) =>
                  setRisposte({
                    ...risposte,
                    arca: {
                      ...risposte.arca,
                      ultimo_aggiornamento: e.target.value,
                    },
                  })
                }
                placeholder="es. 2024"
                className={inputClasse}
              />
            </Campo>
            <Campo label="Assistenza attiva">
              <Select
                opzioni={OPZIONI_SI_NO}
                valore={risposte.arca.assistenza}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    arca: { ...risposte.arca, assistenza: v },
                  })
                }
              />
            </Campo>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Moduli Arca utilizzati
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {MODULI_ARCA.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs text-caldo-testo">
                  <input
                    type="checkbox"
                    checked={risposte.arca.moduli.includes(m)}
                    onChange={(e) =>
                      setRisposte({
                        ...risposte,
                        arca: {
                          ...risposte.arca,
                          moduli: e.target.checked
                            ? [...risposte.arca.moduli, m]
                            : risposte.arca.moduli.filter((x) => x !== m),
                        },
                      })
                    }
                    className="h-4 w-4 cursor-pointer accent-inchiostro"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
        </Sezione>

        <Sezione titolo="5. Infrastruttura">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Backup">
              <Select
                opzioni={OPZIONI_BACKUP}
                valore={risposte.infrastruttura.backup}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    infrastruttura: { ...risposte.infrastruttura, backup: v },
                  })
                }
              />
            </Campo>
            <Campo label="Antivirus">
              <Select
                opzioni={OPZIONI_ANTIVIRUS}
                valore={risposte.infrastruttura.antivirus}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    infrastruttura: { ...risposte.infrastruttura, antivirus: v },
                  })
                }
              />
            </Campo>
            <Campo label="Servizi cloud">
              <Select
                opzioni={OPZIONI_CLOUD}
                valore={risposte.infrastruttura.cloud}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    infrastruttura: { ...risposte.infrastruttura, cloud: v },
                  })
                }
              />
            </Campo>
            <Campo label="VPN">
              <Select
                opzioni={OPZIONI_VPN}
                valore={risposte.infrastruttura.vpn}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    infrastruttura: { ...risposte.infrastruttura, vpn: v },
                  })
                }
              />
            </Campo>
            <Campo label="Livello di sicurezza percepito">
              <Select
                opzioni={OPZIONI_SICUREZZA}
                valore={risposte.infrastruttura.sicurezza}
                onChange={(v) =>
                  setRisposte({
                    ...risposte,
                    infrastruttura: { ...risposte.infrastruttura, sicurezza: v },
                  })
                }
              />
            </Campo>
          </div>
        </Sezione>

        <Sezione titolo="6. Esigenze e obiettivi">
          <Campo label="Priorità principale per i prossimi 12 mesi">
            <Select
              opzioni={OPZIONI_ESIGENZE}
              valore={risposte.esigenze.priorita}
              onChange={(v) =>
                setRisposte({
                  ...risposte,
                  esigenze: { ...risposte.esigenze, priorita: v },
                })
              }
            />
          </Campo>
          <Campo label="Criticità attuali">
            <textarea
              rows={3}
              value={risposte.esigenze.criticita}
              onChange={(e) =>
                setRisposte({
                  ...risposte,
                  esigenze: { ...risposte.esigenze, criticita: e.target.value },
                })
              }
              className={`${inputClasse} resize-none`}
            />
          </Campo>
          <Campo label="Obiettivi per l'azienda">
            <textarea
              rows={3}
              value={risposte.esigenze.obiettivi}
              onChange={(e) =>
                setRisposte({
                  ...risposte,
                  esigenze: { ...risposte.esigenze, obiettivi: e.target.value },
                })
              }
              className={`${inputClasse} resize-none`}
            />
          </Campo>
        </Sezione>

        <Sezione titolo="7. Soddisfazione">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
            Quanto ci consiglieresti? (0 = per niente, 10 = moltissimo)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, n) => n).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  setRisposte({
                    ...risposte,
                    soddisfazione: { ...risposte.soddisfazione, nps: n },
                  })
                }
                aria-pressed={risposte.soddisfazione.nps === n}
                className={`h-9 w-9 cursor-pointer rounded-control border text-xs font-semibold transition-colors duration-200 ${
                  risposte.soddisfazione.nps === n
                    ? "border-inchiostro bg-inchiostro text-white"
                    : "border-crema-contorno text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <Campo label="Commenti">
            <textarea
              rows={2}
              value={risposte.soddisfazione.commenti}
              onChange={(e) =>
                setRisposte({
                  ...risposte,
                  soddisfazione: {
                    ...risposte.soddisfazione,
                    commenti: e.target.value,
                  },
                })
              }
              className={`${inputClasse} resize-none`}
            />
          </Campo>
        </Sezione>

        <label className="flex items-start gap-2 rounded-card border border-crema-contorno bg-white p-4 text-xs text-caldo-testo">
          <input
            type="checkbox"
            checked={risposte.consenso_privacy}
            onChange={(e) =>
              setRisposte({ ...risposte, consenso_privacy: e.target.checked })
            }
            className="mt-0.5 h-4 w-4 cursor-pointer accent-inchiostro"
          />
          <span>
            Acconsento al trattamento dei dati inseriti per le finalità del
            questionario. I dati non saranno condivisi con terzi.
          </span>
        </label>

        {errore && (
          <p
            role="alert"
            className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
          >
            {errore}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={invio}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-inchiostro px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
          >
            {invio ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
            Invia questionario
          </button>
        </div>
      </form>
    </div>
  );

  function setSoftware(i: number, patch: Partial<SoftwareInventario>) {
    setRisposte((prev) => ({
      ...prev,
      software: prev.software.map((s, idx) =>
        idx === i ? { ...s, ...patch } : s
      ),
    }));
  }

  function aggiungiSoftware() {
    setRisposte((prev) => ({
      ...prev,
      software: [
        ...prev.software,
        {
          nome: "",
          versione: "",
          licenze: null,
          fornitore: "",
          scadenza: "",
          note: "",
        },
      ],
    }));
  }

  function rimuoviSoftware(i: number) {
    setRisposte((prev) => ({
      ...prev,
      software: prev.software.filter((_, idx) => idx !== i),
    }));
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

function Select({
  opzioni,
  valore,
  onChange,
}: {
  opzioni: Opzione[];
  valore: string;
  onChange: (valore: string) => void;
}) {
  return (
    <select
      value={valore}
      onChange={(e) => onChange(e.target.value)}
      className={inputClasse}
    >
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Sezione({
  titolo,
  children,
}: {
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-card border border-crema-contorno bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-inchiostro">
        {titolo}
      </h2>
      {children}
    </section>
  );
}

export default function QuestionarioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
        </div>
      }
    >
      <QuestionarioForm />
    </Suspense>
  );
}
