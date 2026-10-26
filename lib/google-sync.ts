import "server-only";
import { db } from "./db";
import { origineEvento } from "./calendario";
import { leggiImpostazioni, scriviImpostazioni } from "./impostazioni";
import {
  configurazioneCompleta,
  configDaImpostazioni,
  costruisciEvento,
  idEventoDaAttivita,
  MESSAGGI_TEMPO,
  risolviCalendario,
  sogliaFinestra,
  type CodiceErroreTempo,
} from "./google-evento";
import {
  credenzialiPresenti,
  deleteEvent,
  ErroreGoogle,
  insertEvent,
  updateEvent,
} from "./google-calendar";
import type {
  AttivitaGoogleRow,
  AttivitaRow,
  ConfigGoogle,
  ConteggiGoogle,
  GoogleStato,
} from "./types";

// ===========================================================================
// Orchestrazione della sincronizzazione App -> Google.
//
// Principio: queste funzioni NON LANCIANO MAI verso il chiamante. Google non
// e' la fonte di verita' e non deve mai far fallire il salvataggio di
// un'attivita': un errore diventa una riga in stato ERRORE con `tentativi`,
// che la UI mostra e che "Sincronizza ora" riprova.
// ===========================================================================

// Oltre questa soglia la cancellazione di un progetto non chiama Google
// inline: marca i tombstone e li lascia smaltire alla riconciliazione.
export const SOGLIA_SYNC_INLINE = 25;

// Budget di un tentativo dentro una richiesta utente. La decisione "sincronizza
// subito" e quella "non far fallire l'operazione" tirano in direzioni opposte:
// 3 tentativi con backoff sarebbero fino a 12s di attesa su un salvataggio.
// Quindi un solo tentativo breve inline, e i retry persistiti sulla riga.
const BUDGET_INLINE_MS = 4000;

// Pausa tra le chiamate nella riconciliazione: il service account e' un unico
// "utente" e il limite e' 600 richieste/minuto.
const PAUSA_RICONCILIAZIONE_MS = 120;

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------

const CHIAVI_CONFIG = [
  "google_sync_abilitato",
  "google_modalita_mappatura",
  "google_calendario_default",
  "google_mappatura_origini",
  "google_timezone",
  "google_finestra_giorni",
];

export async function getConfigGoogle(): Promise<ConfigGoogle> {
  const imp = await leggiImpostazioni(CHIAVI_CONFIG);
  return configDaImpostazioni(imp);
}

export async function salvaConfigGoogle(patch: Partial<ConfigGoogle>): Promise<ConfigGoogle> {
  const valori: Record<string, string> = {};

  if (patch.abilitato !== undefined) {
    valori.google_sync_abilitato = patch.abilitato ? "true" : "false";
  }
  if (patch.modalita !== undefined) {
    valori.google_modalita_mappatura = patch.modalita;
  }
  if (patch.calendario_default !== undefined) {
    valori.google_calendario_default = patch.calendario_default;
  }
  if (patch.mappatura !== undefined) {
    valori.google_mappatura_origini = JSON.stringify(patch.mappatura);
  }
  if (patch.timezone !== undefined) {
    valori.google_timezone = patch.timezone;
  }
  if (patch.finestra_giorni !== undefined) {
    valori.google_finestra_giorni = String(patch.finestra_giorni);
  }

  await scriviImpostazioni(valori);
  return getConfigGoogle();
}

// ---------------------------------------------------------------------------
// Stato per attivita'
// ---------------------------------------------------------------------------

const ROW_FIELDS_GOOGLE = `
  attivita_id, calendar_id, event_id, stato, tentativi, ultimo_errore,
  data_sync, data_creazione, data_aggiornamento
`;

export async function getAttivitaGoogle(id: string): Promise<AttivitaGoogleRow | null> {
  const row = await db
    .prepare(`SELECT ${ROW_FIELDS_GOOGLE} FROM attivita_google WHERE attivita_id = ?`)
    .get(id);
  return (row as unknown as AttivitaGoogleRow | undefined) ?? null;
}

