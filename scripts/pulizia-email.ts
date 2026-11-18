import dotenv from "dotenv";
import path from "path";
import { unlink } from "fs/promises";

// Pulizia dei ticket nati da email (tipicamente la vecchia casella di .env che
// riceveva posta promozionale).
//
// SICUREZZA: di default NON cancella nulla. Mostra solo l'anteprima.
//
//   npx tsx scripts/pulizia-email.ts
//   npx tsx scripts/pulizia-email.ts --da 2026-11-01 --a 2026-11-18
//   npx tsx scripts/pulizia-email.ts --mittente team@learnn.com,bk@email.burgerking.it
//   npx tsx scripts/pulizia-email.ts --conferma --da 2026-11-01 --a 2026-11-18
//   npx tsx scripts/pulizia-email.ts --orfani            # anteprima orfani
//   npx tsx scripts/pulizia-email.ts --orfani --conferma # elimina orfani
//
// Per cancellare TUTTI i ticket da email senza filtri serve anche --tutti.
//
// Cosa fa:
//  - cancella il ticket e i suoi figli (messaggi, note, allegati, email_log,
//    storico, progetti, notifiche);
//  - conserva la riga in email_inbox, marcata "ignorata" (registro storico);
//  - rimuove i file allegati da uploads/ DOPO la cancellazione su DB;
//  - le voci di tempo NON vengono cancellate: restano come ore storiche. I
//    ticket che hanno ore vengono saltati, salvo --forza.
//
// `--orfani` pulisce le righe figlie che puntano a ticket non piu' esistenti
// (utile dopo cancellazioni fatte a mano dal DB).

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

