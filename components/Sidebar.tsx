"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookIcon,
  GridIcon,
  HeadsetIcon,
  HelpCircleIcon,
  TicketIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: GridIcon, exact: true },
  { href: "/knowledge", label: "Knowledge Base", icon: BookIcon, exact: false },
];

export default function Sidebar() {
  const pathname = usePathname();

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
        {NAV_ITEMS.map((item) => {
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
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            pathname.startsWith("/tickets")
              ? "bg-blue-600 text-white shadow-md shadow-blue-950/50"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <TicketIcon className="h-4 w-4" />
          Ticket
        </Link>
      </nav>

      {/* Link secondari in basso */}
      <div className="flex flex-col gap-1 px-3 pb-5">
        <Link
          href="/knowledge"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <HelpCircleIcon className="h-4 w-4" />
          Help Center
        </Link>
        <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-600">
          v1.0 · Aggiornamento live
        </p>
      </div>
    </aside>
  );
}