async function scriviStato(
  attivitaId: string,
  calendarId: string,
  eventId: string,
  stato: GoogleStato,
  opts?: { errore?: string | null; azzeraTentativi?: boolean; tentativi?: number }
): Promise<void> {
  const ts = new Date().toISOString();
  const esiste = await getAttivitaGoogle(attivitaId);
  const tentativi = opts?.tentativi ?? (opts?.azzeraTentativi ? 0 : (esiste?.tentativi ?? 0));

  await db
    .prepare(
      `INSERT INTO attivita_google (
         attivita_id, calendar_id, event_id, stato, tentativi, ultimo_errore,
         data_sync, data_creazione, data_aggiornamento
       ) VALUES (
         @attivita_id, @calendar_id, @event_id, @stato, @tentativi, @ultimo_errore,
         @data_sync, @data_creazione, @data_aggiornamento
       )
       ON CONFLICT (attivita_id) DO UPDATE SET
         calendar_id = @calendar_id,
         event_id = @event_id,
         stato = @stato,
         tentativi = @tentativi,
         ultimo_errore = @ultimo_errore,
         data_sync = @data_sync,
         data_aggiornamento = @data_aggiornamento`
    )
    .run({
      attivita_id: attivitaId,
      calendar_id: calendarId,
      event_id: eventId,
      stato,
      tentativi,
      ultimo_errore: opts?.errore ?? null,
      data_sync: stato === "SINCRONIZZATO" ? ts : (esiste?.data_sync ?? null),
      data_creazione: esiste?.data_creazione ?? ts,
      data_aggiornamento: ts,
    });
}

async function eliminaRigaGoogle(attivitaId: string): Promise<void> {
  await db.prepare("DELETE FROM attivita_google WHERE attivita_id = ?").run(attivitaId);
}

// Tombstone: la riga resta a testimoniare che c'e' un evento da rimuovere su
// Google, anche se l'attivita' non esiste piu' nel database.
export async function marcaDaCancellare(attivitaId: string): Promise<void> {
  const esistente = await getAttivitaGoogle(attivitaId);
  if (!esistente) return;
  await scriviStato(
    attivitaId,
    esistente.calendar_id,
    esistente.event_id,
    "DA_CANCELLARE",
    { errore: null }
  );
}

function messaggioBreve(err: unknown): string {
  if (err instanceof ErroreGoogle) return err.message.slice(0, 300);
  if (err instanceof Error) return err.message.slice(0, 300);
  return "Errore sconosciuto.";
}

async function registraErrore(
  attivitaId: string,
  calendarId: string,
  eventId: string,
  err: unknown
): Promise<void> {
  const esistente = await getAttivitaGoogle(attivitaId);
  await scriviStato(attivitaId, calendarId, eventId, "ERRORE", {
    errore: messaggioBreve(err),
    tentativi: (esistente?.tentativi ?? 0) + 1,
  });
}

// ---------------------------------------------------------------------------
// Rimozione dell'evento su Google (best effort, non lancia)
// ---------------------------------------------------------------------------

async function rimuoviEvento(
  attivitaId: string,
  calendarId: string,
  eventId: string,
  budgetMs: number
): Promise<boolean> {
  try {
    await deleteEvent(calendarId, eventId, budgetMs);
    await eliminaRigaGoogle(attivitaId);
    return true;
  } catch (err) {
    // La delete e' idempotente su 404/410, quindi un errore qui e' reale:
    // la riga resta in ERRORE e verra' riprovata.
    await registraErrore(attivitaId, calendarId, eventId, err);
    return false;
  }
}

export interface EsitoSync {
  stato: GoogleStato;
  spostato?: boolean;
  codice?: CodiceErroreTempo;
}

// ---------------------------------------------------------------------------
// Sincronizzazione di una singola attivita'
// ---------------------------------------------------------------------------

