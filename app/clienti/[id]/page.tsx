"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOperatore } from "@/lib/operatore-client";
import PageHeader from "@/components/PageHeader";
import { LoaderIcon } from "@/components/icons";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import type { Cliente, Priorita, StatoTicket } from "@/lib/types";

interface TicketScheda {
  id: string;
  numero: string;
  stato: StatoTicket;
  priorita: Priorita;
  sommario_problema: string;
  modulo_software: string;
  contatto: string | null;
  telefono: string | null;
  email: string | null;
  creato_il: string | null;
  chiuso_il: string | null;
  canale: string | null;
}

interface Scheda {
  cliente: Cliente;
  tickets: TicketScheda[];
  ore: { voci: number; minuti: number };
  moduli: Array<{ nome: string; n: number }>;
  contatti: Array<{ contatto: string | null; telefono: string | null; email: string | null; n: number }>;
}

const pad = (n: number) => String(n).padStart(2, "0");

function data(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function ClientePage({ params }: { params: { id: string } }) {
  const { operatore, caricamento } = useOperatore();
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/clienti/${params.id}/scheda`, { cache: "no-store" });
      const dati = await res.json();
      if (!res.ok) throw new Error((dati as { error?: string }).error ?? "Errore nel caricamento.");
      setScheda(dati as Scheda);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (operatore) void carica();
  }, [operatore, carica]);

  if (caricamento || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="h-8 w-8 animate-spin text-inchiostro" />
      </div>
    );
  }

  if (!operatore) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Link href={`/login?redirect=/clienti/${params.id}`} className="rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white">
          Vai al login
        </Link>
      </div>
    );
  }

  if (error || !scheda) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div role="alert" className="rounded-card border border-stato-urgenza-bordo bg-stato-urgenza-bg p-4 text-sm text-stato-urgenza-testo">
          {error || "Cliente non trovato."}
        </div>
      </div>
    );
  }

  const { cliente } = scheda;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titolo={cliente.ragione_sociale}
          sottotitolo="Scheda in sola lettura: l'anagrafica è dell'ERP."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-card border border-crema-contorno bg-white p-4 lg:col-span-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Contatti</p>
            <ul className="space-y-1.5 text-sm text-inchiostro">
              {cliente.nome_contatto && <li>{cliente.nome_contatto}</li>}
              {cliente.email && <li className="break-all text-caldo-testo">{cliente.email}</li>}
              {cliente.telefono && <li className="tabular text-caldo-testo">{cliente.telefono}</li>}
              {(cliente.indirizzo || cliente.citta) && (
                <li className="text-caldo-testo">
                  {[cliente.indirizzo, cliente.citta, cliente.provincia].filter(Boolean).join(", ")}
                </li>
              )}
              {cliente.partita_iva && <li className="tabular text-caldo-testo">P.IVA {cliente.partita_iva}</li>}
            </ul>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Ore registrate</p>
            <p className="text-2xl font-semibold text-inchiostro">
              {Math.round((scheda.ore.minuti / 60) * 10) / 10}h
            </p>
            <p className="text-[11px] text-caldo-testo">{scheda.ore.voci} voci su ticket</p>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-caldo-testo">Moduli ricorrenti</p>
            {scheda.moduli.length === 0 ? (
              <p className="text-sm text-caldo-testo">Nessun ticket.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {scheda.moduli.map((m) => (
                  <li key={m.nome} className="flex justify-between gap-2">
                    <span className="truncate text-caldo-testo">{m.nome}</span>
                    <span className="tabular font-semibold text-inchiostro">{m.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-crema-contorno bg-white lg:col-span-2">
            <p className="border-b border-crema-contorno px-4 py-3 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
              Ticket ({scheda.tickets.length})
            </p>
            {scheda.tickets.length === 0 ? (
              <p className="p-6 text-center text-sm text-caldo-testo">Nessun ticket per questo cliente.</p>
            ) : (
              <ul className="divide-y divide-crema-contorno">
                {scheda.tickets.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/tickets/${t.id}`} className="truncate text-sm font-semibold text-inchiostro underline-offset-2 hover:underline">
                          {t.numero} · {t.sommario_problema}
                        </Link>
                        <p className="mt-0.5 text-xs text-caldo-testo">
                          {t.modulo_software} · aperto {data(t.creato_il)}
                          {t.chiuso_il ? ` · chiuso ${data(t.chiuso_il)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge priorita={t.priorita} />
                        <StatusBadge stato={t.stato} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {scheda.contatti.length > 0 && (
          <section className="mt-4 rounded-card border border-crema-contorno bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
              Referenti presenti nei ticket
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {scheda.contatti.map((c, i) => (
                <li key={`${c.contatto}-${c.email}-${i}`} className="rounded-control border border-crema-contorno px-3 py-2 text-xs">
                  <p className="font-semibold text-inchiostro">{c.contatto || c.email || c.telefono || "—"}</p>
                  <p className="text-caldo-testo">
                    {[c.email, c.telefono].filter(Boolean).join(" · ")}
                    <span className="ml-2 tabular">({c.n} ticket)</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
