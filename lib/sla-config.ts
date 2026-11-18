import "server-only";
import { db } from "./db";
import { CONFIG_SLA_DEFAULT, type ConfigSla, type ObiettivoSla } from "./sla";
import type { Priorita } from "./types";

const CHIAVE = "sla_config";

function fondiConfig(raw: unknown): ConfigSla {
  if (!raw || typeof raw !== "object") return CONFIG_SLA_DEFAULT;
  const r = raw as Partial<ConfigSla>;
  const priorita: Record<Priorita, ObiettivoSla> = {
    ALTA: { ...CONFIG_SLA_DEFAULT.priorita.ALTA, ...(r.priorita?.ALTA ?? {}) },
    MEDIA: { ...CONFIG_SLA_DEFAULT.priorita.MEDIA, ...(r.priorita?.MEDIA ?? {}) },
    BASSA: { ...CONFIG_SLA_DEFAULT.priorita.BASSA, ...(r.priorita?.BASSA ?? {}) },
  };
  return {
    priorita,
    orario: {
      giorni:
        Array.isArray(r.orario?.giorni) && r.orario!.giorni.length > 0
          ? r.orario!.giorni.filter((g) => Number.isInteger(g) && g >= 0 && g <= 6)
          : CONFIG_SLA_DEFAULT.orario.giorni,
      inizio: typeof r.orario?.inizio === "string" ? r.orario.inizio : CONFIG_SLA_DEFAULT.orario.inizio,
      fine: typeof r.orario?.fine === "string" ? r.orario.fine : CONFIG_SLA_DEFAULT.orario.fine,
      pausa:
        r.orario?.pausa === null
          ? null
          : {
              inizio: r.orario?.pausa?.inizio ?? CONFIG_SLA_DEFAULT.orario.pausa!.inizio,
              fine: r.orario?.pausa?.fine ?? CONFIG_SLA_DEFAULT.orario.pausa!.fine,
            },
    },
    festivi: Array.isArray(r.festivi)
      ? r.festivi.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [],
  };
}

export async function getConfigSla(): Promise<ConfigSla> {
  try {
    const row = await db
      .prepare(`SELECT valore FROM impostazioni WHERE chiave = ?`)
      .get(CHIAVE);
    if (!row?.valore) return CONFIG_SLA_DEFAULT;
    return fondiConfig(JSON.parse(String(row.valore)));
  } catch {
    return CONFIG_SLA_DEFAULT;
  }
}

export async function salvaConfigSla(cfg: ConfigSla): Promise<ConfigSla> {
  const pulita = fondiConfig(cfg);
  await db
    .prepare(
      `INSERT INTO impostazioni (chiave, valore, data_aggiornamento)
       VALUES (@chiave, @valore, @ts)
       ON CONFLICT (chiave) DO UPDATE SET valore = @valore, data_aggiornamento = @ts`
    )
    .run({
      chiave: CHIAVE,
      valore: JSON.stringify(pulita),
      ts: new Date().toISOString(),
    });
  return pulita;
}
