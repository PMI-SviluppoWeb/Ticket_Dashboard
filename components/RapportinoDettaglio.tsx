"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, LoaderIcon } from "@/components/icons";
import {
  RAPPORTINO_STATO_CLASSE,
  RAPPORTINO_STATO_LABEL,
  dataBreve,
  formatMinuti,
} from "@/components/rapportini/formato";
import type { Rapportino } from "@/lib/types";

interface Props {
  rapportino: Rapportino;
}

function Riga({
  etichetta,
  valore,
}: {
  etichetta: string;
  valore: string | null | undefined;
}) {
  if (!valore) return null;
  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="shrink-0 text-caldo-testo">{etichetta}</span>
      <span className="text-right font-medium text-inchiostro">{valore}</span>
    </div>
  );
}

export default function RapportinoDettaglio({ rapportino }: Props) {
  const [r, setR] = useState<Rapportino>(rapportino);
  const [attivita, setAttivita] = useState(r.attivita ?? "");
  const [note, setNote] = useState(r.note_aggiuntive ?? "");
  const [ore, setOre] = useState(String(Math.floor(r.minuti_totali / 60)));
  const [minuti, setMinuti] = useState(String(r.minuti_totali % 60));
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const esportato = r.stato === "esportato";

  const patch = async (body: Record<string, unknown>) => {
    setSalvando(true);
    setErrore(null);
    setSalvato(false);
    try {
      const res = await fetch(`/api/rapportini/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        rapportino?: Rapportino;
        error?: string;
      };
      if (!res.ok || !data.rapportino) {
        throw new Error(data.error ?? "Errore nel salvataggio.");
      }
      setR(data.rapportino);
      setAttivita(data.rapportino.attivita ?? "");
      setNote(data.rapportino.note_aggiuntive ?? "");
      setOre(String(Math.floor(data.rapportino.minuti_totali / 60)));
      setMinuti(String(data.rapportino.minuti_totali % 60));
      setSalvato(true);
      setTimeout(() => setSalvato(false), 2500);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nel salvataggio.");
    } finally {
      setSalvando(false);
    }
  };

  const salvaContenuto = () => {
    const totale =
      Math.max(0, parseInt(ore, 10) || 0) * 60 +
      Math.max(0, Math.min(59, parseInt(minuti, 10) || 0));
    void patch({
      attivita,
      note_aggiuntive: note,
      minuti_totali: totale,
    });
  };

  const totaleMinuti =
    Math.max(0, parseInt(ore, 10) || 0) * 60 +
    Math.max(0, Math.min(59, parseInt(minuti, 10) || 0));

  return (
    <div className="flex-1 overflow-y-auto bg-crema px-6 py-5 print:h-auto print:overflow-visible print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link
            href="/rapportini"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />
            Tutti i rapportini
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="cursor-pointer rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
            >
              Stampa / PDF
            </button>
            {!esportato && r.stato === "bozza" && (
              <button
                type="button"
                onClick={() => void patch({ stato: "confermato" })}
                disabled={salvando}
                className="cursor-pointer rounded-control bg-inchiostro px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
              >
                Conferma rapportino
              </button>
            )}
            {!esportato && r.stato === "confermato" && (
              <button
                type="button"
                onClick={() => void patch({ stato: "bozza" })}
                disabled={salvando}
                className="cursor-pointer rounded-control border border-crema-contorno bg-white px-3 py-1.5 text-xs font-medium text-caldo-testo transition-colors duration-200 hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
              >
                Riporta in bozza
              </button>
            )}
            <button
              type="button"
              disabled
              title="Integrazione Arca non ancora configurata"
              className="cursor-not-allowed rounded-control border border-crema-contorno bg-crema-scuro px-3 py-1.5 text-xs font-medium text-caldo-testo opacity-60"
            >
              Invia ad Arca
            </button>
          </div>
        </div>

        {errore && (
          <p
            role="alert"
            className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg p-3 text-sm text-stato-urgenza-testo print:hidden"
          >
            {errore}
          </p>
        )}
        {salvato && (
          <p className="flex items-center gap-2 rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo print:hidden">
            <CheckCircleIcon className="h-4 w-4" /> Rapportino salvato.
          </p>
        )}

        {/* Documento (stampabile) */}
        <article className="rounded-panel border border-crema-contorno bg-white p-8 print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-crema-bordo pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-caldo-testo">
                Rapportino di chiusura
              </p>
              <h1 className="tabular mt-1 font-display text-2xl font-semibold text-inchiostro">
                {r.numero}
              </h1>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                RAPPORTINO_STATO_CLASSE[r.stato] ?? RAPPORTINO_STATO_CLASSE.bozza
              }`}
            >
              {RAPPORTINO_STATO_LABEL[r.stato] ?? r.stato}
            </span>
          </header>

          <div className="grid grid-cols-1 gap-6 py-5 sm:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                Cliente
              </h2>
              <p className="mb-1.5 text-sm font-semibold text-inchiostro">
                {r.cliente_ragione_sociale}
              </p>
              <div className="space-y-1">
                <Riga etichetta="P. IVA" valore={r.cliente_partita_iva} />
                <Riga etichetta="Indirizzo" valore={r.cliente_indirizzo} />
                <Riga
                  etichetta="Città"
                  valore={[r.cliente_cap, r.cliente_citta, r.cliente_provincia]
                    .filter(Boolean)
                    .join(" ")}
                />
                <Riga etichetta="Email" valore={r.cliente_email} />
                <Riga etichetta="Telefono" valore={r.cliente_telefono} />
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                Ticket
              </h2>
              <p className="tabular mb-1.5 font-mono text-sm font-semibold text-inchiostro">
                {r.ticket_numero}
              </p>
              <div className="space-y-1">
                <Riga etichetta="Modulo" valore={r.modulo_software} />
                <Riga etichetta="Chiusura" valore={r.data_chiusura} />
                <Riga etichetta="Operatore" valore={r.operatore} />
                <Riga etichetta="Generato" valore={dataBreve(r.data_creazione)} />
              </div>
            </section>
          </div>

          <section className="border-t border-crema-bordo py-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Attività svolta
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-inchiostro">
              {r.attivita || r.sommario || "—"}
            </p>
            {r.descrizione && r.descrizione !== r.attivita && (
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-caldo-testo">
                {r.descrizione}
              </p>
            )}
          </section>

          <section className="border-t border-crema-bordo py-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Ore lavorate
            </h2>
            {r.voci.length === 0 ? (
              <p className="text-xs text-caldo-testo">
                Nessuna voce di cronometro registrata sul ticket.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-crema-bordo text-caldo-testo">
                    <th className="py-1.5 font-medium">Operatore</th>
                    <th className="py-1.5 text-right font-medium">Voci</th>
                    <th className="py-1.5 text-right font-medium">Ore</th>
                  </tr>
                </thead>
                <tbody>
                  {r.voci.map((v) => (
                    <tr key={v.operatore} className="border-b border-crema-bordo last:border-0">
                      <td className="py-1.5 text-inchiostro">{v.operatore}</td>
                      <td className="tabular py-1.5 text-right text-caldo-testo">
                        {v.voci}
                      </td>
                      <td className="tabular py-1.5 text-right font-medium text-inchiostro">
                        {formatMinuti(v.minuti)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-crema-bordo pt-2">
              <span className="text-xs font-semibold text-inchiostro">Totale</span>
              <span className="tabular rounded border border-stato-ok-bordo bg-stato-ok-bg px-2 py-0.5 text-sm font-bold text-stato-ok-testo">
                {formatMinuti(r.minuti_totali)}
              </span>
            </div>
          </section>

          <section className="border-t border-crema-bordo py-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
              Note aggiuntive
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-inchiostro">
              {r.note_aggiuntive || "—"}
            </p>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-crema-bordo pt-3 text-[10px] text-caldo-testo">
            <span>Stato invio ERP: Arca — da configurare</span>
            <span>Ultimo aggiornamento: {dataBreve(r.data_aggiornamento)}</span>
          </footer>
        </article>

        {/* Modifica (non stampata) */}
        {!esportato && (
          <section className="space-y-3 rounded-panel border border-crema-contorno bg-white p-5 print:hidden">
            <h2 className="text-sm font-bold text-inchiostro">Modifica contenuto</h2>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                Attività svolta
              </label>
              <textarea
                rows={3}
                value={attivita}
                onChange={(e) => setAttivita(e.target.value)}
                className="w-full resize-none rounded-control border border-crema-contorno px-3 py-2 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                Note aggiuntive
              </label>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note da riportare sul rapportino…"
                className="w-full resize-none rounded-control border border-crema-contorno px-3 py-2 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-caldo-testo">
                Ore lavorate
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={ore}
                  onChange={(e) => setOre(e.target.value)}
                  className="tabular w-20 rounded-control border border-crema-contorno px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
                <span className="text-xs text-caldo-testo">ore</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minuti}
                  onChange={(e) => setMinuti(e.target.value)}
                  className="tabular w-20 rounded-control border border-crema-contorno px-3 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
                <span className="text-xs text-caldo-testo">minuti</span>
                <span className="ml-auto text-[11px] text-caldo-testo">
                  Totale: <strong className="text-inchiostro">{formatMinuti(totaleMinuti)}</strong>
                </span>
              </div>
              <p className="mt-1 text-[10px] text-caldo-testo">
                Il totale corretto prevale sul dettaglio delle voci del cronometro.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={salvaContenuto}
                disabled={salvando}
                className="inline-flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
                Salva contenuto
              </button>
              <Link
                href={`/tickets/${r.ticket_id}`}
                className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Vai al ticket
              </Link>
            </div>
          </section>
        )}

        {esportato && (
          <p className="rounded-control border border-stato-ok-bordo bg-stato-ok-bg p-3 text-sm text-stato-ok-testo print:hidden">
            Rapportino esportato verso l&apos;ERP: non è più modificabile.
          </p>
        )}
      </div>
    </div>
  );
}
