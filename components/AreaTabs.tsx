"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { figlioAttivo, getArea } from "@/lib/nav";

interface AreaTabsProps {
  // id dell'area in lib/nav.ts ("email", "report", "admin").
  areaId: string;
  className?: string;
}

// Tab di area: le pagine che appartengono allo stesso dominio (Posta in
// arrivo / Caselle, Ore / Cruscotto, Operatori / SLA / API / Agenti) si
// raggiungono da qui. La voce di sidebar resta UNA per area.
export default function AreaTabs({ areaId, className = "" }: AreaTabsProps) {
  const pathname = usePathname();
  const area = getArea(areaId);

  // Le aree con un solo figlio non hanno nulla da tabulare.
  if (!area || area.children.length < 2) return null;

  const attivo = figlioAttivo(area, pathname);

  return (
    <nav
      aria-label={`Sezione ${area.label}`}
      className={`-mt-2 mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-crema-contorno bg-white p-1 ${className}`}
    >
      {area.children.map((child) => {
        const active = attivo?.href === child.href;
        return (
          <Link
            key={child.href}
            href={child.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              active
                ? "bg-inchiostro text-white"
                : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
            }`}
          >
            {child.label}
          </Link>
        );
      })}
    </nav>
  );
}
