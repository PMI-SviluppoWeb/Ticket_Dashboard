export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-crema-contorno border-t-inchiostro" />
        <p className="text-sm text-caldo-testo">Caricamento…</p>
      </div>
    </div>
  );
}
