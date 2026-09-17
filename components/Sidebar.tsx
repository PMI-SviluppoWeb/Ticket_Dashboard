"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookIcon,
  GridIcon,
  HeadsetIcon,
  HelpCircleIcon,
  UserIcon,
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

  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-900/40">
          <HeadsetIcon className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">Support Desk</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Gestione ticket
          </p>
        </div>
      </div>

      {/* Navigazione principale */}
      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
        {visibleNav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-950/50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Utente corrente in basso */}
      <div className="flex flex-col gap-1 px-3 pb-5 border-t border-slate-800 mt-auto">
        {operator && (
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{operator.nome}</p>
              <p className="text-[11px] text-slate-400 truncate">{operator.email}</p>
            </div>
          </div>
        )}
        <Link
          href="/knowledge"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <HelpCircleIcon className="h-4 w-4" />
          Help Center
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-red-400 text-left w-full"
        >
          <LogOutIcon className="h-4 w-4" />
          Esci
        </button>
        <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-600">
          v1.0 · Aggiornamento live
        </p>
      </div>
    </aside>
  );
}
