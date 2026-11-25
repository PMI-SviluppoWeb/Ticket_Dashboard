"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProgettoListRow, StatoProgetto } from "@/lib/types";
import { PROJECT_STATUS_LABELS, chip } from "@/components/badges";
import { formatData } from "@/lib/calendario";
import { caricaApi, datoImmediato } from "@/lib/api-cache";
import { componiPersone, tutteLePersone } from "@/lib/persone";
import PersoneCondivise from "@/components/PersoneCondivise";
import { GripVerticalIcon } from "@/components/icons";

// Il limite massimo che /api/progetti accetta per pagina (lib/progetti.ts).
const LIMITE = 100;
// Orizzonte del chip "In scadenza": due settimane, scaduti compresi.
const GIORNI_SCADENZA = 14;

interface ProgettiKanbanProps {
  q: string;
  clienteId: string;
  // Incrementato dalla pagina dopo una creazione o un'eliminazione.
  versione: number;
  // Totale progetti del kanban, riportato alla pagina: il conteggio della
  // SectionBar sta fuori da qui, e nel kanban la lista della griglia non viene
  // caricata (era una query doppia per lo stesso dato).
  onTotale?: (n: number) => void;
}

// Colonne = STATI del progetto, non lenti sovrapposte. Ogni progetto sta in una
// sola colonna, quindi il drop e' una transizione di stato senza ambiguita'.
const COLONNE: { stato: StatoProgetto; punto: string }[] = [
  { stato: "PIANIFICATO", punto: "bg-stato-neutro-testo" },
  { stato: "IN_CORSO", punto: "bg-stato-info-testo" },
  { stato: "IN_PAUSA", punto: "bg-stato-attesa-testo" },
  { stato: "COMPLETATO", punto: "bg-stato-ok-testo" },
  { stato: "ANNULLATO", punto: "bg-stato-urgenza-testo" },
];

// Giorni da oggi alla scadenza, sul calendario locale. La data arriva come
// "YYYY-MM-DD": `new Date(v)` la leggerebbe in UTC e di sera, in Italia,
// sposterebbe la scadenza di un giorno.
function giorniA(v: string | null): number | null {
  if (!v) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const oggi = new Date();
  const inizio = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - inizio.getTime()) / 86_400_000);
}

function perScadenza(a: ProgettoListRow, b: ProgettoListRow) {
  // Senza scadenza in fondo: non c'e' urgenza da ordinare.
  return (a.data_fine ?? "9999").localeCompare(b.data_fine ?? "9999");
}

