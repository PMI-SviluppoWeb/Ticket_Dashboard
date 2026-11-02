"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { VoceTempoEstesa } from "@/lib/types";

// ===========================================================================
// Il cronometro dell'applicazione.
//
// Vive in un solo posto (il layout) e viene letto da tutti: header, board
// delle task e pannello del ticket mostrano lo STESSO stato. Se ogni
// componente tenesse il proprio, avviare un timer dall'header non aggiornerebbe
// la riga della task, e si potrebbe avviarne un secondo credendo che non ci sia.
//
// Solo UNA voce puo' correre per operatore: e' una regola del server (vedi
// lib/tempi.ts), e qui il client la rispecchia. Avviare un nuovo bersaglio
// chiude il precedente lato server: la risposta dice qual e' quello vero, e lo
// stato locale si allinea a quella, non all'ottimismo locale.
//
// Il conteggio e' DERIVATO da `inizio` e dall'orologio del client: nessun setInterval
// accumula secondi (un intervallo deriva col tempo, e a scheda in background
// il browser lo rallenta). Un tick al secondo serve solo a far ri-renderizzare
// il numero.
//
// TRE CONTESTI, NON UNO. Con un solo oggetto, il tick da 1 s cambiava il value
// e React ri-renderizzava OGNI consumatore — quindi l'intera pagina del
// progetto e tutte le righe della board, una volta al secondo, per aggiornare
// una cifra. Con tre contesti separati il tick invalida solo chi legge il
// numero; chi legge lo stato (chi e' aperto) cambia solo su start/stop, e le
// azioni non cambiano mai dopo il mount.
// ===========================================================================

interface TempiAzioni {
  // Avvia (o sposta) il cronometro. Chiude l'eventuale voce in corso.
  avvia: (bersaglio: { attivita_id?: string; ticket_id?: string; descrizione?: string }) => Promise<void>;
  ferma: () => Promise<void>;
  elimina: (id: string) => Promise<void>;
  ricarica: () => Promise<void>;
  // true se la voce aperta corre sul bersaglio indicato: la riga della task
  // mostra "Ferma" invece di "Avvia" senza dover confrontare gli id a mano.
  inCorsoSu: (bersaglio: { attivita_id?: string; ticket_id?: string }) => boolean;
}

interface TempiStato {
  // Voce attualmente in corso, se c'e'.
  aperta: VoceTempoEstesa | null;
  // Ultime voci dell'operatore, per il pannello a tendina.
  voci: VoceTempoEstesa[];
  caricamento: boolean;
  errore: string;
}

const AzioniContext = createContext<TempiAzioni | null>(null);
const StatoContext = createContext<TempiStato | null>(null);
const TickContext = createContext<number>(0);

function useAzioni(): TempiAzioni {
  const ctx = useContext(AzioniContext);
  // Errore esplicito invece di un default silenzioso: un componente fuori
  // dal provider mostrerebbe uno stato vuoto per sempre, che sembra un bug
  // del backend.
  if (!ctx) throw new Error("useTempiAzioni va usato dentro <TempiProvider>.");
  return ctx;
}

function useStateTempi(): TempiStato {
  const ctx = useContext(StatoContext);
  if (!ctx) throw new Error("useTempiStato va usato dentro <TempiProvider>.");
  return ctx;
}

// Solo le azioni: non cambiano mai, quindi il componente non si ridisegna ne'
// al tick ne' su start/stop.
export function useTempiAzioni(): TempiAzioni {
  return useAzioni();
}

// Solo lo stato: cambia su start/stop, MAI al tick.
export function useTempiStato(): TempiStato {
  return useStateTempi();
}

// Solo il numero: e' l'unico che cambia ogni secondo. Da usare in un componente
// foglia dedicato (es. <CifraCronometro />), non in una riga di tabella.
export function useSecondi(): number {
  return useContext(TickContext);
}

// Compatibilita': unisce i tre. Chi lo usa si ridisegna ogni secondo, quindi i
// consumatori esistenti sono stati migrati ai tre hook sopra; questo resta per
// non rompere eventuali usi futuri che hanno davvero bisogno di tutto insieme.
export function useTempi(): TempiStato & TempiAzioni & { secondi: number } {
  const stato = useStateTempi();
  const azioni = useAzioni();
  const secondi = useContext(TickContext);
  return useMemo(() => ({ ...stato, ...azioni, secondi }), [stato, azioni, secondi]);
}

