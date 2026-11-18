"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-inchiostro">Qualcosa è andato storto</h2>
        <p className="mt-2 text-sm text-caldo-testo">
          {error.message || "Errore imprevisto. Riprova."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
          >
            Riprova
          </button>
          <Link
            href="/"
            className="rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            Torna alla dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
