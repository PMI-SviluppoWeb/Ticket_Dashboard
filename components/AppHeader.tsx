import type { ReactNode } from "react";
import NotificationBell from "@/components/NotificationBell";
import { CalendarIcon } from "@/components/icons";

interface AppHeaderProps {
  // Contenuto dentro la barra nera: di norma la ricerca della pagina, legata
  // al suo stato.
  children?: ReactNode;
  // Azioni specifiche della pagina. Stanno FUORI dalla barra, sul canvas, come
  // la campanella: i bottoni delle pagine sono disegnati per fondo chiaro.
  azioni?: ReactNode;
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
export default function AppHeader({ children, azioni }: AppHeaderProps) {
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
