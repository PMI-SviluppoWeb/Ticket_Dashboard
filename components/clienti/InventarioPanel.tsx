"use client";

import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "@/components/icons";
import {
  OPZIONI_ANTIVIRUS,
  OPZIONI_BACKUP,
  OPZIONI_CLOUD,
  OPZIONI_ESIGENZE,
  OPZIONI_SICUREZZA,
  OPZIONI_SI_NO,
  OPZIONI_VPN,
  type Opzione,
} from "@/lib/questionari-schema";
import type { Questionario } from "@/lib/types";

function label(opzioni: Opzione[], valore: string): string {
  return opzioni.find((o) => o.valore === valore)?.label ?? (valore || "—");
}

function dataBreve(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function InventarioPanel({
  questionari,
}: {
  questionari: Questionario[];
}) {
  const ultimo = questionari.find((q) => q.risposta) ?? null;
  const r = ultimo?.risposta ?? null;

  if (!r) {
    return (
      <div className="rounded-card border border-dashed border-crema-contorno bg-white p-10 text-center">
        <InfoIcon className="mx-auto h-8 w-8 text-caldo-testo" />
        <p className="mt-3 text-sm font-medium text-inchiostro">
          Inventario non disponibile
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-caldo-testo">
          Invia un questionario al cliente: le risposte su PC, software, Arca e
          infrastruttura compariranno qui.
        </p>
      </div>
    );
  }

  const gap: string[] = [];
  if (r.arca.licenze > 0 && r.parco_pc.computer > r.arca.licenze) {
    gap.push(
      `${r.parco_pc.computer} computer ma ${r.arca.licenze} licenze Arca: possibile licenza mancante.`
    );
  }
  if (!r.arca.versione) {
    gap.push("Versione di Arca non dichiarata.");
  }
  if (r.infrastruttura.backup === "nessuno") {
    gap.push("Nessun backup dichiarato: opportunità di servizio backup.");
  }
  if (r.infrastruttura.antivirus === "nessuno") {
    gap.push("Nessun antivirus dichiarato: opportunità sicurezza.");
  }
  if (r.soddisfazione.nps !== null && r.soddisfazione.nps <= 6) {
    gap.push(`Soddisfazione bassa (NPS ${r.soddisfazione.nps}/10): rischio retention.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-inchiostro">
            Inventario e bisogni
          </h2>
          <p className="text-xs text-caldo-testo">
            Dati dichiarati dal cliente nel questionario più recente.
          </p>
        </div>
        <span className="text-[11px] text-caldo-testo">
          Aggiornato al {dataBreve(ultimo?.data_compilazione ?? null)}
        </span>
      </div>

      {gap.length > 0 && (
        <section className="rounded-card border border-stato-attesa-bordo bg-stato-attesa-bg p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stato-attesa-testo">
            <AlertTriangleIcon className="h-4 w-4" />
            Spunti commerciali
          </p>
          <ul className="mt-2 space-y-1 text-xs text-stato-attesa-testo">
            {gap.map((g) => (
              <li key={g}>• {g}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Parco PC
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Riga etichetta="Computer" valore={String(r.parco_pc.computer)} />
            <Riga etichetta="Server" valore={String(r.parco_pc.server)} />
            <Riga etichetta="Postazioni" valore={String(r.parco_pc.postazioni)} />
            <Riga
              etichetta="Anni medi"
              valore={r.parco_pc.anni_medi !== null ? String(r.parco_pc.anni_medi) : "—"}
            />
          </dl>
          {r.parco_pc.note && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-caldo-testo">
              {r.parco_pc.note}
            </p>
          )}
        </section>

        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Arca
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Riga etichetta="Versione" valore={r.arca.versione || "—"} />
            <Riga etichetta="Licenze" valore={String(r.arca.licenze)} />
            <Riga
              etichetta="Assistenza"
              valore={label(OPZIONI_SI_NO, r.arca.assistenza)}
            />
            <Riga
              etichetta="Ultimo aggiornamento"
              valore={r.arca.ultimo_aggiornamento || "—"}
            />
          </dl>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.arca.moduli.length === 0 ? (
              <span className="text-xs text-caldo-testo">Nessun modulo indicato.</span>
            ) : (
              r.arca.moduli.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-crema-contorno bg-crema-scuro px-2 py-0.5 text-[10px] font-medium text-caldo-testo"
                >
                  {m}
                </span>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-card border border-crema-contorno bg-white">
        <div className="border-b border-crema-bordo bg-crema-scuro px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Software dichiarati ({r.software.length})
          </h3>
        </div>
        {r.software.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-caldo-testo">
            Nessun software dichiarato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-crema-bordo text-[10px] uppercase tracking-wide text-caldo-testo">
                  <th className="px-4 py-2 font-medium">Software</th>
                  <th className="px-4 py-2 font-medium">Versione</th>
                  <th className="px-4 py-2 text-right font-medium">Licenze</th>
                  <th className="px-4 py-2 font-medium">Fornitore</th>
                  <th className="px-4 py-2 font-medium">Scadenza</th>
                </tr>
              </thead>
              <tbody>
                {r.software.map((s, i) => (
                  <tr key={`${s.nome}-${i}`} className="border-b border-crema-bordo last:border-0">
                    <td className="px-4 py-2 font-medium text-inchiostro">{s.nome}</td>
                    <td className="px-4 py-2 text-caldo-testo">{s.versione || "—"}</td>
                    <td className="tabular px-4 py-2 text-right text-caldo-testo">
                      {s.licenze ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-caldo-testo">{s.fornitore || "—"}</td>
                    <td className="px-4 py-2 text-caldo-testo">{s.scadenza || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Infrastruttura
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Riga etichetta="Backup" valore={label(OPZIONI_BACKUP, r.infrastruttura.backup)} />
            <Riga
              etichetta="Antivirus"
              valore={label(OPZIONI_ANTIVIRUS, r.infrastruttura.antivirus)}
            />
            <Riga etichetta="Cloud" valore={label(OPZIONI_CLOUD, r.infrastruttura.cloud)} />
            <Riga etichetta="VPN" valore={label(OPZIONI_VPN, r.infrastruttura.vpn)} />
            <Riga
              etichetta="Sicurezza"
              valore={label(OPZIONI_SICUREZZA, r.infrastruttura.sicurezza)}
            />
          </dl>
        </section>

        <section className="rounded-card border border-crema-contorno bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-caldo-testo">
            Esigenze e soddisfazione
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Riga
              etichetta="Priorità"
              valore={label(OPZIONI_ESIGENZE, r.esigenze.priorita)}
            />
            <Riga
              etichetta="NPS"
              valore={r.soddisfazione.nps !== null ? `${r.soddisfazione.nps}/10` : "—"}
            />
          </dl>
          {r.esigenze.criticita && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-caldo-testo">
              <strong className="text-inchiostro">Criticità:</strong>{" "}
              {r.esigenze.criticita}
            </p>
          )}
          {r.esigenze.obiettivi && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-caldo-testo">
              <strong className="text-inchiostro">Obiettivi:</strong>{" "}
              {r.esigenze.obiettivi}
            </p>
          )}
          {r.soddisfazione.commenti && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-caldo-testo">
              <strong className="text-inchiostro">Commenti:</strong>{" "}
              {r.soddisfazione.commenti}
            </p>
          )}
          <p className="mt-2 flex items-center gap-1 text-[10px] text-stato-ok-testo">
            <CheckCircleIcon className="h-3 w-3" />
            Consenso privacy registrato
          </p>
        </section>
      </div>
    </div>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-caldo-testo">{etichetta}</dt>
      <dd className="text-right font-medium text-inchiostro">{valore}</dd>
    </div>
  );
}
