"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderIcon, SparklesIcon } from "@/components/icons";

type Azione = "riassunto" | "bozza_risposta" | "simili" | "nota";

interface Simile {
  id: string;
  ticket_id: string;
  numero: string | null;
  titolo: string;
  soluzione: string;
}

const ETICHETTE: Record<Azione, string> = {
  riassunto: "Riassumi",
  bozza_risposta: "Bozza risposta",
  simili: "Ticket simili",
  nota: "Proponi nota",
};

// Assistente dentro il ticket: propone, non modifica nulla. La bozza e le
// note vanno copiate/revisionate dall'operatore.
export default function AssistenteTicket({ ticketId }: { ticketId: string }) {
  const [azione, setAzione] = useState<Azione | null>(null);
  const [loading, setLoading] = useState<Azione | null>(null);
  const [risultato, setRisultato] = useState("");
  const [simili, setSimili] = useState<Simile[] | null>(null);
  const [errore, setErrore] = useState("");
  const [copiato, setCopiato] = useState(false);

  async function esegui(a: Azione) {
    setLoading(a);
    setErrore("");
    setRisultato("");
    setSimili(null);
    setCopiato(false);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: a }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Richiesta non riuscita.");
      setAzione(a);
      if (a === "simili") {
        setSimili((data as { simili?: Simile[] }).simili ?? []);
      } else {
        setRisultato(String((data as { risultato?: string }).risultato ?? ""));
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Richiesta non riuscita.");
    } finally {
      setLoading(null);
    }
  }

  async function copia() {
    try {
      await navigator.clipboard.writeText(risultato);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setErrore("Copia non disponibile: seleziona il testo a mano.");
    }
  }

  return (
    <section className="rounded-panel border border-crema-contorno bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
          <SparklesIcon className="h-4 w-4" />
          Assistente
        </p>
        <p className="text-[11px] text-caldo-testo">Propone; non modifica nulla.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(ETICHETTE) as Azione[]).map((a) => (
          <button
            key={a}
            type="button"
            disabled={loading !== null}
            onClick={() => esegui(a)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-crema-contorno px-2.5 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === a ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : null}
            {ETICHETTE[a]}
          </button>
        ))}
      </div>

      {errore && (
        <p role="alert" className="mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-2 text-xs text-stato-urgenza-testo">
          {errore}
        </p>
      )}

      {simili && (
        <div className="mt-3">
          {simili.length === 0 ? (
            <p className="text-xs text-caldo-testo">Nessun ticket simile trovato nelle note tecniche.</p>
          ) : (
            <ul className="space-y-2">
              {simili.map((s) => (
                <li key={s.id} className="rounded-control border border-crema-contorno px-3 py-2">
                  <Link
                    href={`/tickets/${s.ticket_id}`}
                    className="text-xs font-semibold text-inchiostro underline-offset-2 hover:underline"
                  >
                    {s.numero ? `${s.numero} · ` : ""}
                    {s.titolo}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-[11px] text-caldo-testo">{s.soluzione}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {risultato && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              {azione ? ETICHETTE[azione] : "Risultato"}
            </span>
            <button
              type="button"
              onClick={copia}
              className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
            >
              {copiato ? "Copiato" : "Copia"}
            </button>
          </div>
          <div className="mt-1 whitespace-pre-wrap rounded-control border border-crema-contorno bg-crema-scuro p-3 text-xs leading-relaxed text-inchiostro">
            {risultato}
          </div>
        </div>
      )}
    </section>
  );
}
