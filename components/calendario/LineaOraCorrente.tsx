"use client";

import { useEffect, useState } from "react";
import { topPx } from "@/lib/calendario-griglia";

// Linea "adesso" nella colonna di oggi.
//
// Lo stato parte da null e viene valorizzato solo dopo il mount: durante la
// render lato server l'ora del client non esiste e un valore calcolato subito
// produrrebbe un mismatch di hydration (e un lampo con l'ora sbagliata, se il
// fuso del server non e' quello dell'utente).
//
// La tinta e' inchiostro, non rosso: in questa app il rosso (stato.urgenza)
// significa criticita', non "ora corrente".
export default function LineaOraCorrente({ pxPerOra }: { pxPerOra: number }) {
  const [minuti, setMinuti] = useState<number | null>(null);

  useEffect(() => {
    const aggiorna = () => {
      const adesso = new Date();
      setMinuti(adesso.getHours() * 60 + adesso.getMinutes());
    };
    aggiorna();
    // Un minuto basta per un indicatore che si muove di ~1px al minuto; il
    // tick a 30 s evita che il salto sia visibile.
    const id = window.setInterval(aggiorna, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (minuti === null) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top: topPx(minuti, pxPerOra) }}
      aria-hidden="true"
    >
      <div className="h-[1.5px] w-full bg-inchiostro" />
      <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-inchiostro" />
    </div>
  );
}
