"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LoaderIcon,
  SendIcon,
  SparklesIcon,
  XIcon,
} from "@/components/icons";
import { etichettaContesto } from "./contesto";
import { useCopilot } from "./CopilotContext";
import PropostaProgettoCard from "./PropostaProgettoCard";

const STATO_PROVIDER: Record<string, string> = {
  hermes: "Hermes · memoria persistente",
  openrouter: "OpenRouter",
};

export default function CopilotDrawer() {
  const {
    aperto,
    chiudi,
    agenti,
    agentiLoading,
    agenteId,
    agenteSel,
    selezionaAgente,
    messaggi,
    proposte,
    ricaricaProposte,
    invia,
    nuovaConversazione,
    inCorso,
    errore,
    contesto,
  } = useCopilot();

  const [testo, setTesto] = useState("");
  const fondoRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (aperto) fondoRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi, aperto, inCorso]);

  useEffect(() => {
    if (!aperto) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") chiudi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aperto, chiudi]);

  useEffect(() => {
    if (aperto) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [aperto]);

  if (!aperto) return null;

  const puoInviare = Boolean(agenteSel && agenteSel.attivo) && !inCorso;

  const submit = () => {
    if (!puoInviare || !testo.trim()) return;
    const t = testo;
    setTesto("");
    void invia(t);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Copilot agenti AI"
    >
      <button
        type="button"
        aria-label="Chiudi il Copilot"
        onClick={chiudi}
        className="absolute inset-0 cursor-default bg-inchiostro/30"
      />

      <aside className="relative flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-crema-bordo px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-inchiostro text-lime">
            <SparklesIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-inchiostro">Copilot</p>
            <p className="truncate text-[11px] text-caldo-testo">
              {agenteSel
                ? `${STATO_PROVIDER[agenteSel.provider] ?? agenteSel.provider} · ${agenteSel.modello || "modello di sistema"}`
                : agentiLoading
                  ? "Caricamento agenti…"
                  : "Nessun agente disponibile"}
            </p>
          </div>
          <button
            type="button"
            onClick={chiudi}
            aria-label="Chiudi"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-crema-bordo px-4 py-2">
          <select
            value={agenteId ?? ""}
            onChange={(event) => selezionaAgente(event.target.value)}
            aria-label="Agente"
            className="min-w-0 flex-1 rounded-control border border-crema-contorno px-2 py-1.5 text-xs text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            {agenti.length === 0 && <option value="">Nessun agente</option>}
            {agenti.map((a) => (
              <option key={a.id} value={a.id}>
                {a.pinnato ? "★ " : ""}
                {a.nome}
                {a.attivo ? "" : " (disattivato)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={nuovaConversazione}
            className="cursor-pointer rounded-control border border-crema-contorno px-2 py-1.5 text-[11px] font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            Nuova
          </button>
        </div>

        {contesto && (
          <div className="flex items-center gap-2 border-b border-crema-bordo bg-crema-scuro px-4 py-1.5 text-[11px] text-caldo-testo">
            <span className="inline-flex items-center rounded-full border border-crema-contorno bg-white px-2 py-0.5 font-medium text-inchiostro">
              {etichettaContesto(contesto)}
            </span>
            <span>contesto passato all&apos;agente</span>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messaggi.length === 0 && (
            <div className="rounded-panel border border-crema-contorno bg-crema-scuro p-4 text-xs leading-relaxed text-caldo-testo">
              {agenti.length === 0 ? (
                <>
                  Nessun agente disponibile.{" "}
                  <Link
                    href="/agenti"
                    onClick={chiudi}
                    className="font-semibold text-inchiostro underline underline-offset-2"
                  >
                    Crea o assegna un agente
                  </Link>
                  .
                </>
              ) : (
                <>
                  {agenteSel?.messaggio_iniziale ? (
                    <p className="whitespace-pre-wrap">{agenteSel.messaggio_iniziale}</p>
                  ) : (
                    <>
                      Scrivi una richiesta a{" "}
                      <strong className="text-inchiostro">{agenteSel?.nome}</strong>.
                      La conversazione resta aperta mentre navighi l&apos;app.
                    </>
                  )}
                  {agenteSel?.istruzioni_default?.trim() ? (
                    <button
                      type="button"
                      onClick={() => void invia("Esegui il compito di default.")}
                      disabled={inCorso || !agenteSel.attivo}
                      className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-inchiostro px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SparklesIcon className="h-3.5 w-3.5" />
                      Esegui il compito di default
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )}

          {messaggi.map((m) => {
            const traccia = m.esecuzione?.traccia ?? null;
            if (m.ruolo === "utente") {
              return (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-inchiostro px-3 py-2 text-xs leading-relaxed text-white">
                    {m.testo}
                  </p>
                </div>
              );
            }
            if (m.ruolo === "errore") {
              return (
                <div
                  key={m.id}
                  role="alert"
                  className="rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs text-stato-urgenza-testo"
                >
                  {m.testo}
                </div>
              );
            }
            return (
              <div key={m.id} className="space-y-1">
                <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-crema-contorno bg-crema-scuro px-3 py-2 text-xs leading-relaxed text-inchiostro">
                  {m.testo || (m.esecuzione ? "(nessun testo)" : "In corso…")}
                </div>
                {m.esecuzione && (
                  <div className="flex flex-wrap items-center gap-2 pl-1 text-[10px] text-caldo-testo">
                    {m.esecuzione.durata_ms != null && (
                      <span>{m.esecuzione.durata_ms} ms</span>
                    )}
                    {m.esecuzione.prompt_tokens != null && (
                      <span>
                        {m.esecuzione.prompt_tokens}+
                        {m.esecuzione.completion_tokens ?? 0} token
                      </span>
                    )}
                    {m.esecuzione.provider && (
                      <span>{m.esecuzione.provider}</span>
                    )}
                  </div>
                )}
                {traccia && traccia.length > 0 && (
                  <details className="pl-1 text-[11px] text-caldo-testo">
                    <summary className="cursor-pointer select-none font-medium text-inchiostro">
                      {traccia.length} azioni sui dati
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {traccia.map((v, i) => (
                        <li key={i} className="font-mono text-[10px] leading-snug">
                          <span className="font-semibold text-inchiostro">
                            {v.tool}
                          </span>{" "}
                          {v.argomenti}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}

          {proposte.length > 0 && (
            <div className="space-y-2 border-t border-crema-bordo pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-caldo-testo">
                Proposte di progetto
              </p>
              {proposte.map((p) => (
                <PropostaProgettoCard
                  key={p.id}
                  proposta={p}
                  onAggiornata={() => void ricaricaProposte()}
                />
              ))}
            </div>
          )}

          {inCorso && (
            <div className="flex items-center gap-2 text-xs text-caldo-testo">
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              L&apos;agente sta lavorando…
            </div>
          )}

          {errore && messaggi.every((m) => m.ruolo !== "errore") && (
            <p role="alert" className="text-xs text-stato-urgenza-testo">
              {errore}
            </p>
          )}

          <div ref={fondoRef} />
        </div>

        <div className="border-t border-crema-bordo p-3">
          {agenteSel && !agenteSel.attivo && (
            <p className="mb-2 text-[11px] text-stato-urgenza-testo">
              Questo agente è disattivato: attivalo da /agenti per usarlo.
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={testo}
              onChange={(event) => setTesto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                agenteSel
                  ? `Scrivi a ${agenteSel.nome}… (Invio per inviare)`
                  : "Nessun agente selezionato"
              }
              disabled={!agenteSel || !agenteSel.attivo}
              className="min-h-[44px] flex-1 resize-none rounded-control border border-crema-contorno px-3 py-2 text-xs text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!puoInviare || !testo.trim()}
              aria-label="Invia"
              className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-control bg-inchiostro text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inCorso ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-caldo-testo">
            <Link
              href="/agenti"
              onClick={chiudi}
              className="font-medium text-inchiostro underline-offset-2 hover:underline"
            >
              I miei agenti
            </Link>
            <Link
              href="/agenti/attivita"
              onClick={chiudi}
              className="font-medium text-inchiostro underline-offset-2 hover:underline"
            >
              Attività agenti
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
