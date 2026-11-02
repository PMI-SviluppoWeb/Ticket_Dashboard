export interface Ancora {
  x: number;
  y: number;
}

export interface Dimensioni {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Posizione {
  left: number;
  top: number;
  sopra: boolean;
}

// Posiziona il popover accanto al click/evento, poi lo riporta dentro il
// viewport. Apre a destra e sotto; se non c'e' spazio fa flip a sinistra e
// sopra. I due assi sono indipendenti, cosi' un popover alto ma stretto non
// viene spostato inutilmente.
export function posizionaPopover(
  ancora: Ancora,
  dimensioni: Dimensioni,
  viewport: Viewport,
  margine = 8,
  distanza = 10
): Posizione {
  let left = ancora.x + distanza;
  if (left + dimensioni.width > viewport.width - margine) {
    left = ancora.x - dimensioni.width - distanza;
  }
  left = Math.min(
    Math.max(margine, left),
    Math.max(margine, viewport.width - dimensioni.width - margine)
  );

  let sopra = false;
  let top = ancora.y + distanza;
  if (top + dimensioni.height > viewport.height - margine) {
    top = ancora.y - dimensioni.height - distanza;
    sopra = true;
  }
  top = Math.min(
    Math.max(margine, top),
    Math.max(margine, viewport.height - dimensioni.height - margine)
  );

  return { left, top, sopra };
}
