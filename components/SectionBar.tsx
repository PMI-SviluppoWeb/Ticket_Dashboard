import type { ReactNode } from "react";

interface SectionBarProps {
  titolo: string;
  // Componente icona del progetto (components/icons.tsx), che accetta solo
  // `className`. Non e' un tipo Lucide: le icone qui sono SVG scritte a mano.
  icona?: (props: { className?: string }) => JSX.Element;
  conteggio?: number;
  // Slot destro: filtri, tab, link "Vedi tutti".
  children?: ReactNode;
}

// Barra di sezione — titolo, contatore e controlli sulla STESSA riga.
//
// Prima questo ritmo non esisteva: il titolo della sezione stava in una riga e i
// controlli in un'altra, con due padding diversi a seconda della pagina
// (`px-4 py-3` su dashboard e operatore, `px-5 py-4` su admin) e tre diverse
// dimensioni per l'h2 (`text-sm font-bold`, `text-lg font-semibold`,
// `text-sm font-bold uppercase`). Concentrare titolo e controlli su una riga
// sola e' cio' che rende la pagina leggibile a colpo d'occhio: si vede
// cos'e' la sezione e cosa ci si puo' fare senza spostare l'occhio.
export default function SectionBar({
  titolo,
  icona: Icona,
  conteggio,
  children,
}: SectionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-crema-bordo px-5 py-3.5">
      {/* `text-base`, non `text-sm`: nella reference i titoli di sezione hanno
          la stessa taglia dei titoli delle card, quindi a 14px la barra
          risultava timida e non reggeva il peso dei controlli accanto. A 16px
          resta chiaramente subordinata al titolo di pagina (36px). */}
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-inchiostro">
        {Icona && <Icona className="h-4 w-4 shrink-0 text-caldo-testo" />}
        {titolo}
      </h2>

      {conteggio !== undefined && (
        // Il `tabular` tiene ferma la pillola quando il numero cambia: la
        // dashboard si aggiorna ogni 30s e senza cifre a larghezza fissa il
        // contatore ballerebbe spostando i controlli accanto.
        <span className="tabular shrink-0 rounded-full bg-crema-scuro px-2.5 py-0.5 text-[11px] font-semibold text-caldo-testo">
          {conteggio}
        </span>
      )}

      {children && (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
