"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useOperatore } from "@/lib/operatore-client";
import type {
  AgenteConversazione,
  AgenteEsecuzione,
  AgentePerOperatore,
  AgenteProposta,
} from "@/lib/types";
import { useContestoPagina, type ContestoPagina } from "./contesto";

// ===========================================================================
// Stato globale del Copilot.
//
// Vive nel layout radice, quindi la conversazione continua mentre si naviga:
// aprire un ticket o un cliente non azzera il thread. L'agente selezionato e
// i messaggi sono tenuti qui; la verita' persistente resta il log delle
// esecuzioni (agenti_esecuzioni), ricaricato quando si apre un thread.
// ===========================================================================

export interface MessaggioCopilot {
  id: string;
  ruolo: "utente" | "agente" | "errore";
  testo: string;
  esecuzione?: AgenteEsecuzione | null;
}

interface CopilotContextValue {
  aperto: boolean;
  apri: (agenteId?: string) => void;
  chiudi: () => void;
  toggle: () => void;
  // Agenti visibili all'operatore (personali + libreria), con `pinnato`.
  agenti: AgentePerOperatore[];
  agentiLoading: boolean;
  agenteId: string | null;
  agenteSel: AgentePerOperatore | null;
  selezionaAgente: (id: string) => void;
  conversazioneId: string | null;
  messaggi: MessaggioCopilot[];
  // Proposte di progetto create dall'agente in questa conversazione.
  proposte: AgenteProposta[];
  ricaricaProposte: () => Promise<void>;
  invia: (testo: string) => Promise<void>;
  nuovaConversazione: () => void;
  apriConversazione: (conversazione: AgenteConversazione) => Promise<void>;
  ricaricaAgenti: () => Promise<void>;
  contesto: ContestoPagina | null;
  inCorso: boolean;
  errore: string | null;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

function idLocale(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function messaggiDaEsecuzioni(esecuzioni: AgenteEsecuzione[]): MessaggioCopilot[] {
  const out: MessaggioCopilot[] = [];
  for (const es of esecuzioni) {
    out.push({ id: `${es.id}-in`, ruolo: "utente", testo: es.input_utente });
    if (es.stato === "errore") {
      out.push({
        id: `${es.id}-err`,
        ruolo: "errore",
        testo: es.errore ?? "Esecuzione non riuscita.",
        esecuzione: es,
      });
    } else if (es.stato === "in_corso") {
      out.push({
        id: `${es.id}-wait`,
        ruolo: "agente",
        testo: "In corso…",
        esecuzione: es,
      });
    } else {
      out.push({
        id: `${es.id}-out`,
        ruolo: "agente",
        testo: es.output ?? "",
        esecuzione: es,
      });
    }
  }
  return out;
}

export function CopilotProvider({ children }: { children: ReactNode }) {
  const { operatore } = useOperatore();
  const contesto = useContestoPagina();

  const [aperto, setAperto] = useState(false);
  const [agenti, setAgenti] = useState<AgentePerOperatore[]>([]);
  const [agentiLoading, setAgentiLoading] = useState(false);
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [conversazioneId, setConversazioneId] = useState<string | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioCopilot[]>([]);
  const [proposte, setProposte] = useState<AgenteProposta[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const ricaricaAgenti = useCallback(async () => {
    if (!operatore) {
      setAgenti([]);
      return;
    }
    setAgentiLoading(true);
    try {
      // `vista=miei`: anche per l'admin il Copilot mostra i SUOI agenti piu'
      // la libreria, non i personali degli altri operatori (quelli restano
      // nella supervisione di /admin/agenti).
      const res = await fetch("/api/agenti?vista=miei", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { agenti?: AgentePerOperatore[] };
      setAgenti(data.agenti ?? []);
    } catch {
      setAgenti([]);
    } finally {
      setAgentiLoading(false);
    }
  }, [operatore]);

  useEffect(() => {
    void ricaricaAgenti();
  }, [ricaricaAgenti]);

  // Agente di default: il primo pinnato, altrimenti il primo disponibile.
  useEffect(() => {
    if (agenteId && agenti.some((a) => a.id === agenteId)) return;
    if (agenti.length === 0) {
      if (agenteId) setAgenteId(null);
      return;
    }
    const preferito = agenti.find((a) => a.pinnato) ?? agenti[0];
    setAgenteId(preferito.id);
  }, [agenti, agenteId]);

  const agenteSel = useMemo(
    () => agenti.find((a) => a.id === agenteId) ?? null,
    [agenti, agenteId]
  );

  const caricaProposte = useCallback(async (convId: string | null) => {
    if (!convId) {
      setProposte([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/agenti/proposte?conversazione_id=${encodeURIComponent(convId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setProposte([]);
        return;
      }
      const data = (await res.json()) as { proposte?: AgenteProposta[] };
      setProposte(data.proposte ?? []);
    } catch {
      setProposte([]);
    }
  }, []);

  useEffect(() => {
    void caricaProposte(conversazioneId);
  }, [conversazioneId, caricaProposte]);

  // Riaprendo il Copilot si riallineano le proposte (potrebbero essere state
  // approvate dalla pagina dedicata nel frattempo).
  useEffect(() => {
    if (aperto) void caricaProposte(conversazioneId);
  }, [aperto, conversazioneId, caricaProposte]);

  const ricaricaProposte = useCallback(
    () => caricaProposte(conversazioneId),
    [caricaProposte, conversazioneId]
  );

  const apri = useCallback((id?: string) => {
    setAperto(true);
    if (id) {
      setAgenteId(id);
      setConversazioneId(null);
      setMessaggi([]);
      setProposte([]);
      setErrore(null);
    }
  }, []);

  const chiudi = useCallback(() => setAperto(false), []);
  const toggle = useCallback(() => setAperto((v) => !v), []);

  const selezionaAgente = useCallback((id: string) => {
    setAgenteId(id);
    setConversazioneId(null);
    setMessaggi([]);
    setProposte([]);
    setErrore(null);
  }, []);

  const nuovaConversazione = useCallback(() => {
    setConversazioneId(null);
    setMessaggi([]);
    setProposte([]);
    setErrore(null);
  }, []);

  const apriConversazione = useCallback(
    async (conversazione: AgenteConversazione) => {
      setAperto(true);
      setAgenteId(conversazione.agente_id);
      setConversazioneId(conversazione.id);
      setErrore(null);
      try {
        const res = await fetch(
          `/api/agenti/${conversazione.agente_id}/conversazioni/${conversazione.id}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { messaggi?: AgenteEsecuzione[] };
        setMessaggi(messaggiDaEsecuzioni(data.messaggi ?? []));
        void caricaProposte(conversazione.id);
      } catch {
        setMessaggi([]);
        setErrore("Impossibile caricare la conversazione.");
      }
    },
    [caricaProposte]
  );

  const invia = useCallback(
    async (testo: string) => {
      const pulito = testo.trim();
      if (!pulito || !agenteId || inCorso) return;
      setErrore(null);
      setMessaggi((prev) => [
        ...prev,
        { id: idLocale(), ruolo: "utente", testo: pulito },
      ]);
      setInCorso(true);
      try {
        let convId = conversazioneId;
        if (!convId) {
          const resConv = await fetch(`/api/agenti/${agenteId}/conversazioni`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              titolo: pulito.slice(0, 80),
              contesto: contesto ? { tipo: contesto.tipo, id: contesto.id } : undefined,
            }),
          });
          const dataConv = (await resConv.json().catch(() => ({}))) as {
            conversazione?: AgenteConversazione;
            error?: string;
          };
          if (!resConv.ok || !dataConv.conversazione) {
            throw new Error(dataConv.error ?? "Impossibile aprire la conversazione.");
          }
          convId = dataConv.conversazione.id;
          setConversazioneId(convId);
        }

        const res = await fetch(`/api/agenti/${agenteId}/esegui`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: pulito,
            conversazioneId: convId,
            contesto: contesto ? { tipo: contesto.tipo, id: contesto.id } : undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          esecuzione?: AgenteEsecuzione;
          error?: string;
        };
        if (!res.ok || !data.esecuzione) {
          throw new Error(data.error ?? "Esecuzione non riuscita.");
        }
        const es = data.esecuzione;
        setMessaggi((prev) => [
          ...prev,
          {
            id: es.id,
            ruolo: "agente",
            testo: es.output ?? "",
            esecuzione: es,
          },
        ]);
        // L'agente può aver creato una proposta durante il turno.
        await caricaProposte(convId);
      } catch (err) {
        const messaggio =
          err instanceof Error ? err.message : "Esecuzione non riuscita.";
        setErrore(messaggio);
        setMessaggi((prev) => [
          ...prev,
          { id: idLocale(), ruolo: "errore", testo: messaggio },
        ]);
      } finally {
        setInCorso(false);
      }
    },
    [agenteId, conversazioneId, contesto, inCorso, caricaProposte]
  );

  const value = useMemo<CopilotContextValue>(
    () => ({
      aperto,
      apri,
      chiudi,
      toggle,
      agenti,
      agentiLoading,
      agenteId,
      agenteSel,
      selezionaAgente,
      conversazioneId,
      messaggi,
      proposte,
      ricaricaProposte,
      invia,
      nuovaConversazione,
      apriConversazione,
      ricaricaAgenti,
      contesto,
      inCorso,
      errore,
    }),
    [
      aperto,
      apri,
      chiudi,
      toggle,
      agenti,
      agentiLoading,
      agenteId,
      agenteSel,
      selezionaAgente,
      conversazioneId,
      messaggi,
      proposte,
      ricaricaProposte,
      invia,
      nuovaConversazione,
      apriConversazione,
      ricaricaAgenti,
      contesto,
      inCorso,
      errore,
    ]
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot va usato dentro <CopilotProvider>.");
  return ctx;
}
