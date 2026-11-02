"use client";

import { useEffect, useState } from "react";

// ===========================================================================
// Debounce di un valore.
//
// Si usa sulla ricerca: senza, ogni carattere digitato e' una richiesta HTTP e
// quindi una scansione `LIKE '%...%'` sul database remoto. 250 ms e' lo stesso
// ritardo gia' scelto nel progetto (ricerca ticket dentro un progetto): una
// sola scelta, non due.
//
// Da mettere sul valore PASSATO alla fetch, non sull'input: l'input resta
// controllato e risponde a ogni tasto, cambia solo quando parte la richiesta.
// ===========================================================================
export function useDebounce<T>(valore: T, ms = 250): T {
  const [debounced, setDebounced] = useState(valore);

  useEffect(() => {
    // Valori "vuoti" passano subito: cancellare il campo deve far tornare la
    // lista intera senza aspettare, e un ritardo qui si nota come blocco.
    if (valore === "" || valore === null || valore === undefined) {
      setDebounced(valore);
      return;
    }
    const id = setTimeout(() => setDebounced(valore), ms);
    return () => clearTimeout(id);
  }, [valore, ms]);

  return debounced;
}
