"use client";

import { useEffect } from "react";
import { SparklesIcon } from "@/components/icons";
import { useOperatore } from "@/lib/operatore-client";
import { useCopilot } from "./CopilotContext";

// Pulsante flottante + scorciatoia da tastiera. Vive nel layout, quindi e'
// presente su ogni pagina dell'applicazione (tranne prima del login).
export default function CopilotTrigger() {
  const { operatore } = useOperatore();
  const { aperto, toggle } = useCopilot();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (!operatore || aperto) return null;

  return (
    <button
      type="button"
      onClick={() => toggle()}
      title="Apri il Copilot (Ctrl/⌘ K)"
      aria-label="Apri il Copilot"
      className="fixed bottom-20 right-4 z-40 grid h-12 w-12 cursor-pointer place-items-center rounded-full bg-inchiostro text-lime shadow-soft ring-1 ring-black/10 transition-transform duration-200 hover:scale-105 print:hidden md:bottom-6 md:right-6"
    >
      <SparklesIcon className="h-5 w-5" />
    </button>
  );
}