export function TempiProvider({ children }: { children: ReactNode }) {
  const [aperta, setAperta] = useState<VoceTempoEstesa | null>(null);
  const [voci, setVoci] = useState<VoceTempoEstesa[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [adesso, setAdesso] = useState(() => Date.now());
  const [richiestaInCorso, setRichiestaInCorso] = useState(false);

  // Guardia contro il doppio clic: due POST ravvicinati creerebbero due voci
  // (il secondo chiuderebbe il primo con zero secondi). Il ref evita la
  // corsa che lo state non intercetta, perche' il setState e' asincrono.
  const inVolo = useRef(false);

  // Specchio sincrono di `aperta`, cosi' `ferma` e `inCorsoSu` non devono
  // elencarlo nelle dipendenze. Erano le due uniche azioni che cambiavano a
  // ogni start/stop, e quindi le uniche a invalidare chi le usa.
  const apertaRef = useRef<VoceTempoEstesa | null>(null);
  const applicaAperta = useCallback((voce: VoceTempoEstesa | null) => {
    apertaRef.current = voce;
    setAperta(voce);
  }, []);

  const carica = useCallback(async () => {
    try {
      const res = await fetch("/api/tempi", { cache: "no-store" });
      // Il provider sta nel layout, quindi vive anche sulla pagina di login:
      // li' l'API risponde 401 per costruzione. Non e' un errore da mostrare,
      // e tenere il messaggio in stato lo farebbe comparire appena si entra.
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = (await res.json()) as { aperta: VoceTempoEstesa | null; voci: VoceTempoEstesa[] };
      applicaAperta(data.aperta ?? null);
      setVoci(data.voci ?? []);
      setErrore("");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore di caricamento.");
    } finally {
      setCaricamento(false);
    }
  }, [applicaAperta]);

  useEffect(() => {
    carica();
  }, [carica]);

  // Tick al secondo, solo mentre un cronometro corre: a voci ferme un timer
  // che gira e' lavoro sprecato e ri-render inutili in tutta l'app.
  useEffect(() => {
    if (!aperta) return;
    const id = setInterval(() => setAdesso(Date.now()), 1000);
    return () => clearInterval(id);
  }, [aperta]);

  const secondi = useMemo(() => {
    if (!aperta) return 0;
    const inizio = new Date(aperta.inizio).getTime();
    if (!Number.isFinite(inizio)) return 0;
    return Math.max(0, Math.floor((adesso - inizio) / 1000));
  }, [aperta, adesso]);

  const avvia = useCallback(
    async (bersaglio: { attivita_id?: string; ticket_id?: string; descrizione?: string }) => {
      if (inVolo.current) return;
      inVolo.current = true;
      setRichiestaInCorso(true);
      setErrore("");
      try {
        const res = await fetch("/api/tempi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bersaglio),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
        // Lo stato si allinea alla RISPOSTA, non all'ottimismo: e' il server a
        // sapere quale voce e' rimasta aperta dopo aver chiuso la precedente.
        applicaAperta(data as VoceTempoEstesa);
        setAdesso(Date.now());
        await carica();
      } catch (err) {
        setErrore(err instanceof Error ? err.message : "Errore di avvio.");
      } finally {
        inVolo.current = false;
        setRichiestaInCorso(false);
      }
    },
    [applicaAperta, carica]
  );

  const ferma = useCallback(async () => {
    const voce = apertaRef.current;
    if (inVolo.current || !voce) return;
    inVolo.current = true;
    setRichiestaInCorso(true);
    setErrore("");
    try {
      const res = await fetch(`/api/tempi/${voce.id}`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
      applicaAperta(null);
      await carica();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore di arresto.");
    } finally {
      inVolo.current = false;
      setRichiestaInCorso(false);
    }
  }, [applicaAperta, carica]);

  const elimina = useCallback(
    async (id: string) => {
      setErrore("");
      try {
        const res = await fetch(`/api/tempi/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
        await carica();
      } catch (err) {
        setErrore(err instanceof Error ? err.message : "Errore di eliminazione.");
      }
    },
    [carica]
  );

  const inCorsoSu = useCallback((bersaglio: { attivita_id?: string; ticket_id?: string }) => {
    const voce = apertaRef.current;
    if (!voce) return false;
    if (bersaglio.attivita_id) return voce.attivita_id === bersaglio.attivita_id;
    if (bersaglio.ticket_id) return voce.ticket_id === bersaglio.ticket_id;
    // Nessun id: e' il tempo generico, che corrisponde solo a una voce
    // generica (nessuno dei due id valorizzato).
    return !voce.attivita_id && !voce.ticket_id;
  }, []);

  // Stabile per costruzione: tutte le funzioni sopra leggono da ref o da
  // callback con dipendenze stabili.
  const azioni = useMemo<TempiAzioni>(
    () => ({ avvia, ferma, elimina, ricarica: carica, inCorsoSu }),
    [avvia, ferma, elimina, carica, inCorsoSu]
  );

  // Cambia solo su start/stop, non al tick.
  const stato = useMemo<TempiStato>(
    () => ({ aperta, voci, caricamento: caricamento || richiestaInCorso, errore }),
    [aperta, voci, caricamento, richiestaInCorso, errore]
  );

  return (
    <AzioniContext.Provider value={azioni}>
      <StatoContext.Provider value={stato}>
        {/* Il numero e' l'unico valore che cambia ogni secondo. I `children`
            passano per identita': React non li ridisegna quando cambia solo
            questo provider. */}
        <TickContext.Provider value={secondi}>{children}</TickContext.Provider>
      </StatoContext.Provider>
    </AzioniContext.Provider>
  );
}
