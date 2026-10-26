import type { ReactNode } from "react";
import NotificationBell from "@/components/NotificationBell";
import CronometroHeader from "@/components/CronometroHeader";
import { CalendarIcon } from "@/components/icons";

interface AppHeaderProps {
  // Contenuto dentro la barra nera: di norma la ricerca della pagina, legata
  // al suo stato.
  children?: ReactNode;
  // Azioni specifiche della pagina. Stanno FUORI dalla barra, sul canvas, come
  // la campanella: i bottoni delle pagine sono disegnati per fondo chiaro.
  azioni?: ReactNode;
  // Bersaglio proposto dal cronometro quando la pagina ne ha uno ovvio (una
  // task aperta, un progetto). Puo' stare anche fuori dalla barra: e' un
  // suggerimento, non un vincolo.
  bersaglioTimer?: { attivita_id?: string; ticket_id?: string; etichetta: string } | null;
}

function saluto(ora: number) {
  if (ora < 13) return "Buongiorno";
  if (ora < 18) return "Buon pomeriggio";
  return "Buonasera";
}

// Barra superiore dell'applicazione — un solo shell per tutte le pagine.
//
// Pillola nera flottante (reference: public/projects.png) con saluto e data;
// azioni e campanella restano a destra sul canvas. Saluto e data dipendono
// dall'orologio del client mentre il server gira in UTC: da qui il
// `suppressHydrationWarning`, che evita l'avviso senza rendere la barra
// client-only.
export default function AppHeader({ children, azioni, bersaglioTimer = null }: AppHeaderProps) {
  const ora = new Date();
  const data = ora.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" });

  return (
    <header className="flex items-center gap-3 px-6 pb-1 pt-4">
      <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-full bg-inchiostro py-1.5 pl-6 pr-1.5 text-white shadow-soft">
        <span className="shrink-0 font-display text-base font-medium" suppressHydrationWarning>
          {saluto(ora.getHours())}
        </span>
        <span
          className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium capitalize text-white/80 sm:flex"
          suppressHydrationWarning
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {data}
        </span>
        {children && <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>}
        {/* Il cronometro sta DENTRO la barra: e' informazione di stato, come
            l'orologio, e deve seguire la pagina senza spostarsi. Sullo sfondo
            nero usa il tema scuro (pillola lime quando corre). */}
        <CronometroHeader tema="scuro" bersaglio={bersaglioTimer} />
        <span className="ml-auto mr-3 flex shrink-0 items-center gap-2 text-xs text-white/60">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
          </span>
          <span className="hidden lg:inline">Sincronizzato</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {azioni}
        <NotificationBell />
      </div>
    </header>
  );
}
