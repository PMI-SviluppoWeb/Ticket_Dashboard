"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookIcon,
  CalendarIcon,
  FolderIcon,
  GridIcon,
  HeadsetIcon,
  HelpCircleIcon,
  LogOutIcon,
  UserCircleIcon,
  UserPlusIcon,
  BarChartIcon,
} from "@/components/icons";

export default function Sidebar() {
  const pathname = usePathname();
  const [operator, setOperator] = useState<{ nome: string; email: string; ruolo: string } | null>(null);

  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: GridIcon, exact: true },
    { href: "/calendario", label: "Calendario", icon: CalendarIcon, exact: false },
    { href: "/progetti", label: "Progetti", icon: FolderIcon, exact: false },
    { href: "/operatore", label: "I Miei Ticket", icon: UserCircleIcon, exact: false, operatoreOnly: true },
    { href: "/admin", label: "Operatori", icon: UserPlusIcon, exact: false, adminOnly: true },
    { href: "/admin/dashboard", label: "Dashboard Admin", icon: BarChartIcon, exact: false, adminOnly: true },
    { href: "/knowledge", label: "Knowledge Base", icon: BookIcon, exact: false },
  ];

  const isAdmin = operator?.ruolo === "admin";
  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.operatoreOnly && isAdmin) return false;
    return true;
  });

  useEffect(() => {
    const loadOperator = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setOperator(data.operator);
        }
      } catch {
        // Ignore
      }
    };
    loadOperator();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      // Ignore
    }
  };

  // Iniziale per l'avatar. Serve un fallback esplicito: `nome` puo' arrivare
  // vuoto e `[0]` su stringa vuota e' undefined, che stamperebbe "undefined"
  // dentro il cerchio.
  const iniziale = (operator?.nome?.trim()?.[0] ?? "?").toUpperCase();

  // Etichetta flottante a destra del cerchio. Resta nel DOM anche quando e'
  // invisibile, quindi gli screen reader leggono il nome della voce.
  const tooltip =
    "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-full bg-inchiostro px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-soft transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100";
  const cerchio =
    "group relative grid h-11 w-11 place-items-center rounded-full transition-colors duration-200";

  // Rail di icone (reference: public/projects.png). Al posto della colonna da
  // 240px: lo spazio torna al contenuto e la navigazione diventa un oggetto
  // unico, una pillola bianca sul canvas, invece di un pannello.
  return (
    <aside className="hidden w-[84px] shrink-0 flex-col items-center gap-6 py-4 md:flex">
      <Link href="/" className={`${cerchio} bg-inchiostro text-lime`}>
        <HeadsetIcon className="h-5 w-5" />
        <span className={tooltip}>Support Desk</span>
      </Link>

      <nav
        className="flex flex-col gap-1.5 rounded-full bg-white p-1.5 shadow-soft ring-1 ring-crema-contorno"
        aria-label="Navigazione principale"
      >
        {visibleNav.map((item) => {
          // La voce attiva e' quella con il percorso PIU' SPECIFICO:
          // "/admin/dashboard" inizia anche con "/admin" e il confronto
          // ingenuo accenderebbe due voci insieme.
          const corrisponde = (i: (typeof NAV_ITEMS)[number]) =>
            i.exact
              ? pathname === i.href
              : pathname === i.href || pathname.startsWith(`${i.href}/`);
          const attiva = visibleNav
            .filter(corrisponde)
            .sort((a, b) => b.href.length - a.href.length)[0]?.href;
          const active = item.href === attiva;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${cerchio} ${
                active
                  ? "bg-inchiostro text-lime"
                  : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className={tooltip}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <Link
          href="/knowledge"
          className={`${cerchio} text-caldo-testo hover:bg-white hover:text-inchiostro`}
        >
          <HelpCircleIcon className="h-[18px] w-[18px]" />
          <span className={tooltip}>Help Center</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className={`${cerchio} cursor-pointer text-caldo-testo hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo`}
        >
          <LogOutIcon className="h-[18px] w-[18px]" />
          <span className={tooltip}>Esci</span>
        </button>
        {operator && (
          <span className={`${cerchio} mt-2 bg-lime font-display text-sm font-semibold text-lime-testo ring-4 ring-white`}>
            {iniziale}
            <span className={tooltip}>
              {operator.nome} · {operator.email}
            </span>
          </span>
        )}
      </div>
    </aside>
  );
}
