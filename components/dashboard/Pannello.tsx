import type { ReactNode } from "react";

interface PannelloProps {
  children: ReactNode;
  className?: string;
  // Nome accessibile della regione: ogni pannello della dashboard e' una
  // sezione autonoma con scroll interno, utile da annunciare separatamente.
  ariaLabel: string;
}

// Guscio comune dei quattro pannelli del cruscotto.
//
// `min-h-0` e' la parte che conta: senza, un figlio con overflow scavalca
// l'altezza della cella della griglia e il pannello cresce invece di
// scorrere. L'ombra e' quella gia' usata da sidebar e AppHeader, quindi i
// pannelli stanno sullo stesso piano visivo senza introdurre un secondo
// linguaggio di profondita'.
export default function Pannello({ children, className = "", ariaLabel }: PannelloProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={`flex min-h-0 flex-col overflow-hidden rounded-card border border-crema-contorno bg-white shadow-soft ${className}`}
    >
      {children}
    </section>
  );
}
