"use client";

import { useSecondi } from "@/components/TempiContext";
import { formatCronometro } from "@/lib/durata";

// ===========================================================================
// La cifra che scorre, e NIENT'ALTRO.
//
// Esiste per una ragione di costo: il tick da 1 s cambia `TickContext`, e React
// ridisegna chi lo legge. Se a leggerlo fosse una riga di board o il pannello
// del cronometro, ogni secondo si ridisegnerebbe quel sottoalbero — una riga per
// ogni task. Qui il consumatore e' un `<span>`, quindi il lavoro per tick e'
// una sola funzione di formato.
//
// Chi mostra il cronometro lo usa cosi', senza leggere `secondi` nel proprio
// componente:
//   <CronometroLive className="tabular text-[13px] font-semibold" />
// ===========================================================================

export default function CronometroLive({ className }: { className?: string }) {
  const secondi = useSecondi();
  return <span className={className}>{formatCronometro(secondi)}</span>;
}
