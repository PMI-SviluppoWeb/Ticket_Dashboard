import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card border border-crema-contorno bg-white p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">404</p>
        <h2 className="mt-1 text-lg font-semibold text-inchiostro">Pagina non trovata</h2>
        <p className="mt-2 text-sm text-caldo-testo">
          Il contenuto che cerchi non esiste o è stato spostato.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo"
        >
          Torna alla dashboard
        </Link>
      </div>
    </div>
  );
}