export async function sincronizzaAttivita(
  attivitaId: string,
  opts?: { budgetMs?: number; tentativi?: number }
): Promise<EsitoSync> {
  const esistente = await getAttivitaGoogle(attivitaId);

  try {
    const attivita = await db
      .prepare(
        `SELECT id, progetto_id, cliente_id, titolo, descrizione, data_inizio,
                data_scadenza
         FROM attivita WHERE id = ?`
      )
      .get(attivitaId);

    // Attivita' sparita dal DB ma riga di sync ancora presente: va rimosso
    // l'evento, altrimenti resta orfano su Google per sempre.
    if (!attivita) {
      if (esistente) {
        await rimuoviEvento(attivitaId, esistente.calendar_id, esistente.event_id, opts?.budgetMs ?? 8000);
      }
      return { stato: "DA_CANCELLARE" };
    }

    const a = attivita as unknown as Pick<
      AttivitaRow,
      "id" | "progetto_id" | "cliente_id" | "titolo" | "descrizione" | "data_inizio" | "data_scadenza"
    >;

    const cfg = await getConfigGoogle();
    if (!configurazioneCompleta(cfg)) {
      // Non configurato: non si tocca nulla. Se c'e' un evento creato in
      // precedenza resta dove sta (l'utente potrebbe solo aver disattivato).
      return { stato: esistente?.stato ?? "PENDENTE" };
    }

    const origine = origineEvento(a);
    const calendario = risolviCalendario(cfg, origine);

    const costruito = costruisciEvento(a, cfg.timezone, {
      conId: idEventoDaAttivita(attivitaId),
    });

    if (!costruito.ok) {
      // Senza scadenza non deve esistere alcun evento: se c'era (perche' la
      // scadenza e' stata rimossa), va cancellato. Gli altri codici sono
      // errori di configurazione dei dati e vanno mostrati.
      if (costruito.codice === "SENZA_SCADENZA") {
        if (esistente) {
          await rimuoviEvento(
            attivitaId,
            esistente.calendar_id,
            esistente.event_id,
            opts?.budgetMs ?? 8000
          );
        }
        return { stato: "PENDENTE", codice: "SENZA_SCADENZA" };
      }
      await registraErrore(
        attivitaId,
        calendario ?? esistente?.calendar_id ?? "",
        esistente?.event_id ?? idEventoDaAttivita(attivitaId),
        new Error(MESSAGGI_TEMPO[costruito.codice])
      );
      return { stato: "ERRORE", codice: costruito.codice };
    }

    if (!calendario) {
      await registraErrore(
        attivitaId,
        esistente?.calendar_id ?? "",
        esistente?.event_id ?? idEventoDaAttivita(attivitaId),
        new Error("Nessun calendario Google configurato per questa origine.")
      );
      return { stato: "ERRORE" };
    }

    const budget = opts?.budgetMs ?? BUDGET_INLINE_MS;
    const tentativi = opts?.tentativi ?? 1;
    const evento = costruito.evento;
    const idDerivato = idEventoDaAttivita(attivitaId);

    // Spostamento: la mappatura e' cambiata. Si elimina sul vecchio calendario
    // e si crea sul nuovo (l'id e' unico per calendario, quindi non collide).
    if (esistente && esistente.calendar_id !== calendario) {
      await deleteEvent(esistente.calendar_id, esistente.event_id, budget);
      const creato = await insertEvent(calendario, { ...evento, id: idDerivato }, budget);
      await scriviStato(attivitaId, calendario, creato.id || idDerivato, "SINCRONIZZATO", {
        errore: null,
        azzeraTentativi: true,
      });
      return { stato: "SINCRONIZZATO", spostato: true };
    }

    if (esistente) {
      try {
        await updateEvent(calendario, esistente.event_id, evento, budget);
        await scriviStato(attivitaId, calendario, esistente.event_id, "SINCRONIZZATO", {
          errore: null,
          azzeraTentativi: true,
        });
        return { stato: "SINCRONIZZATO" };
      } catch (err) {
        // L'evento e' stato cancellato a mano su Google: il PATCH prende 404.
        // Si ricrea (self-healing). L'id derivato garantisce che non si
        // creino duplicati.
        if (err instanceof ErroreGoogle && (err.status === 404 || err.status === 410)) {
          const creato = await insertEvent(calendario, { ...evento, id: idDerivato }, budget);
          await scriviStato(attivitaId, calendario, creato.id || idDerivato, "SINCRONIZZATO", {
            errore: null,
            azzeraTentativi: true,
          });
          return { stato: "SINCRONIZZATO" };
        }
        throw err;
      }
    }

    // Prima sincronizzazione. Se l'id derivato esiste gia' su Google (riga di
    // stato persa, oppure retry dopo un errore di rete), l'insert prende 409:
    // si fa PATCH, cosi' non nascono duplicati.
    try {
      const creato = await insertEvent(calendario, { ...evento, id: idDerivato }, budget);
      await scriviStato(attivitaId, calendario, creato.id || idDerivato, "SINCRONIZZATO", {
        errore: null,
        azzeraTentativi: true,
      });
      return { stato: "SINCRONIZZATO" };
    } catch (err) {
      if (err instanceof ErroreGoogle && err.status === 409) {
        await updateEvent(calendario, idDerivato, evento, budget);
        await scriviStato(attivitaId, calendario, idDerivato, "SINCRONIZZATO", {
          errore: null,
          azzeraTentativi: true,
        });
        return { stato: "SINCRONIZZATO" };
      }
      throw err;
    }
  } catch (err) {
    // Qualunque errore diventa uno stato persistito: il chiamante non deve
    // mai vedere un'eccezione.
    await registraErrore(
      attivitaId,
      esistente?.calendar_id ?? "",
      esistente?.event_id ?? idEventoDaAttivita(attivitaId),
      err
    );
    return { stato: "ERRORE" };
  }
}

