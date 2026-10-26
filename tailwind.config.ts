import type { Config } from "tailwindcss";

// ===========================================================================
// Design system "workspace" (ex "warm editorial").
//
// Ottobre 2026: la reference e' public/projects.png. Canvas grigio freddo,
// card bianche a raggio ampio, inchiostro quasi nero per le superfici di
// contrasto e UN accento lime per cio' che e' attivo o richiede attenzione.
// I nomi dei token sono rimasti quelli storici (crema, peach...) perche' sono
// usati in centinaia di classi: e' cambiato il valore, non il ruolo.
//
// Un solo sistema per tutta l'app. Prima ne esistevano due in parallelo:
// la palette calda era confinata alla sezione Progetti, mentre le altre 18
// schermate usavano slate/blu. Il confine si vedeva sulla cornice, che non
// cambia mai: sidebar scura e blu attorno a contenuti crema.
//
// Direzione: Minimal Swiss applicato a un fondo caldo. Griglia rigorosa,
// gerarchia tipografica netta, Inter con variazioni di peso (nessun secondo
// font), colore riservato al SIGNIFICATO — stato, priorita', allarme — mai
// come decorazione.
//
// I token sono nominati per RUOLO e non per aspetto: `stato.urgenza`, non
// `rosso`. Cosi' cambiare la tinta non obbliga a rinominare le classi.
//
// Ogni contrasto di questa palette e' MISURATO, non stimato a occhio. Le
// soglie: 4.5:1 per il testo, 3:1 per gli elementi grafici, con i valori
// riportati accanto a ciascun token.
// ===========================================================================

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Necessario: le classi che RUOTANO sulle card (bg-peach, bg-peach-tenue,
    // bg-salvia, ring-crema-contorno, le tracce della barra) compaiono solo in
    // lib/progetto-card.ts. Senza questo glob Tailwind non le vede e non le
    // genera: le card resterebbero senza sfondo.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // -------------------------------------------------------------------
        // Superfici
        // -------------------------------------------------------------------
        // Accento. Solo come SUPERFICIE o riempimento, mai come testo su
        // chiaro (su bianco misura 1.3:1). Su inchiostro: 13.9:1.
        lime: {
          DEFAULT: "#C8F25A",
          scuro: "#B4E03C",
          testo: "#2B3A00", // testo su lime: 10.4:1
        },
        crema: {
          DEFAULT: "#ECEDF0", // fondo applicazione. Inchiostro su crema: 14.54:1
          scuro: "#E3E5E9", // superficie secondaria / hover di riga (1.15:1 dal bianco)
          bordo: "#E8E9EC", // divisori INTERNI alle card (1.20:1 sul bianco)
          // Contorno delle card chiare. Serve perche' le superfici del mockup
          // sono quasi indistinguibili dal fondo: misurato, il bianco sta a
          // 1.081:1 sulla crema e #FDF3E1 addirittura a 1.018:1. Senza un
          // contorno quelle card sarebbero invisibili. #EDEAE0 separa solo
          // 1.114:1, questo arriva a 1.233:1.
          contorno: "#DADCE1",
        },
        inchiostro: {
          DEFAULT: "#151515", // testo primario, bottoni primari, card di contrasto
          profondo: "#050505",
        },

        // -------------------------------------------------------------------
        // Tinte delle card Progetti (rotazione a 4)
        // -------------------------------------------------------------------
        peach: {
          DEFAULT: "#C8F25A", // tinta card A: lime d'accento (nome storico del token)
          tenue: "#F6F8EE", // tinta card B
        },
        salvia: "#E2E6EB", // tinta card C

        // Testo attenuato su fondo caldo.
        // NON e' il #767571 del mockup: quello misura 4,27:1 su crema e non
        // passa WCAG AA per il testo sotto i 18px. Questo misura 6,37:1.
        // E' anche l'unico grigio utilizzabile: i toni piu' chiari provati
        // (#8A8780 = 3,32:1, #7A7873 = 4,08:1) NON passano AA sul testo
        // piccolo, quindi per il corpo del testo non esiste un'alternativa
        // piu' tenue di questa.
        caldo: {
          testo: "#575A61",
        },

        // -------------------------------------------------------------------
        // Stati — il colore qui e' informazione, non decorazione.
        //
        // Sei famiglie, ognuna con fondo / testo / bordo. La terna e' tarata
        // per funzionare su ENTRAMBE le superfici d'uso (crema e bianco):
        // verificato, i rapporti sono identici perche' i due fondi distano
        // solo 1,08:1 fra loro.
        //
        // Il bordo non e' opzionale: questi fondi stanno a 1,32-1,43:1 dal
        // fondo crema, quindi senza contorno il chip non si stacca dalla
        // pagina. Col bordo supera la soglia di percezione.
        // -------------------------------------------------------------------
        stato: {
          // priorita' ALTA, progetto ANNULLATO, errore di sync
          urgenza: { bg: "#F9DEDE", testo: "#8E2B22", bordo: "#EFC7C2" }, // 6.56:1
          // priorita' MEDIA, progetto IN_PAUSA, sync PENDENTE
          attesa: { bg: "#FDE8C4", testo: "#7A4A0B", bordo: "#F0D5A4" }, // 6.23:1
          // priorita' BASSA, RISOLTO, COMPLETATO, sync riuscito
          ok: { bg: "#DCEEE2", testo: "#1D5C39", bordo: "#BBDCC6" }, // 6.57:1
          // ticket NUOVO, progetto IN_CORSO
          info: { bg: "#DDE7EE", testo: "#1C4A66", bordo: "#C3D3DF" }, // 7.54:1
          // ticket IN_CORSO (lavorazione attiva)
          malva: { bg: "#EDE4F0", testo: "#5B3A6E", bordo: "#DCCCE3" }, // 7.45:1
          // CHIUSO, DA_FARE, "non assegnato": nessuna urgenza da segnalare
          neutro: { bg: "#E8E9EC", testo: "#575A61", bordo: "#DADCE1" }, // 5.72:1
        },

        // Riempimento della barra di avanzamento sulle card Progetti.
        // E' un colore da ELEMENTO GRAFICO, non da testo: sta sopra la traccia
        // (inchiostro al 10% composto sulla tinta della card) e deve battere 3:1.
        // Il token esiste per non lasciare l'unico hex crudo dell'app dentro
        // lib/progetto-card.ts, che e' il file che gli altri prendono a modello.
        // Valori invariati rispetto a prima: nessun pixel cambia.
        avanzamento: {
          DEFAULT: "#047857", // ex emerald-700. Sulla traccia: 4.52/3.78/4.11/3.77 sulle 4 tinte
          scuro: "#C8F25A", // ex emerald-400, sulla card in inchiostro
        },

        // Rosso per le azioni distruttive (elimina, esci). Piu' scuro di
        // stato.urgenza perche' qui deve reggere come TESTO su bianco:
        // 7.45:1. Non usare per gli stati, che hanno la loro famiglia.
        pericolo: {
          DEFAULT: "#A32017",
          scuro: "#7F1D14",
        },
      },

      fontFamily: {
        // Outfit per titoli e cifre grandi, Inter resta per il corpo.
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgb(16 18 24 / 0.04), 0 12px 32px -16px rgb(16 18 24 / 0.18)",
      },
      borderRadius: {
        // Card grandi della sezione Progetti (raggio molto generoso).
        card: "2rem",
        // Pannelli e riquadri della dashboard: stesso linguaggio, raggio
        // ridotto, altrimenti una griglia di tile diventa una fila di pillole.
        panel: "1.75rem",
        // Bottoni, input, select. Sotto il pannello, sopra il nulla.
        control: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
