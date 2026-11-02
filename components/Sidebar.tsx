"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resetOperatore, useOperatore } from "@/lib/operatore-client";
import { prefetchApi, svuotaCache } from "@/lib/api-cache";
import {
  HeadsetIcon,
  HelpCircleIcon,
  LogOutIcon,
} from "@/components/icons";
import { navVisibile, voceAttiva } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();
  // L'operatore arriva dalla cache condivisa (lib/operatore-client): la pagina
  // che sta accanto alla sidebar chiede lo stesso dato, e cosi' la richiesta e
  // la query al database sono UNA per caricamento invece di due.
  const { operatore } = useOperatore();
  const operator = operatore ? { nome: operatore.nome, email: operatore.email, ruolo: operatore.ruolo } : null;

  const isAdmin = operator?.ruolo === "admin";
  const NAV_ITEMS = navVisibile(isAdmin);

  // Passando il mouse (o col focus da tastiera) su una voce, il dato che quella
  // pagina chiede per prima viene richiesto adesso: quando il clic arriva, il
  // viaggio verso il DB e' gia' in corso o finito. Non si precaricano le pagine
  // pesanti (elenchi, calendario): il costo di un prefetch sbagliato non deve
  // superare il beneficio.
  const riscalda = (item: (typeof NAV_ITEMS)[number]) => {
    for (const url of item.calda ?? []) prefetchApi(url);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // La cache dell'operatore appartiene alla sessione: senza reset, il
      // prossimo accesso nella stessa scheda mostrerebbe l'utente precedente.
      resetOperatore();
      // Stesso motivo per la cache delle risposte: sono dati di QUESTO utente.
      svuotaCache();
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
        {NAV_ITEMS.map((item) => {
          const active = item.href === voceAttiva(NAV_ITEMS, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => riscalda(item)}
              onFocus={() => riscalda(item)}
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
