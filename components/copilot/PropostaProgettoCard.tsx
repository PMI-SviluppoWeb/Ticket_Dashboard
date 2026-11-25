"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  EditIcon,
  LoaderIcon,
  XIcon,
} from "@/components/icons";
import { useOperatore } from "@/lib/operatore-client";
import type { AgenteProposta } from "@/lib/types";

const STATO_LABEL = {
  in_attesa: "In attesa",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
} as const;

const STATO_CLASSE = {
  in_attesa: "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo",
  approvata: "border-stato-ok-bordo bg-stato-ok-bg text-stato-ok-testo",
  rifiutata: "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo",
} as const;

export default function PropostaProgettoCard({
  proposta,
  onAggiornata,
}: {
  proposta: AgenteProposta;
  onAggiornata: () => void;
}) {
  const { operatore } = useOperatore();
  const [espanso, setEspanso] = useState(false);
  const [busy, setBusy] = useState<"approva" | "rifiuta" | null>(null);
  const [errore, setErrore] = useState("");
  const [progettoId, setProgettoId] = useState<string | null>(null);

  const p = proposta.payload.progetto;
  const linkProgetto = progettoId ?? proposta.progetto_id;
  const puoGestire =
    operatore?.ruolo === "admin" ||
    (operatore != null && proposta.proposta_da === operatore.id);
  const inAttesa = proposta.stato === "in_attesa";

  const approva = async () => {
    setBusy("approva");
    setErrore("");
    try {
      const res = await fetch(`/api/agenti/proposte/${proposta.id}/approva`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        progetto_id?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Approvazione non riuscita.");
      setProgettoId(data.progetto_id ?? null);
      onAggiornata();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Approvazione non riuscita.");
    } finally {
      setBusy(null);
    }
  };

  const rifiuta = async () => {
    setBusy("rifiuta");
    setErrore("");
    try {
      const res = await fetch(`/api/agenti/proposte/${proposta.id}/rifiuta`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rifiuto non riuscito.");
      onAggiornata();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Rifiuto non riuscito.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-panel border border-crema-contorno bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">
            Proposta di progetto
          </p>
          <p className="truncate text-sm font-semibold text-inchiostro">
            {p.nome || "Senza nome"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-caldo-testo">
            {p.cliente_nome || proposta.payload.progetto.cliente_id || "Cliente da selezionare"}
            {" · "}
            {proposta.payload.attivita.length} attività
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATO_CLASSE[proposta.stato]}`}
        >
          {STATO_LABEL[proposta.stato]}
        </span>
      </div>

      {proposta.errore && (
        <p className="mt-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-2 text-[11px] text-stato-urgenza-testo">
          {proposta.errore}
        </p>
      )}

      {errore && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-stato-urgenza-testo">
          <AlertCircleIcon className="h-3.5 w-3.5" />
          {errore}
        </p>
      )}

      {linkProgetto && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-stato-ok-testo">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Progetto creato.
          <Link
            href={`/progetti/${linkProgetto}`}
            className="font-semibold underline underline-offset-2"
          >
            Apri progetto
          </Link>
        </p>
      )}

      <button
        type="button"
        onClick={() => setEspanso((v) => !v)}
        className="mt-2 cursor-pointer text-[11px] font-medium text-caldo-testo underline-offset-2 hover:text-inchiostro hover:underline"
      >
        {espanso ? "Nascondi attività" : "Mostra attività"}
      </button>

      {espanso && (
        <ul className="mt-2 space-y-1">
          {proposta.payload.attivita.map((a, i) => (
            <li
              key={`${a.titolo}-${i}`}
              className="rounded-control border border-crema-contorno px-2 py-1.5 text-[11px]"
            >
              <span className="font-medium text-inchiostro">{a.titolo}</span>
              <span className="ml-1 text-caldo-testo">· {a.priorita}</span>
              {a.data_scadenza && (
                <span className="ml-1 text-caldo-testo">· {a.data_scadenza}</span>
              )}
            </li>
          ))}
          {proposta.payload.attivita.length === 0 && (
            <li className="text-[11px] text-caldo-testo">Nessuna attività.</li>
          )}
        </ul>
      )}

      {inAttesa && puoGestire && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void approva()}
            disabled={busy !== null}
            className="inline-flex cursor-pointer items-center gap-1 rounded-control bg-inchiostro px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "approva" ? (
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircleIcon className="h-3.5 w-3.5" />
            )}
            Approva
          </button>
          <button
            type="button"
            onClick={() => void rifiuta()}
            disabled={busy !== null}
            className="inline-flex cursor-pointer items-center gap-1 rounded-control border border-crema-contorno px-2.5 py-1.5 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "rifiuta" ? (
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XIcon className="h-3.5 w-3.5" />
            )}
            Rifiuta
          </button>
          <Link
            href={`/agenti/proposte/${proposta.id}`}
            className="inline-flex items-center gap-1 rounded-control border border-crema-contorno px-2.5 py-1.5 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <EditIcon className="h-3.5 w-3.5" />
            Apri e modifica
          </Link>
        </div>
      )}

      {!puoGestire && inAttesa && (
        <p className="mt-2 text-[10px] text-caldo-testo">
          In attesa di approvazione da parte di chi l&apos;ha richiesta o di un admin.
        </p>
      )}
    </div>
  );
}
