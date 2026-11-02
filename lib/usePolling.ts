"use client";

import { useEffect, useRef } from "react";

// ===========================================================================
// Polling che sa quando smettere.
//
// Un `setInterval` che continua a scheda nascosta chiede al database anche
// mentre nessuno guarda: con un DB remoto e' traffico (e CPU) buttato. Qui
// l'intervallo viene disarmato quando la scheda va in background e riarmato al
// ritorno, con una chiamata IMMEDIATA: il dato che l'utente trova tornando deve
// essere fresco, non quello di mezz'ora fa.
//
// La callback vive in un ref: cambiarla (per esempio perche' il componente ha
// ricreato la funzione) non distrugge e ricrea l'intervallo. E' il bug che
// aveva la dashboard admin, che si resettava a ogni cambio di operatore.
// ===========================================================================
export function usePolling(fn: () => void, ms: number, attivo = true) {
  const rif = useRef(fn);

  useEffect(() => {
    rif.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!attivo) return;
    let id: ReturnType<typeof setInterval> | null = null;

    const avvia = () => {
      if (id === null) id = setInterval(() => rif.current(), ms);
    };
    const ferma = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const visibilita = () => {
      if (document.hidden) {
        ferma();
      } else {
        rif.current();
        avvia();
      }
    };

    if (!document.hidden) avvia();
    document.addEventListener("visibilitychange", visibilita);

    return () => {
      ferma();
      document.removeEventListener("visibilitychange", visibilita);
    };
  }, [ms, attivo]);
}
