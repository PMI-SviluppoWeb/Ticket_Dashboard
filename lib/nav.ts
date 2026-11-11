import type { ComponentType } from "react";
import {
  BarChartIcon,
  BookIcon,
  CalendarIcon,
  ClockIcon,
  FolderIcon,
  GridIcon,
  MailIcon,
  UserCircleIcon,
  UserPlusIcon,
} from "@/components/icons";

// Voci di navigazione in UN solo posto: la sidebar (desktop) e la bottom tab
// bar (mobile) leggono da qui, cosi' non puo' capitare che un link esista su
// un breakpoint e non sull'altro.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
  adminOnly?: boolean;
  operatoreOnly?: boolean;
  calda?: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: GridIcon, exact: true, calda: ["/api/stats"] },
  { href: "/calendario", label: "Calendario", icon: CalendarIcon, exact: false, calda: [] },
  { href: "/progetti", label: "Progetti", icon: FolderIcon, exact: false, calda: ["/api/clienti"] },
  {
    href: "/operatore",
    label: "I Miei Ticket",
    icon: UserCircleIcon,
    exact: false,
    operatoreOnly: true,
    calda: ["/api/stats"],
  },
  { href: "/admin", label: "Operatori", icon: UserPlusIcon, exact: false, adminOnly: true, calda: [] },
  {
    href: "/admin/dashboard",
    label: "Dashboard Admin",
    icon: BarChartIcon,
    exact: false,
    adminOnly: true,
    calda: ["/api/operatori/stats"],
  },
  { href: "/report", label: "Report Ore", icon: ClockIcon, exact: false, adminOnly: true, calda: [] },
  { href: "/inbox", label: "Inbox Email", icon: MailIcon, exact: false, adminOnly: true, calda: [] },
  {
    href: "/admin/email",
    label: "Caselle Email",
    icon: MailIcon,
    exact: false,
    adminOnly: true,
    calda: ["/api/caselle"],
  },
  { href: "/knowledge", label: "Knowledge Base", icon: BookIcon, exact: false, calda: [] },
];

export function navVisibile(isAdmin: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.operatoreOnly && isAdmin) return false;
    return true;
  });
}

// Voce attiva = percorso PIU' SPECIFICO: "/admin/dashboard" inizia anche con
// "/admin", e il confronto ingenuo accenderebbe due voci insieme.
export function voceAttiva(items: NavItem[], pathname: string): string | undefined {
  return items
    .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
