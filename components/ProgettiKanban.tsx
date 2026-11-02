"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProgettoListRow } from "@/lib/types";
import { chip } from "@/components/badges";
import { formatData } from "@/lib/calendario";
import { caricaApi, datoImmediato } from "@/lib/api-cache";
import { componiPersone, tutteLePersone } from "@/lib/persone";
import PersoneCondivise from "@/components/PersoneCondivise";

// Il limite massimo che /api/progetti accetta per pagina (lib/progetti.ts).
const LIMITE = 100;
// Orizzonte della colonna "In scadenza": due settimane, scaduti compresi.
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

const CHIUSI = new Set(["COMPLETATO", "ANNULLATO"]);

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

// Vista kanban dei progetti: tre colonne di RIGHE, non di card. Una riga porta
// solo cio' che serve a decidere — titolo, scadenza, assegnatario — e la
// riassegnazione si fa sul posto, senza aprire il progetto.
//
// Le colonne sono LENTI, non stati esclusivi: un progetto in corso che scade
// domani compare sia in "In corso" sia in "In scadenza", e "Tutti" li contiene
// tutti. Per questo i dati stanno in un'unica lista: una riassegnazione si
// vede subito in ogni colonna in cui compare il progetto.
export default function ProgettiKanban({ q, clienteId, versione, onTotale }: ProgettiKanbanProps) {
  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

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

  const colonne = useMemo(() => {
    const aperti = progetti.filter((p) => !CHIUSI.has(p.stato));
    return [
      {
        chiave: "corso",
        titolo: "In corso",
        punto: "bg-stato-info-testo",
        nota: "",
        righe: progetti.filter((p) => p.stato === "IN_CORSO").sort(perScadenza),
      },
      {
        chiave: "scadenza",
        titolo: "In scadenza",
        punto: "bg-stato-urgenza-testo",
        nota: `Entro ${GIORNI_SCADENZA} giorni o scaduti`,
        righe: aperti
          .filter((p) => {
            const g = giorniA(p.data_fine);
            return g !== null && g <= GIORNI_SCADENZA;
          })
          .sort(perScadenza),
      },
      { chiave: "tutti", titolo: "Tutti", punto: "bg-caldo-testo", nota: "", righe: progetti },
    ];
  }, [progetti]);

  return (
    <div className="mt-5">
      {error && (
        <p className="mb-4 rounded-full bg-stato-urgenza-bg px-4 py-2 text-xs font-medium text-stato-urgenza-testo">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {colonne.map((col) => (
          <section
            key={col.chiave}
            aria-labelledby={`kanban-${col.chiave}`}
            className="flex max-h-[calc(100vh-17rem)] min-h-[16rem] flex-col overflow-hidden rounded-panel bg-white shadow-soft ring-1 ring-crema-contorno"
          >
            <header className="flex items-center gap-2 border-b border-crema-bordo px-4 py-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${col.punto}`} aria-hidden="true" />
              <h3 id={`kanban-${col.chiave}`} className="font-display text-base font-semibold text-inchiostro">
                {col.titolo}
              </h3>
              <span className="tabular rounded-full bg-crema-scuro px-2 py-0.5 text-[11px] font-semibold text-caldo-testo">
                {loading ? "…" : col.righe.length}
              </span>
              {col.nota && (
                <span className="ml-auto truncate text-[11px] text-caldo-testo">{col.nota}</span>
              )}
            </header>

            {col.righe.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-caldo-testo">
                {loading ? "Caricamento…" : "Nessun progetto"}
              </p>
            ) : (
              <ul className="flex-1 divide-y divide-crema-bordo overflow-y-auto">
                {col.righe.map((p) => (
                  <RigaProgetto
                    key={p.id}
                    progetto={p}
                    salvando={salvando === p.id}
                    onAssegna={(persone) => assegna(p.id, persone)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
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
  onAssegna: (persone: string[]) => void;
}

function RigaProgetto({ progetto: p, salvando, onAssegna }: RigaProgettoProps) {
  const chiuso = CHIUSI.has(p.stato);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-crema-scuro/50">
      <Link
        href={`/progetti/${p.id}`}
        title={p.nome}
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

