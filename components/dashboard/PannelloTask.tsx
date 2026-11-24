"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  AttivitaRow,
  Priorita,
  StatoAttivita,
  TaskScadenzaDashboard,
} from "@/lib/types";
import { chiaveGiorno } from "@/lib/calendario";
import { caricaApi } from "@/lib/api-cache";
import { AttivitaStatusBadge, PriorityBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import Pannello from "./Pannello";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  EditIcon,
  GridIcon,
  ListChecksIcon,
  LoaderIcon,
  RefreshIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";

type Vista = "card" | "elenco";
type Filtro = "tutte" | "scadenza" | "ritardo" | "senza";
type Ambito = "mie" | "team";

const CHIAVE_VISTA = "dashboard-task-vista";

const FILTRI: { id: Filtro; label: string }[] = [
  { id: "tutte", label: "Tutte" },
  { id: "scadenza", label: "In scadenza" },
  { id: "ritardo", label: "In ritardo" },
  { id: "senza", label: "Senza scadenza" },
];

const PRIORITA_OPZIONI: Priorita[] = ["BASSA", "MEDIA", "ALTA"];
const STATO_OPZIONI: StatoAttivita[] = ["DA_FARE", "IN_CORSO", "COMPLETATA"];

const PRIORITA_LABEL: Record<Priorita, string> = {
  BASSA: "Bassa",
  MEDIA: "Media",
  ALTA: "Alta",
};

const STATO_LABEL: Record<StatoAttivita, string> = {
  DA_FARE: "Da fare",
  IN_CORSO: "In corso",
  COMPLETATA: "Completata",
};

interface PannelloTaskProps {
  task: TaskScadenzaDashboard[];
  caricamento: boolean;
  isAdmin: boolean;
  operatori?: string[];
  // Chiamata dopo ogni modifica riuscita (completa/modifica/elimina): la
  // dashboard ricarica cosi' sia le task sia i conteggi.
  onModificata: () => void;
  className?: string;
}

interface FormTask {
  id: string;
  titolo: string;
  descrizione: string;
  priorita: Priorita;
  stato: StatoAttivita;
  data_scadenza: string;
  assegnatario: string;
}

interface AzioniTask {
  pendente: boolean;
  confermaElimina: boolean;
  onCompleta: (task: TaskScadenzaDashboard) => void;
  onModifica: (task: TaskScadenzaDashboard) => void;
  onElimina: (task: TaskScadenzaDashboard) => void;
  onConfermaElimina: (id: string | null) => void;
}

// Task aperte personali (default) e, per gli admin, toggle Team con la lista
// di tutto il team. Oltre a leggerle, da qui si possono COMPLETARE (la task
// sparisce perche' il pannello mostra solo le aperte), MODIFICARE ed ELIMINARE.
export default function PannelloTask({
  task,
  caricamento,
  isAdmin,
  operatori = [],
  onModificata,
  className = "",
}: PannelloTaskProps) {
  const [vista, setVista] = useState<Vista>("card");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [ambito, setAmbito] = useState<Ambito>("mie");
  const [team, setTeam] = useState<TaskScadenzaDashboard[] | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const letto = useRef(false);

  // Azioni sulle task.
  const [erroreAzione, setErroreAzione] = useState("");
  const [pendenti, setPendenti] = useState<Record<string, boolean>>({});
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [modificaLoading, setModificaLoading] = useState(false);
  const [form, setForm] = useState<FormTask | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const salvata = window.localStorage.getItem(CHIAVE_VISTA);
    if (salvata === "card" || salvata === "elenco") setVista(salvata);
    letto.current = true;
  }, []);

  useEffect(() => {
    if (!letto.current) return;
    window.localStorage.setItem(CHIAVE_VISTA, vista);
  }, [vista]);

  useEffect(() => {
    if (!isAdmin) setAmbito("mie");
  }, [isAdmin]);

  const caricaTeam = useCallback(async (forza = false) => {
    setTeamLoading(true);
    setTeamError("");
    try {
      const data = await caricaApi<{ task?: TaskScadenzaDashboard[] }>(
        "/api/attivita/team",
        { forza }
      );
      setTeam(data.task ?? []);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Errore nel caricamento.");
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const cambiaAmbito = (prossimo: Ambito) => {
    setAmbito(prossimo);
    if (prossimo === "team") void caricaTeam(false);
  };

  const segnaPendente = (id: string, valore: boolean) =>
    setPendenti((prev) => ({ ...prev, [id]: valore }));

  const dopoModifica = useCallback(() => {
    if (ambito === "team") void caricaTeam(true);
    onModificata();
  }, [ambito, caricaTeam, onModificata]);

  const completa = useCallback(
    async (t: TaskScadenzaDashboard) => {
      if (pendenti[t.id]) return;
      segnaPendente(t.id, true);
      setErroreAzione("");
      try {
        const res = await fetch(`/api/attivita/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato: "COMPLETATA" }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Errore nel completamento.");
        }
        dopoModifica();
      } catch (err) {
        setErroreAzione(
          err instanceof Error ? err.message : "Errore nel completamento."
        );
      } finally {
        segnaPendente(t.id, false);
      }
    },
    [pendenti, dopoModifica]
  );

  const elimina = useCallback(
    async (t: TaskScadenzaDashboard) => {
      if (pendenti[t.id]) return;
      segnaPendente(t.id, true);
      setErroreAzione("");
      try {
        const res = await fetch(`/api/attivita/${t.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Errore nell'eliminazione.");
        }
        setConfermaElimina(null);
        dopoModifica();
      } catch (err) {
        setErroreAzione(
          err instanceof Error ? err.message : "Errore nell'eliminazione."
        );
      } finally {
        segnaPendente(t.id, false);
      }
    },
    [pendenti, dopoModifica]
  );

  const apriModifica = useCallback(async (t: TaskScadenzaDashboard) => {
    setModificaId(t.id);
    setModificaLoading(true);
    setErroreAzione("");
    try {
      const res = await fetch(`/api/attivita/${t.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Attività non trovata.");
      const a = (await res.json()) as AttivitaRow;
      setForm({
        id: a.id,
        titolo: a.titolo,
        descrizione: a.descrizione ?? "",
        priorita: a.priorita,
        stato: a.stato,
        data_scadenza: a.data_scadenza ?? "",
        assegnatario: a.assegnatario ?? "",
      });
    } catch (err) {
      setErroreAzione(
        err instanceof Error ? err.message : "Errore nel caricamento."
      );
      setModificaId(null);
    } finally {
      setModificaLoading(false);
    }
  }, []);

  const chiudiModifica = useCallback(() => {
    setModificaId(null);
    setForm(null);
    setModificaLoading(false);
  }, []);

  useEffect(() => {
    if (!modificaId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") chiudiModifica();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modificaId, chiudiModifica]);

  const salvaModifica = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!form || !form.titolo.trim()) return;
      setSalvando(true);
      setErroreAzione("");
      try {
        const res = await fetch(`/api/attivita/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titolo: form.titolo.trim(),
            descrizione: form.descrizione.trim() || null,
            priorita: form.priorita,
            stato: form.stato,
            data_scadenza: form.data_scadenza || null,
            assegnatario: form.assegnatario || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Errore nel salvataggio.");
        }
        chiudiModifica();
        dopoModifica();
      } catch (err) {
        setErroreAzione(
          err instanceof Error ? err.message : "Errore nel salvataggio."
        );
      } finally {
        setSalvando(false);
      }
    },
    [form, chiudiModifica, dopoModifica]
  );

  const lista = ambito === "team" ? team ?? [] : task;
  const caricando = ambito === "team" ? teamLoading : caricamento;
  const visibili = lista.filter((t) => passaFiltro(t, filtro));
  const etichettaAmbito = ambito === "team" ? "Task del team" : "Le mie task";

  const azioni: AzioniTask = {
    pendente: false,
    confermaElimina: false,
    onCompleta: (t) => void completa(t),
    onModifica: (t) => void apriModifica(t),
    onElimina: (t) => void elimina(t),
    onConfermaElimina: setConfermaElimina,
  };

  return (
    <Pannello ariaLabel={etichettaAmbito} className={className}>
      <SectionBar
        titolo={etichettaAmbito}
        icona={ListChecksIcon}
        conteggio={caricando ? undefined : visibili.length}
      >
        <div
          role="group"
          aria-label="Vista delle task"
          className="flex items-center gap-0.5 rounded-full border border-crema-contorno bg-white p-0.5"
        >
          <button
            type="button"
            onClick={() => setVista("card")}
            aria-pressed={vista === "card"}
            aria-label="Vista a card"
            title="Vista a card"
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
              vista === "card"
                ? "bg-inchiostro text-white"
                : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
            }`}
          >
            <GridIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setVista("elenco")}
            aria-pressed={vista === "elenco"}
            aria-label="Vista a elenco"
            title="Vista a elenco"
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
              vista === "elenco"
                ? "bg-inchiostro text-white"
                : "text-caldo-testo hover:bg-crema-scuro hover:text-inchiostro"
            }`}
          >
            <ListChecksIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </SectionBar>

      <div className="flex flex-wrap items-center gap-2 border-b border-crema-bordo px-4 py-2">
        {isAdmin && (
          <div
            role="group"
            aria-label="Ambito delle task"
            className="flex rounded-full bg-crema-scuro p-0.5"
          >
            <button
              type="button"
              onClick={() => cambiaAmbito("mie")}
              aria-pressed={ambito === "mie"}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                ambito === "mie"
                  ? "bg-inchiostro text-white"
                  : "text-caldo-testo hover:text-inchiostro"
              }`}
            >
              Solo mie
            </button>
            <button
              type="button"
              onClick={() => cambiaAmbito("team")}
              aria-pressed={ambito === "team"}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                ambito === "team"
                  ? "bg-inchiostro text-white"
                  : "text-caldo-testo hover:text-inchiostro"
              }`}
            >
              Team
            </button>
          </div>
        )}

        <span className="relative ml-auto inline-flex">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
            aria-label="Filtra le task"
            className="cursor-pointer appearance-none rounded-full border border-crema-contorno bg-white py-1 pl-2.5 pr-7 text-[11px] font-semibold text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
          >
            {FILTRI.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-caldo-testo" />
        </span>

        {ambito === "team" && (
          <button
            type="button"
            onClick={() => void caricaTeam(true)}
            disabled={teamLoading}
            aria-label="Aggiorna le task del team"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${teamLoading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {teamError && ambito === "team" && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
        >
          {teamError}
        </p>
      )}

      {erroreAzione && (
        <p
          role="alert"
          className="mx-4 mt-3 flex items-center gap-2 rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-3 py-2 text-xs font-medium text-stato-urgenza-testo"
        >
          <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{erroreAzione}</span>
          <button
            type="button"
            onClick={() => setErroreAzione("")}
            aria-label="Chiudi l'errore"
            className="cursor-pointer text-stato-urgenza-testo/70 hover:text-stato-urgenza-testo"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {caricando ? (
          <Scheletro vista={vista} />
        ) : ambito === "team" && teamError && team === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
            <p className="text-sm font-medium text-inchiostro">Task del team non disponibili</p>
            <p className="text-xs text-caldo-testo">Usa il pulsante di aggiornamento per riprovare.</p>
          </div>
        ) : visibili.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
            <p className="text-sm font-medium text-inchiostro">
              {lista.length === 0 ? "Nessuna task aperta" : "Nessuna task con questo filtro"}
            </p>
            <p className="text-xs text-caldo-testo">
              {lista.length === 0
                ? "Le attivita' aperte compariranno qui."
                : "Cambia filtro per vedere le altre."}
            </p>
          </div>
        ) : vista === "card" ? (
          <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2">
            {visibili.map((t) => (
              <CardTask
                key={t.id}
                task={t}
                mostraAssegnatario={ambito === "team"}
                azioni={{
                  ...azioni,
                  pendente: Boolean(pendenti[t.id]),
                  confermaElimina: confermaElimina === t.id,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-crema-bordo">
            {visibili.map((t) => (
              <RigaTask
                key={t.id}
                task={t}
                mostraAssegnatario={ambito === "team"}
                azioni={{
                  ...azioni,
                  pendente: Boolean(pendenti[t.id]),
                  confermaElimina: confermaElimina === t.id,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {modificaId && (
        <ModaleTask
          form={form}
          operatori={operatori}
          caricamento={modificaLoading}
          salvando={salvando}
          onChange={setForm}
          onSalva={salvaModifica}
          onChiudi={chiudiModifica}
        />
      )}
    </Pannello>
  );
}

function passaFiltro(task: TaskScadenzaDashboard, filtro: Filtro): boolean {
  if (filtro === "tutte") return true;
  if (filtro === "ritardo") return task.in_ritardo;
  if (filtro === "scadenza") return task.in_scadenza;
  return !task.data_scadenza;
}

function contesto(task: TaskScadenzaDashboard): string {
  if (task.progetto_codice && task.progetto_nome) {
    return `${task.progetto_codice} · ${task.progetto_nome}`;
  }
  return task.progetto_nome ?? task.cliente_ragione_sociale ?? "Senza progetto";
}

function hrefTask(task: TaskScadenzaDashboard): string {
  return task.progetto_id ? `/progetti/${task.progetto_id}` : "/progetti";
}

function BottoneCompleta({
  task,
  azioni,
}: {
  task: TaskScadenzaDashboard;
  azioni: AzioniTask;
}) {
  return (
    <input
      type="checkbox"
      checked={task.stato === "COMPLETATA"}
      onChange={() => azioni.onCompleta(task)}
      disabled={azioni.pendente}
      aria-label={`Segna completata: ${task.titolo}`}
      title="Segna completata"
      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-inchiostro disabled:cursor-wait"
    />
  );
}

function AzioniRiga({
  task,
  azioni,
}: {
  task: TaskScadenzaDashboard;
  azioni: AzioniTask;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => azioni.onModifica(task)}
        disabled={azioni.pendente}
        aria-label={`Modifica ${task.titolo}`}
        title="Modifica"
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro disabled:cursor-wait disabled:opacity-50"
      >
        <EditIcon className="h-3.5 w-3.5" />
      </button>
      {azioni.confermaElimina ? (
        <>
          <button
            type="button"
            onClick={() => azioni.onElimina(task)}
            disabled={azioni.pendente}
            className="cursor-pointer rounded-control border border-stato-urgenza-bordo bg-stato-urgenza-bg px-1.5 py-0.5 text-[10px] font-semibold text-stato-urgenza-testo disabled:cursor-wait disabled:opacity-50"
            title="Conferma eliminazione"
          >
            Elimina
          </button>
          <button
            type="button"
            onClick={() => azioni.onConfermaElimina(null)}
            aria-label="Annulla eliminazione"
            title="Annulla"
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => azioni.onConfermaElimina(task.id)}
          disabled={azioni.pendente}
          aria-label={`Elimina ${task.titolo}`}
          title="Elimina"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-stato-urgenza-bg hover:text-stato-urgenza-testo disabled:cursor-wait disabled:opacity-50"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {azioni.pendente && (
        <LoaderIcon className="h-3.5 w-3.5 animate-spin text-caldo-testo" />
      )}
    </div>
  );
}

function CardTask({
  task,
  mostraAssegnatario,
  azioni,
}: {
  task: TaskScadenzaDashboard;
  mostraAssegnatario: boolean;
  azioni: AzioniTask;
}) {
  const scadenza = etichettaScadenza(task.data_scadenza, task.in_ritardo);
  const oggi = !task.in_ritardo && scadenza.testo === "Oggi";

  const tinta = task.in_ritardo
    ? "border-stato-urgenza-bordo bg-stato-urgenza-bg/50 hover:border-stato-urgenza-testo/40"
    : oggi
      ? "border-lime/60 bg-peach-tenue hover:border-lime"
      : "border-crema-bordo bg-white hover:border-inchiostro/20 hover:shadow-soft";

  return (
    <div
      className={`flex min-h-[92px] flex-col rounded-control border p-3 transition-all duration-200 ${tinta}`}
    >
      <div className="flex items-start gap-2">
        <BottoneCompleta task={task} azioni={azioni} />
        <div className="min-w-0 flex-1">
          <Link
            href={hrefTask(task)}
            className="line-clamp-2 text-sm font-semibold leading-snug text-inchiostro underline-offset-2 hover:underline"
          >
            {task.titolo}
          </Link>
          <p className="mt-1 truncate text-[11px] text-caldo-testo">{contesto(task)}</p>
          {mostraAssegnatario && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-caldo-testo">
              <UserIcon className="h-2.5 w-2.5 shrink-0" />
              {task.assegnatario ?? "Non assegnata"}
            </p>
          )}
        </div>
        <PriorityBadge priorita={task.priorita} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className={`tabular text-[11px] ${scadenza.classe}`}>{scadenza.testo}</span>
        <div className="flex items-center gap-1.5">
          <AttivitaStatusBadge stato={task.stato} />
          <AzioniRiga task={task} azioni={azioni} />
        </div>
      </div>
    </div>
  );
}

function RigaTask({
  task,
  mostraAssegnatario,
  azioni,
}: {
  task: TaskScadenzaDashboard;
  mostraAssegnatario: boolean;
  azioni: AzioniTask;
}) {
  const scadenza = etichettaScadenza(task.data_scadenza, task.in_ritardo);

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-crema-scuro">
      <BottoneCompleta task={task} azioni={azioni} />
      <div className="min-w-0 flex-1">
        <Link
          href={hrefTask(task)}
          className="block truncate text-sm font-medium text-inchiostro underline-offset-2 hover:underline"
        >
          {task.titolo}
        </Link>
        <p className="flex items-center gap-1 truncate text-[11px] text-caldo-testo">
          <span className="truncate">{contesto(task)}</span>
          {mostraAssegnatario && (
            <>
              <span aria-hidden="true">·</span>
              <UserIcon className="h-2.5 w-2.5 shrink-0" />
              <span className="shrink-0">{task.assegnatario ?? "Non assegnata"}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`tabular text-[11px] ${scadenza.classe}`}>{scadenza.testo}</span>
        <PriorityBadge priorita={task.priorita} />
      </div>

      <AzioniRiga task={task} azioni={azioni} />
    </div>
  );
}

function ModaleTask({
  form,
  operatori,
  caricamento,
  salvando,
  onChange,
  onSalva,
  onChiudi,
}: {
  form: FormTask | null;
  operatori: string[];
  caricamento: boolean;
  salvando: boolean;
  onChange: (form: FormTask | null) => void;
  onSalva: (event: React.FormEvent) => void;
  onChiudi: () => void;
}) {
  const opzioniAssegnatario =
    form?.assegnatario && !operatori.includes(form.assegnatario)
      ? [...operatori, form.assegnatario]
      : operatori;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-inchiostro/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Modifica task"
    >
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onChiudi}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative w-full max-w-lg rounded-t-card border border-crema-contorno bg-white shadow-2xl sm:rounded-card">
        <div className="flex items-center justify-between border-b border-crema-bordo px-5 py-3">
          <h2 className="font-display text-lg font-semibold text-inchiostro">Modifica task</h2>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {caricamento || !form ? (
          <div className="flex items-center justify-center py-12">
            <LoaderIcon className="h-6 w-6 animate-spin text-inchiostro" />
          </div>
        ) : (
          <form onSubmit={onSalva} className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-caldo-testo">Titolo *</label>
              <input
                required
                maxLength={300}
                value={form.titolo}
                onChange={(e) => onChange({ ...form, titolo: e.target.value })}
                className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-caldo-testo">Descrizione</label>
              <textarea
                rows={3}
                value={form.descrizione}
                onChange={(e) => onChange({ ...form, descrizione: e.target.value })}
                className="w-full resize-none rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-caldo-testo">Stato</label>
                <select
                  value={form.stato}
                  onChange={(e) =>
                    onChange({ ...form, stato: e.target.value as StatoAttivita })
                  }
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                >
                  {STATO_OPZIONI.map((s) => (
                    <option key={s} value={s}>
                      {STATO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-caldo-testo">Priorità</label>
                <select
                  value={form.priorita}
                  onChange={(e) =>
                    onChange({ ...form, priorita: e.target.value as Priorita })
                  }
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                >
                  {PRIORITA_OPZIONI.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITA_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-caldo-testo">
                  Scadenza
                </label>
                <input
                  type="datetime-local"
                  value={form.data_scadenza}
                  onChange={(e) => onChange({ ...form, data_scadenza: e.target.value })}
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-caldo-testo">
                  Assegnatario
                </label>
                <select
                  value={form.assegnatario}
                  onChange={(e) => onChange({ ...form, assegnatario: e.target.value })}
                  className="w-full rounded-control border border-crema-contorno px-3 py-2 text-sm text-inchiostro focus:border-inchiostro focus:outline-none focus:ring-1 focus:ring-inchiostro"
                >
                  <option value="">Non assegnata</option>
                  {opzioniAssegnatario.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-crema-bordo pt-3">
              <button
                type="submit"
                disabled={salvando || !form.titolo.trim()}
                className="flex cursor-pointer items-center gap-2 rounded-control bg-inchiostro px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-inchiostro-profondo disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando && <LoaderIcon className="h-4 w-4 animate-spin" />}
                Salva
              </button>
              <button
                type="button"
                onClick={onChiudi}
                className="cursor-pointer rounded-control border border-crema-contorno px-4 py-2 text-sm font-medium text-caldo-testo transition-colors duration-200 hover:bg-crema-scuro hover:text-inchiostro"
              >
                Annulla
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// "In ritardo" invece della data: e' l'informazione che cambia il comporta-
// mento, e la data di una cosa gia' scaduta non aggiunge niente. Per oggi e
// domani la parola basta; per il resto, giorno e mese in forma breve. Una
// task senza data resta visibile con "Senza scadenza".
function etichettaScadenza(
  data: string | null,
  inRitardo: boolean
): { testo: string; classe: string } {
  if (!data) {
    return { testo: "Senza scadenza", classe: "text-caldo-testo" };
  }
  if (inRitardo) {
    return { testo: "In ritardo", classe: "font-semibold text-stato-urgenza-testo" };
  }
  const d = new Date(data);
  if (!Number.isFinite(d.getTime())) {
    return { testo: data, classe: "text-caldo-testo" };
  }
  const oggi = new Date();
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1);
  const chiave = chiaveGiorno(d);
  if (chiave === chiaveGiorno(oggi)) {
    return { testo: "Oggi", classe: "font-semibold text-inchiostro" };
  }
  if (chiave === chiaveGiorno(domani)) {
    return { testo: "Domani", classe: "font-medium text-inchiostro" };
  }
  return {
    testo: d.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    classe: "text-caldo-testo",
  };
}

function Scheletro({ vista }: { vista: Vista }) {
  if (vista === "card") {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-2.5 p-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-control border border-crema-bordo p-3">
            <div className="h-2.5 w-3/4 rounded-full bg-crema-scuro" />
            <div className="mt-2 h-2 w-1/2 rounded-full bg-crema-scuro" />
            <div className="mt-4 h-5 w-16 rounded-full bg-crema-scuro" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-pulse divide-y divide-crema-bordo">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-3/4 rounded-full bg-crema-scuro" />
            <div className="h-2 w-1/2 rounded-full bg-crema-scuro" />
          </div>
          <div className="h-5 w-14 rounded-full bg-crema-scuro" />
        </div>
      ))}
    </div>
  );
}
