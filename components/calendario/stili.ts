// Classi condivise dagli editor del calendario. Sono le stesse che la pagina
// usava inline: centralizzarle evita che popover e modal divergano.
export const INPUT_CLASS =
  "w-full rounded-control border border-crema-contorno bg-white py-1.5 px-3 text-sm text-inchiostro placeholder:text-caldo-testo focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro";

export const LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-wider text-caldo-testo";

export const BTN_PRIMARIO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-60";

export const BTN_SECONDARIO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border border-crema-contorno bg-white px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50";
