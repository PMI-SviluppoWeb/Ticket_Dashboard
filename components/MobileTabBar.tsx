"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { resetOperatore, useOperatore } from "@/lib/operatore-client";
import { prefetchApi, svuotaCache } from "@/lib/api-cache";
import { navVisibile, voceAttiva, type NavItem } from "@/lib/nav";
import { HelpCircleIcon, LayersIcon, LogOutIcon } from "@/components/icons";

// Sotto i 768px la sidebar (hidden md:flex) non esiste: senza questa barra la
// navigazione era solo a link sparsi. Massimo 4 voci principali + "Altro" per
// il resto, cosi' ogni voce resta toccabile col pollice.
const N_PRINCIPALI = 4;

export default function MobileTabBar() {
  const pathname = usePathname();
  const { operatore } = useOperatore();
  const isAdmin = operatore?.ruolo === "admin";
  const [altroAperto, setAltroAperto] = useState(false);

  const tutti = navVisibile(isAdmin);
  const primari = tutti.slice(0, N_PRINCIPALI);
  const extra = tutti.slice(N_PRINCIPALI);
  const attiva = voceAttiva(tutti, pathname);
  const extraAttivo = extra.some((i) => i.href === attiva);

  // La pagina di login non ha una navigazione da mostrare.
  if (pathname === "/login") return null;

  const riscalda = (item: NavItem) => {
    for (const url of item.calda ?? []) prefetchApi(url);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      resetOperatore();
      svuotaCache();
      window.location.href = "/login";
    } catch {
      // Ignore
    }
  };

  const voce = (item: NavItem) => {
    const active = item.href === attiva;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => riscalda(item)}
        onClick={() => setAltroAperto(false)}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-control py-1.5 transition-colors duration-200 ${
          active ? "bg-inchiostro text-lime" : "text-caldo-testo hover:text-inchiostro"
        }`}
      >
        <item.icon className="h-5 w-5" />
        <span className="max-w-full truncate px-1 text-[10px] font-semibold">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {altroAperto && (
        <div className="fixed inset-0 z-40 bg-inchiostro/40 md:hidden" onClick={() => setAltroAperto(false)}>
          <div
            role="menu"
            aria-label="Altre voci"
            className="absolute inset-x-3 bottom-[4.5rem] rounded-card border border-crema-contorno bg-white p-2 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            {extra.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAltroAperto(false)}
                className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
              >
                <item.icon className="h-4 w-4 text-caldo-testo" />
                {item.label}
              </Link>
            ))}
            <Link
              href="/knowledge"
              onClick={() => setAltroAperto(false)}
              className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-inchiostro transition-colors duration-200 hover:bg-crema-scuro"
            >
              <HelpCircleIcon className="h-4 w-4 text-caldo-testo" />
              Help Center
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium text-pericolo transition-colors duration-200 hover:bg-pericolo/10"
            >
              <LogOutIcon className="h-4 w-4" />
              Esci
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Navigazione mobile"
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch gap-1 border-t border-crema-contorno bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-soft md:hidden"
      >
        {primari.map(voce)}
        <button
          type="button"
          onClick={() => setAltroAperto((v) => !v)}
          aria-expanded={altroAperto}
          aria-haspopup="menu"
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-control py-1.5 transition-colors duration-200 ${
            extraAttivo || altroAperto
              ? "bg-inchiostro text-lime"
              : "text-caldo-testo hover:text-inchiostro"
          }`}
        >
          <LayersIcon className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Altro</span>
        </button>
      </nav>
    </>
  );
}