function inizioGiorno(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}
function giornoDopo(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0).toISOString();
}
function formatta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("TURSO_DATABASE_URL mancante (serve .env.local o .env).");
    process.exit(1);
  }

  const conferma = flag("conferma");
  const tutti = flag("tutti");
  const orfani = flag("orfani");
  const forza = flag("forza");
  const da = arg("da");
  const a = arg("a");
  const mittenti = (arg("mittente") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if ((da && !/^\d{4}-\d{2}-\d{2}$/.test(da)) || (a && !/^\d{4}-\d{2}-\d{2}$/.test(a))) {
    console.error("Date non valide: usa YYYY-MM-DD.");
    process.exit(1);
  }
  if (da && a && da > a) {
    console.error("La data iniziale e' successiva a quella finale.");
    process.exit(1);
  }

  const { getTursoClient } = await import("../lib/turso-client");
  const client = getTursoClient();

  // -------------------------------------------------------------------------
  // 1. Ticket da email (anteprima)
  // -------------------------------------------------------------------------
  const condizioni = ["(i.casella_id = 'env' OR i.casella_id IS NULL)"];
  const params: Array<string> = [];
  if (da) {
    condizioni.push(`i.data_creazione >= ?`);
    params.push(inizioGiorno(da));
  }
  if (a) {
    condizioni.push(`i.data_creazione < ?`);
    params.push(giornoDopo(a));
  }
  if (mittenti.length > 0) {
    const segnaposto = mittenti.map(() => "?").join(", ");
    condizioni.push(`lower(i.from_email) IN (${segnaposto})`);
    params.push(...mittenti);
  }

  const risultato = await client.execute({
    sql: `SELECT t.id, t.numero, t.cliente, t.email, t.stato,
                 i.from_email, i.subject, i.casella_id, i.data_creazione AS email_data,
                 (SELECT COUNT(*) FROM voci_tempo v WHERE v.ticket_id = t.id) AS ore_voci
          FROM tickets t
          JOIN email_inbox i ON i.ticket_id = t.id
          WHERE ${condizioni.join(" AND ")}
          ORDER BY i.data_creazione DESC`,
    args: params,
  });

  const candidati = risultato.rows.map((r) => ({
    id: String(r.id),
    numero: String(r.numero),
    cliente: String(r.cliente ?? ""),
    from: String(r.from_email ?? ""),
    subject: String(r.subject ?? ""),
    casella: r.casella_id ? String(r.casella_id) : "(null)",
    data: r.email_data ? String(r.email_data) : null,
    oreVoci: Number(r.ore_voci ?? 0),
  }));

  console.log("=== TICKET DA EMAIL SELEZIONATI ===");
  console.log(
    `Filtri: casella=env/null` +
      (da ? ` · da ${da}` : "") +
      (a ? ` · a ${a}` : "") +
      (mittenti.length ? ` · mittenti ${mittenti.join(", ")}` : "")
  );
  if (candidati.length === 0) {
    console.log("Nessun ticket trovato.");
  } else {
    for (const c of candidati.slice(0, 200)) {
      const ore = c.oreVoci > 0 ? `  [${c.oreVoci} voci tempo]` : "";
      console.log(
        `- ${c.numero}  ${formatta(c.data)}  ${c.from}  "${c.subject.slice(0, 70)}"${ore}`
      );
    }
    if (candidati.length > 200) console.log(`... e altri ${candidati.length - 200}.`);
  }

  const conOre = candidati.filter((c) => c.oreVoci > 0);
  const daCancellare = forza ? candidati : candidati.filter((c) => c.oreVoci === 0);
  const saltati = candidati.length - daCancellare.length;

  console.log(
    `\nTotale: ${candidati.length} ticket · da cancellare: ${daCancellare.length}` +
      (saltati > 0 ? ` · saltati per ore registrate: ${saltati} (usa --forza)` : "")
  );

  if (conferma && candidati.length > 0 && !da && !a && mittenti.length === 0 && !tutti) {
    console.error(
      "\nRifiuto la cancellazione di TUTTI i ticket da email senza filtri: aggiungi --da/--a o --mittente, oppure --tutti se sei sicuro."
    );
    process.exit(1);
  }

  if (!conferma) {
    console.log("\nAnteprima solamente. Aggiungi --conferma per cancellare.");
  } else {
    let cancellati = 0;
    for (const c of daCancellare) {
      const fileAllegati = await client.execute({
        sql: `SELECT nome_file FROM allegati WHERE ticket_id = ?
              UNION
              SELECT nome_file FROM allegati_messaggi WHERE ticket_id = ?`,
        args: [c.id, c.id],
      });
      const nomiFile = fileAllegati.rows
        .map((r) => String(r.nome_file ?? ""))
        .filter(Boolean);

      await client.batch(
        [
          { sql: `DELETE FROM allegati WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM allegati_messaggi WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM technical_notes WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM messages WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM email_log WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM tickets_storico_stati WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM progetti_tickets WHERE ticket_id = ?`, args: [c.id] },
          { sql: `DELETE FROM notifications WHERE ticket_id = ?`, args: [c.id] },
          {
            sql: `UPDATE email_inbox
                  SET ticket_id = NULL, stato = 'ignorata', stato_triage = 'ignora',
                      correzione_umana = 'pulizia_script'
                  WHERE ticket_id = ?`,
            args: [c.id],
          },
          { sql: `DELETE FROM tickets WHERE id = ?`, args: [c.id] },
        ],
        "write"
      );

      for (const nome of nomiFile) {
        try {
          await unlink(path.join(UPLOADS_DIR, nome));
        } catch {
          /* file gia' assente */
        }
      }
      cancellati += 1;
    }
    console.log(`\nCancellati ${cancellati} ticket. Le righe di posta restano come "ignorate".`);
  }

  // -------------------------------------------------------------------------
  // 2. Orfani (figli che puntano a ticket non esistenti)
  // -------------------------------------------------------------------------
  if (orfani) {
    const regole: Array<[string, string]> = [
      ["messages", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["technical_notes", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["allegati", `ticket_id NOT IN (SELECT id FROM tickets) OR note_tecnica_id NOT IN (SELECT id FROM technical_notes)`],
      ["allegati_messaggi", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["email_log", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["tickets_storico_stati", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["progetti_tickets", `ticket_id NOT IN (SELECT id FROM tickets)`],
      ["notifications", `ticket_id IS NOT NULL AND ticket_id NOT IN (SELECT id FROM tickets)`],
    ];

    console.log("\n=== ORFANI ===");
    let totaleOrfani = 0;
    for (const [tabella, condizione] of regole) {
      const r = await client.execute(`SELECT COUNT(*) AS n FROM ${tabella} WHERE ${condizione}`);
      const n = Number(r.rows[0]?.n ?? 0);
      totaleOrfani += n;
      console.log(`- ${tabella}: ${n}`);
    }
    const inboxOrfane = await client.execute(
      `SELECT COUNT(*) AS n FROM email_inbox
       WHERE ticket_id IS NOT NULL AND ticket_id NOT IN (SELECT id FROM tickets)`
    );
    const nInbox = Number(inboxOrfane.rows[0]?.n ?? 0);
    console.log(`- email_inbox con ticket inesistente: ${nInbox}`);
    const totale = totaleOrfani + nInbox;

    if (!conferma) {
      console.log("\nAnteprima orfani. Aggiungi --conferma per eliminarli.");
    } else {
      for (const [tabella, condizione] of regole) {
        await client.execute(`DELETE FROM ${tabella} WHERE ${condizione}`);
      }
      await client.execute(
        `UPDATE email_inbox
         SET ticket_id = NULL,
             stato = CASE WHEN stato = 'processata' THEN 'ignorata' ELSE stato END,
             stato_triage = COALESCE(stato_triage, 'ignora')
         WHERE ticket_id IS NOT NULL AND ticket_id NOT IN (SELECT id FROM tickets)`
      );
      console.log(`\nOrfani eliminati (${totale}).`);
    }
  }
}

main().catch((err) => {
  console.error("Pulizia fallita:", err instanceof Error ? err.message : err);
  process.exit(1);
});