// Rimozione dell'evento quando l'attivita' viene cancellata dall'app.
// Non lancia: se fallisce, marca il tombstone per un tentativo successivo.
export async function rimuoviEventoAttivita(
  attivitaId: string,
  opts?: { budgetMs?: number }
): Promise<void> {
  const esistente = await getAttivitaGoogle(attivitaId);
  if (!esistente) return;

  if (esistente.stato === "DA_CANCELLARE") return;

  try {
    await deleteEvent(esistente.calendar_id, esistente.event_id, opts?.budgetMs ?? BUDGET_INLINE_MS);
    await eliminaRigaGoogle(attivitaId);
  } catch {
    await marcaDaCancellare(attivitaId);
  }
}

// ---------------------------------------------------------------------------
// Conteggi per la UI
// ---------------------------------------------------------------------------

export async function conteggiGoogle(): Promise<ConteggiGoogle> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM attivita_google WHERE stato = 'SINCRONIZZATO')  AS sincronizzati,
         (SELECT COUNT(*) FROM attivita_google WHERE stato = 'ERRORE')        AS in_errore,
         (SELECT COUNT(*) FROM attivita_google WHERE stato = 'DA_CANCELLARE') AS da_cancellare,
         (SELECT COUNT(*) FROM attivita a
            LEFT JOIN attivita_google ag ON ag.attivita_id = a.id
           WHERE ag.attivita_id IS NULL AND a.data_scadenza IS NOT NULL)      AS mai_sincronizzati`
    )
    .get();

  return {
    sincronizzati: (row?.sincronizzati as number) ?? 0,
    in_errore: (row?.in_errore as number) ?? 0,
    da_cancellare: (row?.da_cancellare as number) ?? 0,
    mai_sincronizzati: (row?.mai_sincronizzati as number) ?? 0,
  };
}

// Elenco compatto degli errori, per il pannello di configurazione.
export async function listaErroriGoogle(limite = 20): Promise<
  { attivita_id: string; titolo: string | null; progetto_id: string | null; ultimo_errore: string | null; tentativi: number }[]
> {
  const rows = await db
    .prepare(
      `SELECT ag.attivita_id, a.titolo, a.progetto_id, ag.ultimo_errore, ag.tentativi
       FROM attivita_google ag
       LEFT JOIN attivita a ON a.id = ag.attivita_id
       WHERE ag.stato = 'ERRORE'
       ORDER BY ag.data_aggiornamento DESC
       LIMIT @limite`
    )
    .all({ limite: Math.min(100, Math.max(1, limite)) });
  return rows as unknown as {
    attivita_id: string;
    titolo: string | null;
    progetto_id: string | null;
    ultimo_errore: string | null;
    tentativi: number;
  }[];
}

// ---------------------------------------------------------------------------
// Riconciliazione
//
// Un solo giro che allinea lo stato locale allo stato desiderato. Serve a tre
// cose che sono lo stesso problema: primo popolamento, recupero dopo errori
// transitori, migrazione dopo un cambio di mappatura.
// ---------------------------------------------------------------------------

export interface EsitoRiconciliazione {
  elaborati: number;
  sincronizzati: number;
  spostati: number;
  rimossi: number;
  errori: number;
  rimanenti: number;
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function riconcilia(opts?: {
  limite?: number;
  includi_passati?: boolean;
  solo_errori?: boolean;
}): Promise<EsitoRiconciliazione> {
  const limite = Math.min(500, Math.max(1, opts?.limite ?? 200));
  const cfg = await getConfigGoogle();

  if (!credenzialiPresenti()) {
    throw new ErroreGoogle(503, "Sincronizzazione Google non configurata.", "CONFIG");
  }
  if (!configurazioneCompleta(cfg)) {
    throw new ErroreGoogle(
      503,
      "Configurazione incompleta: assegna un calendario a ogni origine prima di sincronizzare.",
      "CONFIG"
    );
  }

  const esito: EsitoRiconciliazione = {
    elaborati: 0,
    sincronizzati: 0,
    spostati: 0,
    rimossi: 0,
    errori: 0,
    rimanenti: 0,
  };

  // --- Categoria 1: tombstone e righe orfane -------------------------------
  // Un tombstone (attivita' cancellata con Google non raggiungibile) e una
  // riga la cui attivita' non esiste piu' sono lo stesso caso: c'e' un evento
  // da rimuovere.
  const daRimuovere = await db
    .prepare(
      `SELECT ag.attivita_id, ag.calendar_id, ag.event_id
       FROM attivita_google ag
       LEFT JOIN attivita a ON a.id = ag.attivita_id
       WHERE ag.stato = 'DA_CANCELLARE' OR a.id IS NULL
       LIMIT @limite`
    )
    .all({ limite });

  for (const r of daRimuovere) {
    await rimuoviEvento(
      r.attivita_id as string,
      r.calendar_id as string,
      r.event_id as string,
      8000
    );
    esito.elaborati++;
    esito.rimossi++;
    await pausa(PAUSA_RICONCILIAZIONE_MS);
  }

  const restanti = limite - esito.elaborati;
  if (restanti <= 0) {
    esito.rimanenti = await contaRimanenti(cfg, opts?.includi_passati, opts?.solo_errori);
    return esito;
  }

  // --- Categorie 2-4: da allineare ----------------------------------------
  // Una sola enumerazione copre "mai sincronizzate", "spostate" ed "errori":
  // sincronizzaAttivita e' idempotente e decide da sola se inserire,
  // aggiornare o spostare.
  const soglia = opts?.includi_passati ? null : sogliaFinestra(cfg.finestra_giorni);

  const where: string[] = [];
  const params: Record<string, string | number> = { limite: restanti };

  if (opts?.solo_errori) {
    where.push("ag.stato = 'ERRORE'");
  } else {
    // Righe assenti (mai sincronizzate) oppure presenti ma non allineate.
    where.push(
      `(ag.attivita_id IS NULL
        OR ag.stato <> 'SINCRONIZZATO'
        OR ag.calendar_id <> COALESCE(
             CASE WHEN a.progetto_id IS NOT NULL THEN @cal_progetto
                  WHEN a.cliente_id  IS NOT NULL THEN @cal_cliente
                  ELSE @cal_generico END, ''))`
    );
    params.cal_progetto =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.progetto ?? cfg.calendario_default);
    params.cal_cliente =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.cliente ?? cfg.calendario_default);
    params.cal_generico =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.generico ?? cfg.calendario_default);
  }

  where.push("a.data_scadenza IS NOT NULL");
  if (soglia) {
    where.push("a.data_scadenza >= @soglia");
    params.soglia = soglia;
  }

  const daAllineare = await db
    .prepare(
      `SELECT a.id
       FROM attivita a
       LEFT JOIN attivita_google ag ON ag.attivita_id = a.id
       WHERE ${where.join(" AND ")}
       ORDER BY a.data_scadenza ASC
       LIMIT @limite`
    )
    .all(params);

  for (const r of daAllineare) {
    const res = await sincronizzaAttivita(r.id as string, { budgetMs: 8000 });
    esito.elaborati++;
    if (res.stato === "SINCRONIZZATO") {
      esito.sincronizzati++;
      if (res.spostato) esito.spostati++;
    } else if (res.stato === "ERRORE") {
      esito.errori++;
    }
    await pausa(PAUSA_RICONCILIAZIONE_MS);
  }

  esito.rimanenti = await contaRimanenti(cfg, opts?.includi_passati, opts?.solo_errori);
  return esito;
}

// Quante righe resterebbero da fare dopo questo giro. Serve alla UI per
// mostrare "Sincronizzati 200, restano 43" con un pulsante per continuare.
async function contaRimanenti(
  cfg: ConfigGoogle,
  includiPassati?: boolean,
  soloErrori?: boolean
): Promise<number> {
  const soglia = includiPassati ? null : sogliaFinestra(cfg.finestra_giorni);
  const where: string[] = [];
  const params: Record<string, string> = {};

  if (soloErrori) {
    where.push("ag.stato = 'ERRORE'");
  } else {
    where.push(
      `(ag.attivita_id IS NULL
        OR ag.stato <> 'SINCRONIZZATO'
        OR ag.calendar_id <> COALESCE(
             CASE WHEN a.progetto_id IS NOT NULL THEN @cal_progetto
                  WHEN a.cliente_id  IS NOT NULL THEN @cal_cliente
                  ELSE @cal_generico END, ''))`
    );
    params.cal_progetto =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.progetto ?? cfg.calendario_default);
    params.cal_cliente =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.cliente ?? cfg.calendario_default);
    params.cal_generico =
      cfg.modalita === "unico" ? cfg.calendario_default : (cfg.mappatura.generico ?? cfg.calendario_default);
  }

  where.push("a.data_scadenza IS NOT NULL");
  if (soglia) {
    where.push("a.data_scadenza >= @soglia");
    params.soglia = soglia;
  }

  // I tombstone e le righe orfane sono lavoro pendente a tutti gli effetti:
  // vanno contati, altrimenti la UI direbbe "restano 0" con eventi da
  // rimuovere ancora in coda.
  const orfani = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM attivita_google ag
       LEFT JOIN attivita a ON a.id = ag.attivita_id
       WHERE ag.stato = 'DA_CANCELLARE' OR a.id IS NULL`
    )
    .get({});

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM attivita a
       LEFT JOIN attivita_google ag ON ag.attivita_id = a.id
       WHERE ${where.join(" AND ")}`
    )
    .get(params);
  return ((row?.n as number) ?? 0) + ((orfani?.n as number) ?? 0);
}
