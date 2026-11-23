"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TaskScadenzaDashboard } from "@/lib/types";
import { chiaveGiorno } from "@/lib/calendario";
import { caricaApi } from "@/lib/api-cache";
import { AttivitaStatusBadge, PriorityBadge } from "@/components/badges";
import SectionBar from "@/components/SectionBar";
import Pannello from "./Pannello";
import {
  ChevronDownIcon,
  GridIcon,
  ListChecksIcon,
  RefreshIcon,
  UserIcon,
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

interface PannelloTaskProps {
  task: TaskScadenzaDashboard[];
  caricamento: boolean;
  isAdmin: boolean;
  className?: string;
}

// Task aperte personali (default) e, per gli admin, toggle Team con la lista
// di tutto il team. Filtri per scadenza e due letture (card/elenco): la scelta
// sopravvive al reload.
export default function PannelloTask({
  task,
  caricamento,
  isAdmin,
  className = "",
}: PannelloTaskProps) {
  const [vista, setVista] = useState<Vista>("card");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [ambito, setAmbito] = useState<Ambito>("mie");
  const [team, setTeam] = useState<TaskScadenzaDashboard[] | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const letto = useRef(false);

  useEffect(() => {
    const salvata = window.localStorage.getItem(CHIAVE_VISTA);
    if (salvata === "card" || salvata === "elenco") setVista(salvata);
    letto.current = true;
  }, []);

  useEffect(() => {
    if (!letto.current) return;
    window.localStorage.setItem(CHIAVE_VISTA, vista);
  }, [vista]);

  // Un non-admin non ha un team da guardare: se il ruolo cambia (logout/login
  // nella stessa scheda) si torna alla vista personale.
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

  const lista = ambito === "team" ? team ?? [] : task;
  const caricando = ambito === "team" ? teamLoading : caricamento;
  const visibili = lista.filter((t) => passaFiltro(t, filtro));
  const etichettaAmbito = ambito === "team" ? "Task del team" : "Le mie task";

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
              <CardTask key={t.id} task={t} mostraAssegnatario={ambito === "team"} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-crema-bordo">
            {visibili.map((t) => (
              <RigaTask key={t.id} task={t} mostraAssegnatario={ambito === "team"} />
            ))}
          </div>
        )}
      </div>
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

function CardTask({
  task,
  mostraAssegnatario,
}: {
  task: TaskScadenzaDashboard;
  mostraAssegnatario: boolean;
}) {
  const scadenza = etichettaScadenza(task.data_scadenza, task.in_ritardo);
  const oggi = !task.in_ritardo && scadenza.testo === "Oggi";

  const tinta = task.in_ritardo
    ? "border-stato-urgenza-bordo bg-stato-urgenza-bg/50 hover:border-stato-urgenza-testo/40"
    : oggi
      ? "border-lime/60 bg-peach-tenue hover:border-lime"
      : "border-crema-bordo bg-white hover:border-inchiostro/20 hover:shadow-soft";

  return (
    <Link
      href={hrefTask(task)}
      className={`flex min-h-[92px] flex-col rounded-control border p-3 transition-all duration-200 ${tinta}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-inchiostro">
          {task.titolo}
        </p>
        <PriorityBadge priorita={task.priorita} />
      </div>

      <p className="mt-1 truncate text-[11px] text-caldo-testo">{contesto(task)}</p>

      {mostraAssegnatario && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-caldo-testo">
          <UserIcon className="h-2.5 w-2.5 shrink-0" />
          {task.assegnatario ?? "Non assegnata"}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className={`tabular text-[11px] ${scadenza.classe}`}>{scadenza.testo}</span>
        <AttivitaStatusBadge stato={task.stato} />
      </div>
    </Link>
  );
}

function RigaTask({
  task,
  mostraAssegnatario,
}: {
  task: TaskScadenzaDashboard;
  mostraAssegnatario: boolean;
}) {
  const scadenza = etichettaScadenza(task.data_scadenza, task.in_ritardo);

  return (
    <Link
      href={hrefTask(task)}
      className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-crema-scuro"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-inchiostro">{task.titolo}</p>
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
    </Link>
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
