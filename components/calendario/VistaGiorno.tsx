"use client";

import { useMemo } from "react";
import VistaSettimanaOraria, {
  type VistaSettimanaOrariaProps,
} from "./VistaSettimanaOraria";

type VistaGiornoProps = Omit<VistaSettimanaOrariaProps, "giorni"> & {
  giorno: Date;
};

// La vista Giorno è la stessa griglia con una sola colonna: condividere il
// componente garantisce che ore, linea dell'ora, drag e popover si
// comportino allo stesso modo nelle due viste.
export default function VistaGiorno({ giorno, ...rest }: VistaGiornoProps) {
  const giorni = useMemo(() => [giorno], [giorno]);
  return <VistaSettimanaOraria giorni={giorni} {...rest} />;
}
