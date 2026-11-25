"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  LoaderIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import type { Questionario, StatoQuestionario } from "@/lib/types";

const STATO_LABEL: Record<StatoQuestionario, string> = {
  creato: "Link creato",
  inviato: "Inviato",
  compilato: "Compilato",
  scaduto: "Scaduto",
  annullato: "Annullato",
};

const STATO_CLASSE: Record<StatoQuestionario, string> = {
  creato: "border-stato-info-bordo bg-stato-info-bg text-stato-info-testo",
  inviato: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  compilato: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  scaduto: "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo",
  annullato: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
};

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

interface Props {
  clienteId: string;
  clienteEmail: string | null;
  questionari: Questionario[];
  onAggiorna: () => void;
}

export default function QuestionariPanel({
  clienteId,
  clienteEmail,
  questionari,
  onAggiorna,
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [email, setEmail] = useState(clienteEmail ?? "");
  const [oggetto, setOggetto] = useState("Questionario conoscitivo");
  const [messaggio, setMessaggio] = useState("");
  const [giorni, setGiorni] = useState(30);
  const [inviaEmail, setInviaEmail] = useState(Boolean(clienteEmail));
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [risultato, setRisultato] = useState<{
    link: string;
    esito: string;
    erroreInvio: string | null;
  } | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [confermaAnnulla, setConfermaAnnulla] = useState<string | null>(null);

  const apri = () => {
    setEmail(clienteEmail ?? "");
    setOggetto("Questionario conoscitivo");
    setMessaggio("");
    setGiorni(30);
    setInviaEmail(Boolean(clienteEmail));
    setErrore(null);
    setRisultato(null);
    setCopiato(false);
    setAperto(true);
  };

  const crea = async () => {
    setInvio(true);
    setErrore(null);
    setRisultato(null);
    try {
      const res = await fetch(`/api/clienti/${clienteId}/questionari`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          oggetto,
          messaggio,
          giorni,
          inviaEmail,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        link?: string;
        esito_invio?: string;
        errore_invio?: string | null;
        error?: string;
      };
      if (!res.ok || !data.link) {
        throw new Error(data.error ?? "Errore nella creazione del questionario.");
      }
      setRisultato({
        link: data.link,
        esito: data.esito_invio ?? "link_creato",
        erroreInvio: data.errore_invio ?? null,
      });
      onAggiorna();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nella creazione.");
    } finally {
      setInvio(false);
    }
  };

  const copia = async () => {
    if (!risultato) return;
    try {
      await navigator.clipboard.writeText(risultato.link);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setErrore("Copia non disponibile: seleziona il link a mano.");
    }
  };

  const annulla = async (id: string) => {
    try {
      const res = await fetch(`/api/clienti/${clienteId}/questionari/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Errore nell'annullamento.");
      setConfermaAnnulla(null);
      onAggiorna();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nell'annullamento.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-inchiostro">
            Questionari
          </h2>
          <p className="text-xs text-caldo-testo">
            Invia il modulo al cliente e raccogli inventario, licenze e
            necessità. Il link è pubblico e scade.
          </p>
        </div>
        <button
          type="button"
          onClick={apri}
          className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
        >
          <PlusIcon className="h-4 w-4" />
          Invia questionario
        </button>
      </div>

      {errore && (
        <p
          role="alert"
          className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo"
        >
          {errore}
        </p>
      )}

      <div className="overflow-hidden rounded-card border border-crema-contorno bg-white">
        {questionari.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-caldo-testo">
            Nessun questionario inviato. Creane uno per iniziare a raccogliere
            i dati del cliente.
          </p>
        ) : (
          <ul className="divide-y divide-crema-bordo">
            {questionari.map((q) => (
              <li key={q.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      STATO_CLASSE[q.stato]
                    }`}
                  >
                    {STATO_LABEL[q.stato]}
                  </span>
                  <span className="text-sm font-medium text-inchiostro">
                    {q.titolo}
                  </span>
                  <span className="text-[11px] text-caldo-testo">
                    creato {dataBreve(q.data_creazione)}
                  </span>
                  {q.inviato_il && (
                    <span className="text-[11px] text-caldo-testo">
                      · inviato {dataBreve(q.inviato_il)}
                    </span>
                  )}
                  {q.destinatario && (
                    <span className="text-[11px] text-caldo-testo">
                      · {q.destinatario}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {q.scadenza && q.stato !== "compilato" && q.stato !== "annullato" && (
                      <span className="text-[10px] text-caldo-testo">
                        scade {dataBreve(q.scadenza)}
                      </span>
                    )}
                    {q.stato !== "compilato" && q.stato !== "annullato" && (
                      confermaAnnulla === q.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void annulla(q.id)}
                            className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-2 py-1 text-[10px] font-semibold text-stato-urgenza-testo"
                          >
                            Conferma
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfermaAnnulla(null)}
                            aria-label="Annulla operazione"
                            className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-caldo-testo hover:bg-crema-scuro"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfermaAnnulla(q.id)}
                          title="Annulla link"
                          aria-label="Annulla link"
                          className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {q.risposta ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-caldo-testo">
                    <span>
                      PC <strong className="text-inchiostro">{q.risposta.parco_pc.computer}</strong>
                    </span>
                    <span>
                      Server{" "}
                      <strong className="text-inchiostro">{q.risposta.parco_pc.server}</strong>
                    </span>
                    <span>
                      Arca{" "}
                      <strong className="text-inchiostro">
                        {q.risposta.arca.versione || "n/d"}
                      </strong>
                    </span>
                    <span>
                      Licenze{" "}
                      <strong className="text-inchiostro">{q.risposta.arca.licenze}</strong>
                    </span>
                    <span>
                      Software{" "}
                      <strong className="text-inchiostro">{q.risposta.software.length}</strong>
                    </span>
                    <span>
                      NPS{" "}
                      <strong className="text-inchiostro">
                        {q.risposta.soddisfazione.nps ?? "—"}
                      </strong>
                    </span>
                    <span className="text-caldo-testo">
                      compilato {dataBreve(q.data_compilazione)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-caldo-testo">
                    In attesa di compilazione.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {aperto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-inchiostro/40 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Invia questionario"
        >
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setAperto(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative w-full max-w-lg rounded-t-card border border-crema-contorno bg-white shadow-2xl sm:rounded-card">
            <div className="flex items-center justify-between border-b border-crema-bordo px-5 py-3">
              <h3 className="font-display text-lg font-semibold text-inchiostro">
                Invia questionario
              </h3>
              <button
                type="button"
                onClick={() => setAperto(false)}
                aria-label="Chiudi"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                  Destinatario
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@cliente.it"
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                  Oggetto
                </span>
                <input
                  value={oggetto}
                  onChange={(e) => setOggetto(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                  Messaggio (opzionale)
                </span>
                <textarea
                  rows={3}
                  value={messaggio}
                  onChange={(e) => setMessaggio(e.target.value)}
                  maxLength={5000}
                  className="w-full resize-none rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
              </label>

              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                    Scadenza (giorni)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={giorni}
                    onChange={(e) => setGiorni(Number(e.target.value) || 30)}
                    className="tabular w-24 rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-xs text-caldo-testo">
                  <input
                    type="checkbox"
                    checked={inviaEmail}
                    onChange={(e) => setInviaEmail(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-inchiostro"
                  />
                  Invia l&apos;email al cliente
                </label>
              </div>

              {risultato && (
                <div className="rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-xs text-stato-ok-testo">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <CheckCircleIcon className="h-4 w-4" />
                    {risultato.esito === "inviata"
                      ? "Email inviata."
                      : risultato.esito === "sospesa"
                        ? "Email automatiche sospese: copia il link e invialo tu."
                        : risultato.esito === "errore"
                          ? "Invio non riuscito: copia il link e invialo tu."
                          : risultato.esito === "nessun_destinatario"
                            ? "Nessun destinatario: copia il link e invialo tu."
                            : "Link creato: copialo e invialo tu."}
                  </p>
                  {risultato.erroreInvio && (
                    <p className="mt-1 text-[11px]">{risultato.erroreInvio}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-stato-ok-bordo bg-white px-2 py-1 text-[10px] text-inchiostro">
                      {risultato.link}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copia()}
                      className="cursor-pointer rounded-control border border-stato-ok-bordo bg-white px-2 py-1 text-[10px] font-semibold text-stato-ok-testo"
                    >
                      {copiato ? "Copiato" : "Copia"}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-stato-ok-testo/80">
                    Per sicurezza il link completo non sarà più recuperabile:
                    se lo perdi, annulla questo questionario e creane un altro.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-crema-bordo pt-3">
                <button
                  type="button"
                  onClick={() => void crea()}
                  disabled={invio}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {invio ? (
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendIcon className="h-4 w-4" />
                  )}
                  Genera {inviaEmail ? "e invia" : "link"}
                </button>
                <button
                  type="button"
                  onClick={() => setAperto(false)}
                  className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