// Vista kanban dei progetti: una colonna per stato, righe compatte (titolo,
// scadenza, persone). Il passaggio di stato si fa TRASCINANDO la riga nella
// colonna di destinazione; per chi usa la tastiera, frecce sinistra/destra
// spostano il progetto di uno stato quando la riga ha il focus.
//
// L'aggiornamento e' ottimistico: la riga si sposta subito di colonna e torna
// indietro se il server rifiuta.
export default function ProgettiKanban({ q, clienteId, versione, onTotale }: ProgettiKanbanProps) {
  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  // Riga in corso di trascinamento e colonna sotto il puntatore: servono solo
  // all'evidenziazione del drop, non ai dati.
  const [trascinato, setTrascinato] = useState<string | null>(null);
  const [sopra, setSopra] = useState<StatoProgetto | null>(null);

  // In un ref: la callback della pagina e' una arrow inline e cambierebbe a
  // ogni render, ricreando `carica` e quindi ricaricando il kanban da zero.
  const onTotaleRef = useRef(onTotale);
  onTotaleRef.current = onTotale;

  const carica = useCallback(async () => {
    const params = new URLSearchParams({
      stato: "TUTTI",
      q,
      pagina: "1",
      paginaSize: String(LIMITE),
    });
    if (clienteId) params.set("cliente_id", clienteId);
    const url = `/api/progetti?${params.toString()}`;

    // Dato gia' visto: si mostra subito, la richiesta parte comunque.
    const subito = datoImmediato<{ progetti: ProgettoListRow[]; totale: number }>(url);
    if (subito) {
      setProgetti(subito.progetti ?? []);
      setTotale(subito.totale ?? 0);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const data = await caricaApi<{ progetti: ProgettoListRow[]; totale: number }>(url);
      setProgetti(data.progetti ?? []);
      const n = data.totale ?? 0;
      setTotale(n);
      // Il conteggio e' l'unico dato che serve anche alla pagina: comunicarlo
      // qui evita la seconda fetch della griglia solo per il numerino.
      onTotaleRef.current?.(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  }, [q, clienteId]);

  useEffect(() => {
    // `versione` cambia dopo una creazione o un'eliminazione: in quel caso la
    // cache e' gia' stata svuotata dalla scrittura, quindi la forza non serve.
    carica();
  }, [carica, versione]);

  // Aggiornamento ottimistico: gli avatar cambiano subito, e se il server
  // rifiuta si torna all'elenco precedente con un messaggio. Il primo nome va
  // in `responsabile` (colonna storica), gli altri in `persone`.
  const assegna = async (id: string, personeProgetto: string[]) => {
    const precedente = progetti.find((p) => p.id === id);
    if (!precedente) return;
    const { primario, persone } = componiPersone(
      personeProgetto[0] ?? null,
      personeProgetto.slice(1)
    );
    setProgetti((lista) =>
      lista.map((p) => (p.id === id ? { ...p, responsabile: primario, persone } : p))
    );
    setSalvando(id);
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsabile: primario, persone }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setProgetti((lista) =>
        lista.map((p) =>
          p.id === id
            ? {
                ...p,
                responsabile: precedente.responsabile,
                persone: precedente.persone,
              }
            : p
        )
      );
      setError("Persone non salvate. Riprova.");
    } finally {
      setSalvando(null);
    }
  };

  // Cambio di stato: trascinamento o frecce della tastiera finiscono qui.
  const sposta = async (id: string, nuovoStato: StatoProgetto) => {
    const precedente = progetti.find((p) => p.id === id);
    if (!precedente || precedente.stato === nuovoStato) return;

    setProgetti((lista) =>
      lista.map((p) => (p.id === id ? { ...p, stato: nuovoStato } : p))
    );
    setSalvando(id);
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Si ripristina solo se lo stato e' ancora quello che il server ha
      // rifiutato: uno spostamento successivo non deve essere sovrascritto.
      setProgetti((lista) =>
        lista.map((p) =>
          p.id === id && p.stato === nuovoStato ? { ...p, stato: precedente.stato } : p
        )
      );
      setError("Stato non salvato. Riprova.");
    } finally {
      setSalvando(null);
    }
  };

  const colonne = useMemo(
    () =>
      COLONNE.map((c) => ({
        ...c,
        righe: progetti.filter((p) => p.stato === c.stato).sort(perScadenza),
      })),
    [progetti]
  );

  return (
    <div className="mt-5">
      {error && (
        <p className="mb-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
          {error}
        </p>
      )}

      {!loading && progetti.length > 0 && !trascinato && (
        <p className="mb-3 text-xs text-caldo-testo">
          Trascina un progetto su un&apos;altra colonna per cambiarne lo stato.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {colonne.map((col) => {
          const evidenziata = sopra === col.stato;
          return (
            <section
              key={col.stato}
              aria-labelledby={`kanban-${col.stato}`}
              onDragOver={(e) => {
                // preventDefault e' cio' che rende la colonna un target valido.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setSopra(col.stato);
              }}
              onDragLeave={(e) => {
                // Senza il controllo si spegne al passaggio fra i figli.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setSopra(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setSopra(null);
                setTrascinato(null);
                if (id) void sposta(id, col.stato);
              }}
              className={`flex max-h-[calc(100vh-17rem)] min-h-[16rem] flex-col overflow-hidden rounded-panel bg-white shadow-soft transition-shadow ${
                evidenziata
                  ? "ring-2 ring-inchiostro"
                  : "ring-1 ring-crema-contorno"
              }`}
            >
              <header className="flex items-center gap-2 border-b border-crema-bordo px-4 py-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${col.punto}`} aria-hidden="true" />
                <h3
                  id={`kanban-${col.stato}`}
                  className="font-display text-base font-semibold text-inchiostro"
                >
                  {PROJECT_STATUS_LABELS[col.stato]}
                </h3>
                <span className="tabular rounded-full bg-crema-scuro px-2 py-0.5 text-[11px] font-semibold text-caldo-testo">
                  {loading ? "…" : col.righe.length}
                </span>
                {evidenziata && (
                  <span className="ml-auto text-[11px] font-semibold text-inchiostro">
                    Rilascia qui
                  </span>
                )}
              </header>

              {col.righe.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-caldo-testo">
                  {loading
                    ? "Caricamento…"
                    : trascinato
                      ? "Rilascia qui"
                      : "Nessun progetto"}
                </p>
              ) : (
                <ul className="flex-1 divide-y divide-crema-bordo overflow-y-auto">
                  {col.righe.map((p) => (
                    <RigaProgetto
                      key={p.id}
                      progetto={p}
                      salvando={salvando === p.id}
                      inTrascinamento={trascinato === p.id}
                      onAssegna={(persone) => assegna(p.id, persone)}
                      onSposta={(stato) => sposta(p.id, stato)}
                      onDragStart={() => setTrascinato(p.id)}
                      onDragEnd={() => {
                        setTrascinato(null);
                        setSopra(null);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {totale > LIMITE && (
        <p className="mt-3 text-xs text-caldo-testo">
          Mostrati i {LIMITE} progetti aggiornati più di recente su {totale}. Usa la ricerca o il
          filtro cliente per restringere.
        </p>
      )}
    </div>
  );
}

interface RigaProgettoProps {
  progetto: ProgettoListRow;
  salvando: boolean;
  inTrascinamento: boolean;
  onAssegna: (persone: string[]) => void;
  onSposta: (stato: StatoProgetto) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function RigaProgetto({
  progetto: p,
  salvando,
  inTrascinamento,
  onAssegna,
  onSposta,
  onDragStart,
  onDragEnd,
}: RigaProgettoProps) {
  const chiuso = p.stato === "COMPLETATO" || p.stato === "ANNULLATO";
  return (
    <li
      draggable
      onDragStart={(e) => {
        // L'id e' il dato trasferito; il tipo "text/plain" e' quello che tutti
        // i browser consegnano a getData in drop.
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      // Alternativa da tastiera al trascinamento: frecce per cambiare stato.
      tabIndex={0}
      aria-label={`${p.nome}. Stato: ${PROJECT_STATUS_LABELS[p.stato]}. Usa le frecce sinistra e destra per cambiare stato.`}
      onKeyDown={(e) => {
        // Solo con il focus sulla riga: i controlli interni hanno i loro tasti.
        if (e.target !== e.currentTarget) return;
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const i = COLONNE.findIndex((c) => c.stato === p.stato);
        const prossima = COLONNE[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (!prossima) return;
        e.preventDefault();
        onSposta(prossima.stato);
      }}
      className={`group/riga flex cursor-grab items-center gap-2 px-3 py-2.5 transition-colors duration-150 hover:bg-crema-scuro/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-inchiostro active:cursor-grabbing ${
        inTrascinamento ? "opacity-40" : ""
      }`}
    >
      <GripVerticalIcon className="h-3.5 w-3.5 shrink-0 text-caldo-testo/40 transition-colors group-hover/riga:text-caldo-testo" />
      <Link
        href={`/progetti/${p.id}`}
        title={p.nome}
        draggable={false}
        className={`min-w-0 flex-1 truncate text-sm font-semibold hover:underline ${
          chiuso ? "text-caldo-testo line-through decoration-caldo-testo/40" : "text-inchiostro"
        }`}
      >
        {p.nome}
      </Link>
      <Scadenza data={p.data_fine} chiuso={chiuso} />
      {/* Persone: avatar cliccabili con lo stesso editor della card e della
          pagina del progetto. Nella riga stretta del kanban si vedono solo le
          facce; i nomi stanno nel popover. */}
      <div className="shrink-0">
        <PersoneCondivise
          persone={tutteLePersone(p.responsabile, p.persone)}
          onCambia={onAssegna}
          titolo={`Persone sul progetto ${p.nome}`}
          vuoto=""
          allinea="destra"
          disabled={salvando}
        />
      </div>
    </li>
  );
}

function Scadenza({ data, chiuso }: { data: string | null; chiuso: boolean }) {
  const g = giorniA(data);
  if (g === null) {
    return <span className="w-[5.5rem] shrink-0 text-right text-xs text-caldo-testo">—</span>;
  }

  let testo = formatData(data);
  let colore = "border-stato-neutro-bordo bg-stato-neutro-bg text-stato-neutro-testo";
  // Un progetto chiuso non ha urgenza: si mostra solo la data.
  if (!chiuso) {
    if (g < 0) {
      testo = `Scaduto ${-g}g`;
      colore = "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo";
    } else if (g <= GIORNI_SCADENZA) {
      testo = g === 0 ? "Oggi" : g === 1 ? "Domani" : `Tra ${g}g`;
      colore =
        g <= 3
          ? "border-stato-urgenza-bordo bg-stato-urgenza-bg text-stato-urgenza-testo"
          : "border-stato-attesa-bordo bg-stato-attesa-bg text-stato-attesa-testo";
    }
  }

  return (
    <span className="flex w-[5.5rem] shrink-0 justify-end">
      <span className={`tabular whitespace-nowrap ${chip(colore)}`} title={`Scadenza ${formatData(data)}`}>
        {testo}
      </span>
    </span>
  );
}
