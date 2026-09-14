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

async function initAdmin() {
  const email = "admin@test.it";
  const password = "admin123456";
  const nome = "Admin";
  const ruolo = "admin";

  // Check if admin already exists
  const existing = await client.execute({
    sql: "SELECT id FROM operatori WHERE email = ?",
    args: [email],
  });

  if (existing.rows.length > 0) {
    console.log("Admin già esistente:", existing.rows[0].id);
    return;
  }

  const password_hash = await hashPassword(password);
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO operatori (id, nome, email, password_hash, ruolo, attivo, data_creazione)
          VALUES (?, ?, ?, ?, ?, 1, ?)`,
    args: [id, nome, email, password_hash, ruolo, ts],
  });

  console.log("Admin creato con successo!");
  console.log("Email:", email);
  console.log("Password:", password);
  console.log("ID:", id);
}

initAdmin().catch(console.error);