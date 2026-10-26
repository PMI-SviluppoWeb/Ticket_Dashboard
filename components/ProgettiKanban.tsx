"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProgettoListRow } from "@/lib/types";
import { chip } from "@/components/badges";
import { ChevronDownIcon } from "@/components/icons";
import { formatData } from "@/lib/calendario";

// Il limite massimo che /api/progetti accetta per pagina (lib/progetti.ts).
const LIMITE = 100;
// Orizzonte della colonna "In scadenza": due settimane, scaduti compresi.
const GIORNI_SCADENZA = 14;

interface Operatore {
  id: string;
  nome: string;
}

interface ProgettiKanbanProps {
  q: string;
  clienteId: string;
  // Incrementato dalla pagina dopo una creazione o un'eliminazione.
  versione: number;
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
export default function ProgettiKanban({ q, clienteId, versione }: ProgettiKanbanProps) {
  const [progetti, setProgetti] = useState<ProgettoListRow[]>([]);
  const [totale, setTotale] = useState(0);
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const params = new URLSearchParams({
      stato: "TUTTI",
      q,
      pagina: "1",
      paginaSize: String(LIMITE),
    });
    if (clienteId) params.set("cliente_id", clienteId);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/progetti?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setProgetti((data.progetti ?? []) as ProgettoListRow[]);
      setTotale((data.totale ?? 0) as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  }, [q, clienteId]);

  useEffect(() => {
    carica();
  }, [carica, versione]);

  useEffect(() => {
    fetch("/api/operatori")
      .then((res) => (res.ok ? res.json() : { operatori: [] }))
      .then((data) => setOperatori((data.operatori ?? []) as Operatore[]))
      .catch(() => {});
  }, []);

  // Aggiornamento ottimistico: la select cambia subito, e se il server rifiuta
  // si torna al valore precedente con un messaggio.
  const assegna = async (id: string, responsabile: string) => {
    const prima = progetti.find((p) => p.id === id)?.responsabile ?? null;
    const nuovo = responsabile || null;
    setProgetti((lista) => lista.map((p) => (p.id === id ? { ...p, responsabile: nuovo } : p)));
    setSalvando(id);
    setError("");
    try {
      const res = await fetch(`/api/progetti/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsabile: nuovo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setProgetti((lista) => lista.map((p) => (p.id === id ? { ...p, responsabile: prima } : p)));
      setError("Assegnazione non salvata. Riprova.");
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
                    operatori={operatori}
                    salvando={salvando === p.id}
                    onAssegna={(nome) => assegna(p.id, nome)}
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
  operatori: Operatore[];
  salvando: boolean;
  onAssegna: (nome: string) => void;
}

function RigaProgetto({ progetto: p, operatori, salvando, onAssegna }: RigaProgettoProps) {
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
      <Assegnatario
        nomeProgetto={p.nome}
        valore={p.responsabile ?? ""}
        operatori={operatori}
        disabled={salvando}
        onChange={onAssegna}
      />
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

interface AssegnatarioProps {
  nomeProgetto: string;
  valore: string;
  operatori: Operatore[];
  disabled: boolean;
  onChange: (nome: string) => void;
}

// Select nativa vestita da pillola con avatar: tastiera, screen reader e
// mobile funzionano gratis, e sul telefono si apre il picker di sistema.
function Assegnatario({ nomeProgetto, valore, operatori, disabled, onChange }: AssegnatarioProps) {
  // `responsabile` e' testo libero: un nome storico che non corrisponde a
  // nessun operatore attivo va comunque mostrato, altrimenti la select
  // indicherebbe "Non assegnato" mentendo.
  const fuoriLista = valore !== "" && !operatori.some((o) => o.nome === valore);
  const iniziale = valore.trim()[0]?.toUpperCase();

  return (
    <div className={`relative w-32 shrink-0 ${disabled ? "opacity-60" : ""}`}>
      <span
        className={`pointer-events-none absolute left-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[11px] font-semibold ${
          iniziale ? "bg-lime text-lime-testo" : "border border-dashed border-caldo-testo/50 text-caldo-testo"
        }`}
        aria-hidden="true"
      >
        {iniziale ?? "+"}
      </span>
      <select
        value={valore}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Assegna il progetto ${nomeProgetto}`}
        className="h-8 w-full cursor-pointer appearance-none truncate rounded-full border border-crema-contorno bg-white pl-8 pr-6 text-xs font-medium text-inchiostro transition hover:border-caldo-testo/40 focus:outline-none focus:ring-2 focus:ring-inchiostro disabled:cursor-wait"
      >
        <option value="">Non assegnato</option>
        {fuoriLista && <option value={valore}>{valore}</option>}
        {operatori.map((o) => (
          <option key={o.id} value={o.nome}>
            {o.nome}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-caldo-testo" />
    </div>
  );
}
