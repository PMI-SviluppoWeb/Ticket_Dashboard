import type { ComponentType } from "react";
import {
  BarChartIcon,
  BookIcon,
  CalendarIcon,
  EyeIcon,
  FolderIcon,
  GridIcon,
  MailIcon,
  SettingsIcon,
  SparklesIcon,
} from "@/components/icons";

// ===========================================================================
// Navigazione ad AREE, non a singole pagine.
//
// Prima la rail aveva una voce per ogni schermata (11 da admin): due icone
// Mail identiche, due "dashboard", due icone tempo e un overflow verticale su
// un laptop da 768px. Le pagine che appartengono allo stesso dominio ora
// stanno sotto un'unica area e si raggiungono con i tab (components/AreaTabs).
//
// Gli URL restano quelli attuali: nessun redirect, nessun link profondo rotto.
// L'area si riconosce dai suoi FIGLI, non dal prefisso del percorso: cosi'
// `/admin/email` accende Email e non Admin, e `/admin/dashboard` accende
// Report e non Admin.
// ===========================================================================

export type NavChild = {
  href: string;
  label: string;
  // true = il figlio corrisponde solo al percorso esatto. Serve per "/" e
  // per "/admin": senza, ogni sottopagina accenderebbe anche il padre.
  exact?: boolean;
};

export type NavGruppo = "lavoro" | "admin";

export type NavArea = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  // Pagina di atterraggio dell'area (primo figlio, ma esplicita per leggibilita').
  href: string;
  gruppo: NavGruppo;
  children: NavChild[];
  adminOnly?: boolean;
  // URL da riscaldare al passaggio del mouse/focus sulla voce.
  calda?: string[];
};

export const AREE: NavArea[] = [
  {
    // Vista "oggi" del capo: solo admin, prima voce della rail. Per gli
    // operatori l'area non esiste (areeVisibili filtra adminOnly).
    id: "direzione",
    label: "Direzione",
    icon: EyeIcon,
    href: "/direzione",
    gruppo: "lavoro",
    adminOnly: true,
    children: [{ href: "/direzione", label: "Direzione" }],
    calda: ["/api/direzione"],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: GridIcon,
    href: "/",
    gruppo: "lavoro",
    children: [{ href: "/", label: "Dashboard", exact: true }],
  },
  {
    id: "calendario",
    label: "Calendario",
    icon: CalendarIcon,
    href: "/calendario",
    gruppo: "lavoro",
    children: [{ href: "/calendario", label: "Calendario" }],
  },
  {
    id: "progetti",
    label: "Progetti",
    icon: FolderIcon,
    href: "/progetti",
    gruppo: "lavoro",
    children: [{ href: "/progetti", label: "Progetti" }],
    calda: ["/api/clienti"],
  },
  {
    // Rapportini di chiusura: operativi, quindi visibili a tutti gli operatori.
    id: "rapportini",
    label: "Rapportini",
    icon: BookIcon,
    href: "/rapportini",
    gruppo: "lavoro",
    children: [{ href: "/rapportini", label: "Rapportini" }],
  },
  {
    // Area AI: disponibile a TUTTI gli operatori (non adminOnly). La
    // configurazione degli agenti di libreria resta in /admin/agenti.
    id: "ai",
    label: "AI",
    icon: SparklesIcon,
    href: "/agenti",
    gruppo: "lavoro",
    children: [
      { href: "/agenti", label: "I miei agenti", exact: true },
      { href: "/agenti/attivita", label: "Attività" },
    ],
    calda: ["/api/agenti"],
  },
  {
    id: "email",
    label: "Email",
    icon: MailIcon,
    href: "/inbox",
    gruppo: "admin",
    adminOnly: true,
    children: [
      { href: "/inbox", label: "Posta in arrivo", exact: true },
      { href: "/admin/email", label: "Caselle" },
    ],
    calda: ["/api/inbox?stato=da_verificare&limit=20"],
  },
  {
    id: "report",
    label: "Report",
    icon: BarChartIcon,
    href: "/report",
    gruppo: "admin",
    adminOnly: true,
    children: [
      { href: "/report", label: "Ore" },
      { href: "/admin/dashboard", label: "Cruscotto" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: SettingsIcon,
    href: "/admin",
    gruppo: "admin",
    adminOnly: true,
    children: [
      { href: "/admin", label: "Operatori", exact: true },
      { href: "/admin/sla", label: "SLA" },
      { href: "/admin/chiavi-api", label: "Chiavi API" },
      { href: "/admin/agenti", label: "Agenti AI" },
    ],
    calda: ["/api/operatori?all=true"],
  },
];

export function areeVisibili(isAdmin: boolean): NavArea[] {
  return AREE.filter((area) => !area.adminOnly || isAdmin);
}

function corrisponde(child: NavChild, pathname: string): boolean {
  return child.exact
    ? pathname === child.href
    : pathname === child.href || pathname.startsWith(`${child.href}/`);
}

// Area accesa: quella che contiene il percorso corrente tra i suoi figli.
export function areaAttiva(aree: NavArea[], pathname: string): NavArea | undefined {
  return aree.find((area) => area.children.some((child) => corrisponde(child, pathname)));
}

// Figlio attivo (per i tab), scegliendo il percorso piu' specifico: se in
// futuro un figlio fosse prefisso di un altro, vince quello piu' lungo.
export function figlioAttivo(area: NavArea, pathname: string): NavChild | undefined {
  return area.children
    .filter((child) => corrisponde(child, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function getArea(id: string): NavArea | undefined {
  return AREE.find((area) => area.id === id);
}
