"use client";

import { useEffect, useState } from "react";
import { useTempi } from "@/components/TempiContext";
import { ClockIcon, TimerIcon } from "@/components/icons";
import { formatCronometro, formatDurata } from "@/lib/durata";
import type { VoceTempoEstesa } from "@/lib/types";

// ===========================================================================
// Cronometro di UN bersaglio (una task o un ticket).
//
// Mostra due cose che finora non esistevano: quanto e' stato lavorato su QUESTO
// oggetto, e il pulsante per farlo adesso. Il totale arriva dalle voci chiuse
// (lib/tempi.ts) e si aggiorna quando il cronometro globale si ferma — l'ascolto
// e' su `aperta`, non un polling: il contesto cambia stato quando una voce
// finisce, e quello e' l'unico momento in cui il totale puo' essere cambiato.
//
// La voce in corso non ha ancora una `fine`: il suo tempo scorre nel totale
// della riga SOLO se e' la voce di questo bersaglio, cosi' il numero sale
// mentre si lavora invece di restare fermo a un totale vecchio.
// ===========================================================================

interface TimerBersaglioProps {
  attivita_id?: string;
  ticket_id?: string;
  // Etichetta del bersaglio, usata per il testo del pulsante e per l'aria.
  etichetta: string;
  // Variante compatta: dentro una riga di tabella, dove lo spazio e' poco.
  compatto?: boolean;
  // Totale gia' calcolato dal chiamante (la board lo riceve in un solo
  // aggregato). Quando c'e', il componente non chiede nulla: una richiesta per
  // riga sarebbe un N+1 su una lista che puo' avere decine di task.
  minutiRegistrati?: number;
}

export default function TimerBersaglio({
  attivita_id,
  ticket_id,
  etichetta,
  compatto = false,
  minutiRegistrati: minutiDalChiamante,
}: TimerBersaglioProps) {
  const { aperta, secondi, inCorsoSu, avvia, ferma, caricamento } = useTempi();
  const [minutiLetti, setMinutiLetti] = useState<number | null>(null);
  const inCorso = inCorsoSu({ attivita_id, ticket_id });
  const minutiRegistrati = minutiDalChiamante ?? minutiLetti;

  // Id stabile del bersaglio: e' la chiave dell'effetto. Con due proprieta'
  // opzionali, `[attivita_id, ticket_id]` rieseguirebbe la fetch anche quando
  // una passa da undefined a null senza che il bersaglio cambi davvero.
  const chiave = attivita_id ? `a:${attivita_id}` : ticket_id ? `t:${ticket_id}` : "";
  const statoVoce = aperta?.id ?? "";

  useEffect(() => {
    // Il chiamante ha gia' il totale: nessuna richiesta.
    if (!chiave || minutiDalChiamante !== undefined) return;
    let annullato = false;
    const url = attivita_id
      ? `/api/tempi/bersaglio?attivita_id=${encodeURIComponent(attivita_id)}`
      : `/api/tempi/bersaglio?ticket_id=${encodeURIComponent(ticket_id as string)}`;

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Errore ${res.status}`);
        return (await res.json()) as { voci: VoceTempoEstesa[] };
      })
      .then((data) => {
        if (annullato) return;
        const totale = data.voci.reduce((acc, v) => {
          if (!v.fine) return acc;
          const a = new Date(v.inizio).getTime();
          const b = new Date(v.fine).getTime();
          if (!Number.isFinite(a) || !Number.isFinite(b)) return acc;
          return acc + Math.max(0, b - a) / 60000;
        }, 0);
        setMinutiLetti(Math.round(totale));
      })
      .catch(() => {
        // Un totale mancante non deve nascondere il pulsante del timer: si
        // mostra "—" e il controllo resta usabile.
        if (!annullato) setMinutiLetti(null);
      });

    return () => {
      annullato = true;
    };
    // `statoVoce` cambia quando una voce parte o si ferma: e' il segnale che
    // il totale puo' essere cambiato, e l'unico motivo corretto per rileggerlo.
  }, [chiave, attivita_id, ticket_id, statoVoce, minutiDalChiamante]);

  // Minuti della voce in corso su QUESTO bersaglio, sommati "al volo" ai
  // minuti registrati: il totale mostrato e' quindi sempre aggiornato.
  const minutiTotali =
    minutiRegistrati == null ? null : minutiRegistrati + (inCorso ? Math.floor(secondi / 60) : 0);

  const avviaQua = () =>
    avvia(attivita_id ? { attivita_id } : ticket_id ? { ticket_id } : {});

  if (compatto) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (inCorso) return ferma();
            return avviaQua();
          }}
          disabled={caricamento}
          title={
            inCorso
              ? `Ferma il timer su ${etichetta}`
              : `Avvia il timer su ${etichetta}`
          }
          aria-label={
            inCorso
              ? `Ferma il timer su ${etichetta}`
              : `Avvia il timer su ${etichetta}`
          }
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inchiostro disabled:opacity-40 ${
            inCorso
              ? "bg-lime text-lime-testo hover:bg-lime-scuro"
              : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
          }`}
        >
          {inCorso ? <span className="h-2 w-2 rounded-[2px] bg-current" /> : <TimerIcon className="h-3.5 w-3.5" />}
        </button>
        {inCorso ? (
          <span className="tabular text-[11px] font-semibold text-inchiostro">
            {formatCronometro(secondi)}
          </span>
        ) : minutiTotali !== null && minutiTotali > 0 ? (
          <span className="tabular text-[11px] font-medium text-caldo-testo">
            {formatDurata(minutiTotali)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="rounded-control border border-crema-contorno bg-crema-scuro/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-caldo-testo">
            <ClockIcon className="h-3 w-3" />
            Tempo registrato
          </p>
          <p className="tabular mt-0.5 text-base font-semibold text-inchiostro">
            {inCorso ? (
              <>
                {formatCronometro(secondi)}
                <span className="ml-1.5 text-xs font-medium text-caldo-testo">in corso</span>
              </>
            ) : minutiTotali === null ? (
              <span className="text-caldo-testo">—</span>
            ) : minutiTotali > 0 ? (
              formatDurata(minutiTotali)
            ) : (
              <span className="text-xs font-medium text-caldo-testo">Nessun tempo</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={inCorso ? ferma : avviaQua}
          disabled={caricamento}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
            inCorso
              ? "bg-lime text-lime-testo hover:bg-lime-scuro"
              : "bg-inchiostro text-white hover:bg-inchiostro-profondo"
          }`}
        >
          {inCorso ? "Ferma" : "Avvia timer"}
        </button>
      </div>
      {minutiTotali !== null && minutiTotali > 0 && !inCorso && (
        <p className="mt-2 border-t border-crema-bordo pt-2 text-[10px] text-caldo-testo">
          Tempo cumulato di tutte le voci chiuse su questo elemento.
        </p>
      )}
    </div>
  );
}
