import { config } from "dotenv";
import { resolve } from "path";
import { ImapFlow } from "imapflow";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

// Controlla cosa c'e' davvero nella casella env: UID non letti e relativi
// oggetti, per capire se la email di test e' arrivata e perche' il worker
// non la vede.
async function main() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) throw new Error("IMAP_* mancanti in .env");

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.IMAP_PORT ?? "993", 10),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const unseen = await client.search({ seen: false });
    const lista = unseen === false ? [] : unseen;
    console.log(`UID totali nella casella: (search all)`);
    const all = await client.search({ all: true });
    const tutti = all === false ? [] : all;
    console.log(`  max UID: ${tutti.length ? Math.max(...tutti) : 0} (high water mark worker: 16712)`);
    console.log(`UID NON LETTI: ${lista.length ? lista.join(", ") : "nessuno"}`);

    const nuovi = lista.filter((uid) => uid > 16712);
    if (nuovi.length === 0) {
      console.log("-> Nessun UID > 16712: la email di test NON e' in questa casella (o e' gia' letta).");
    } else {
    for (const uid of nuovi) {
        const msg = await client.fetchOne(uid, { envelope: true, uid: true });
        if (!msg) continue;
        console.log(
          `  UID ${uid}: "${msg.envelope?.subject ?? "?"}" da ${msg.envelope?.from?.[0]?.address ?? "?"} il ${msg.envelope?.date?.toISOString() ?? "?"}`
        );
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATALE:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
