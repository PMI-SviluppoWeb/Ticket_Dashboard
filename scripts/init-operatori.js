const { createClient } = require("@libsql/client");
const crypto = require("crypto");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("TURSO_DATABASE_URL non configurato");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.randomBytes(16);
  const key = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);
  return Buffer.from(combined).toString("base64");
}

async function initOperatori() {
  const operatori = [
    { email: "mario.rossi@azienda.it", password: "mario123456", nome: "Mario Rossi", ruolo: "operatore" },
    { email: "laura.bianchi@azienda.it", password: "laura123456", nome: "Laura Bianchi", ruolo: "operatore" },
  ];

  for (const op of operatori) {
    const existing = await client.execute({
      sql: "SELECT id FROM operatori WHERE email = ?",
      args: [op.email],
    });

    if (existing.rows.length > 0) {
      console.log(`Operatore ${op.nome} già esistente:`, existing.rows[0].id);
      continue;
    }

    const password_hash = await hashPassword(op.password);
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO operatori (id, nome, email, password_hash, ruolo, attivo, data_creazione)
            VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [id, op.nome, op.email, password_hash, op.ruolo, ts],
    });

    console.log(`Operatore ${op.nome} creato con successo!`);
    console.log("Email:", op.email);
    console.log("Password:", op.password);
    console.log("ID:", id);
    console.log("---");
  }
}

initOperatori().catch(console.error);