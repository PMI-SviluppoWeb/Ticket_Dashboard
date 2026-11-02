"use client";

import { useEffect, useState } from "react";

// ===========================================================================
// L'operatore della sessione, chiesto una volta sola.
//
// Prima ogni pagina lo chiedeva due volte (la Sidebar nel layout e la pagina
// stessa), e alcune anche di piu': due richieste HTTP e due query al database
// per lo stesso dato, a ogni caricamento. L'utente della sessione cambia solo
// al login, quindi una promessa condivisa in modulo basta: tutti i componenti
// che montano insieme aspettano la STESSA richiesta.
//
// Un errore non viene memoizzato: se la rete cade al primo tentativo, il
// prossimo componente che chiede riprova invece di mostrare "nessun utente".
// ===========================================================================

export interface OperatoreSessione {
  id: string;
  nome: string;
  email: string;
  ruolo: "admin" | "operatore";
}

let promessa: Promise<OperatoreSessione | null> | null = null;

export function caricaOperatore(): Promise<OperatoreSessione | null> {
  if (!promessa) {
    promessa = fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { operator?: OperatoreSessione | null };
        return data.operator ?? null;
      })
      .catch(() => {
        // Il fallimento non si cachea: un errore di rete non deve diventare
        // "nessun operatore" per tutta la sessione.
        promessa = null;
        return null;
      });
  }
  return promessa;
}

// Da chiamare al logout: la cache appartiene alla sessione, non alla scheda.
export function resetOperatore(): void {
  promessa = null;
}

export function useOperatore(): { operatore: OperatoreSessione | null; caricamento: boolean } {
  const [operatore, setOperatore] = useState<OperatoreSessione | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    let annullato = false;
    caricaOperatore().then((op) => {
      if (annullato) return;
      setOperatore(op);
      setCaricamento(false);
    });
    return () => {
      annullato = true;
    };
  }, []);

  return { operatore, caricamento };
}
