"use client";

import { useEffect, useState } from "react";
import { LoaderIcon, PlusIcon, XIcon } from "@/components/icons";

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  onCreato: () => void;
  moduli?: string[];
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creazione ticket da UI: POST /api/tickets esisteva ma non era chiamato da
// nessuna parte — i ticket entravano solo via email. Serve per le chiamate
// telefoniche: l'email e' opzionale, e l'autorisposta al cliente si puo'
// spegnere (chi lavora al telefono spesso non ha scritto nulla al cliente).
export default function NuovoTicketModal({ aperto, onChiudi, onCreato, moduli = [] }: Props) {
  const [cliente, setCliente] = useState("");
  const [contatto, setContatto] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [modulo, setModulo] = useState("");
  const [sommario, setSommario] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [priorita, setPriorita] = useState<"BASSA" | "MEDIA" | "ALTA">("MEDIA");
  const [inviaConferma, setInviaConferma] = useState(true);

  const [anagrafica, setAnagrafica] = useState<{ ragione_sociale: string; email?: string | null }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  // L'anagrafica serve per l'autocompletamento e per precompilare
  // contatto/email quando il cliente e' gia' in anagrafica.
  useEffect(() => {
    if (!aperto || anagrafica.length > 0) return;
    fetch("/api/clienti?limit=500")
      .then((r) => r.json())
      .then((d) => setAnagrafica((d as { clienti?: { ragione_sociale: string; email?: string | null }[] }).clienti ?? []))
      .catch(() => {});
  }, [aperto, anagrafica.length]);

  useEffect(() => {
    if (!aperto) {
      setCliente("");
      setContatto("");
      setEmail("");
      setTelefono("");
      setModulo("");
      setSommario("");
      setDescrizione("");
      setPriorita("MEDIA");
      setInviaConferma(true);
      setErrore("");
    }
  }, [aperto]);

  if (!aperto) return null;

  const campo =
    "w-full rounded-control border border-crema-contorno bg-white px-3 py-2 text-sm text-inchiostro transition-colors duration-200 placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";
  const etichetta = "mb-1 block text-xs font-semibold text-caldo-testo";

  const salva = async () => {
    if (!cliente.trim() || !sommario.trim() || !descrizione.trim()) {
      setErrore("Cliente, sommario e descrizione sono obbligatori.");
      return;
    }
    if (email.trim() && !RE_EMAIL.test(email.trim())) {
      setErrore("L'email non e' valida.");
      return;
    }
    setSalvando(true);
    setErrore("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: cliente.trim(),
          contatto: contatto.trim() || undefined,
          email: email.trim() || undefined,
          telefono: telefono.trim() || undefined,
          modulo_software: modulo.trim() || undefined,
          sommario_problema: sommario.trim(),
          descrizione_dettagliata: descrizione.trim(),
          priorita,
          invia_conferma: inviaConferma,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Errore nella creazione del ticket.");
      }
      onCreato();
      onChiudi();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore nella creazione del ticket.");
    } finally {
      setSalvando(false);
    }
  };

  const suggerisci = (nome: string) => {
    const c = anagrafica.find((x) => x.ragione_sociale.toLowerCase() === nome.toLowerCase());
    if (c && c.email && !email) setEmail(c.email);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-inchiostro/40 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuovo ticket"
        className="w-full max-w-xl rounded-card border border-crema-contorno bg-white p-5 shadow-soft"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-inchiostro">Nuovo ticket</h2>
            <p className="mt-0.5 text-xs text-caldo-testo">Registra una richiesta arrivata per telefono o di persona.</p>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="cursor-pointer rounded p-1 text-caldo-testo transition-colors duration-200 hover:text-inchiostro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {errore && (
          <p role="alert" className="mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo">
            {errore}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="nt-cliente" className={etichetta}>Cliente *</label>
            <input
              id="nt-cliente"
              list="nt-clienti"
              value={cliente}
              onChange={(e) => {
                setCliente(e.target.value);
                suggerisci(e.target.value);
              }}
              className={campo}
              placeholder="Ragione sociale"
              required
            />
            <datalist id="nt-clienti">
              {anagrafica.map((c) => (
                <option key={c.ragione_sociale} value={c.ragione_sociale} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="nt-contatto" className={etichetta}>Contatto</label>
            <input id="nt-contatto" value={contatto} onChange={(e) => setContatto(e.target.value)} className={campo} placeholder="Nome della persona" />
          </div>
          <div>
            <label htmlFor="nt-telefono" className={etichetta}>Telefono</label>
            <input id="nt-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} placeholder="+39 ..." />
          </div>

          <div>
            <label htmlFor="nt-email" className={etichetta}>Email (per le risposte)</label>
            <input id="nt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="cliente@azienda.it" />
          </div>
          <div>
            <label htmlFor="nt-modulo" className={etichetta}>Modulo software</label>
            <input id="nt-modulo" list="nt-moduli" value={modulo} onChange={(e) => setModulo(e.target.value)} className={campo} placeholder="Generico" />
            <datalist id="nt-moduli">
              {moduli.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="nt-sommario" className={etichetta}>Sommario *</label>
            <input id="nt-sommario" value={sommario} onChange={(e) => setSommario(e.target.value)} className={campo} placeholder="Una riga che riassume il problema" required />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="nt-descrizione" className={etichetta}>Descrizione *</label>
            <textarea
              id="nt-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={4}
              className={`${campo} resize-y`}
              placeholder="Cosa ha riferito il cliente..."
              required
            />
          </div>

          <div>
            <label htmlFor="nt-priorita" className={etichetta}>Priorità</label>
            <select id="nt-priorita" value={priorita} onChange={(e) => setPriorita(e.target.value as typeof priorita)} className={campo}>
              <option value="BASSA">Bassa</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-caldo-testo">
              <input
                type="checkbox"
                checked={inviaConferma}
                onChange={(e) => setInviaConferma(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-inchiostro"
                disabled={!email.trim()}
              />
              <span>
                Invia email di conferma al cliente
                {!email.trim() && <em className="block not-italic opacity-70">(serve un&apos;email)</em>}
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onChiudi}
            className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={salva}
            disabled={salvando}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Creazione...
              </>
            ) : (
              <>
                <PlusIcon className="h-4 w-4" />
                Crea ticket
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
