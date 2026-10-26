import type { ReactNode } from "react";

interface PageHeaderProps {
  // Etichetta sopra il titolo. E' OPZIONALE e va usata solo dove nomina un
  // raggruppamento reale: un'etichetta maiuscola sopra ogni titolo e' uno dei
  // tell piu' riconoscibili del design generato, quindi la maggior parte delle
  // pagine non la passa.
  eyebrow?: string;
  titolo: string;
  // Conteggio fra parentesi accanto al titolo, stessa dimensione e peso normale.
  // Porta il totale della collezione, che prima stava solo in fondo alla pagina
  // dentro la paginazione.
  conteggio?: number;
  sottotitolo?: string;
  // Slot destro: bottoni di pagina. Sotto il breakpoint vanno a capo sotto il
  // titolo invece di comprimerlo.
  azioni?: ReactNode;
}

// Testata di pagina — una sola convenzione per tutta l'app.
//
// Prima esistevano QUATTRO standard diversi per l'h1 (text-xl su 4 pagine,
// text-2xl su 2, text-2xl tracking-tight sul login, text-3xl sm:text-4xl su
// Progetti), quindi la gerarchia non era confrontabile fra pagine. Qui la
// dimensione e' una sola e il contrasto di scala si ottiene con il PESO:
// `font-extrabold` e' l'unico dell'app, il che rende il titolo la cosa piu'
// pesante della pagina senza bisogno di cambiare famiglia di caratteri.
export default function PageHeader({
  eyebrow,
  titolo,
  conteggio,
  sottotitolo,
  azioni,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-caldo-testo">
            {eyebrow}
          </p>
        )}

        {/* `items-baseline` allinea il conteggio alla base del titolo: con
            `items-center` il numero piccolo galleggerebbe a meta' altezza. */}
        <h1 className="flex flex-wrap items-baseline gap-x-2 font-display text-4xl font-semibold tracking-tight text-inchiostro sm:text-5xl">
          {titolo}
          {conteggio !== undefined && (
            // Un gradino sotto il titolo, non due: a `text-3xl` un conteggio
            // della stessa dimensione sembrerebbe parte del nome.
            <span className="tabular self-start rounded-full bg-lime px-2.5 py-0.5 font-sans text-sm font-semibold text-lime-testo">
              {conteggio}
            </span>
          )}
        </h1>

        {sottotitolo && (
          // Il limite di misura tiene la riga sotto le ~80 battute: su schermo
          // largo un sottotitolo libero diventerebbe una riga lunghissima.
          <p className="mt-2 max-w-2xl text-sm text-caldo-testo">{sottotitolo}</p>
        )}
      </div>

      {azioni && <div className="flex shrink-0 flex-wrap items-center gap-2">{azioni}</div>}
    </div>
  );
}
