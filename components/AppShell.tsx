"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileTabBar from "@/components/MobileTabBar";
import { TempiProvider } from "@/components/TempiContext";
import { CopilotProvider } from "@/components/copilot/CopilotContext";
import CopilotDrawer from "@/components/copilot/CopilotDrawer";
import CopilotTrigger from "@/components/copilot/CopilotTrigger";

// Le rotte pubbliche non devono mostrare la chrome dell'app (sidebar, Copilot,
// tab bar): il cliente che compila il questionario non ha una sessione.
const PUBBLICHE = ["/questionario"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const pubblica = PUBBLICHE.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (pubblica) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-crema text-inchiostro">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full print:block print:h-auto">
      <Sidebar />
      {/* Copilot: stato globale dell'APPLICAZIONE (agente scelto, thread,
          contesto) come il cronometro. Vive sopra le rotte, quindi la
          conversazione continua mentre si naviga. */}
      <CopilotProvider>
        {/* Il cronometro e' uno stato dell'APPLICAZIONE, non della pagina:
            sta sopra le rotte cosi' il conteggio continua a scorrere mentre
            si naviga e l'header di ogni pagina lo legge dallo stesso posto. */}
        <TempiProvider>
          {/* pb solo sotto i 768px: la bottom tab bar e' fixed e coprirebbe
              l'ultima riga del contenuto. */}
          <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">{children}</div>
        </TempiProvider>
        <CopilotTrigger />
        <CopilotDrawer />
        <MobileTabBar />
      </CopilotProvider>
    </div>
  );
}
