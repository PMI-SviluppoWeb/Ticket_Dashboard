import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Crittografia AES-256-GCM per le password delle caselle email.
//
// Le credenziali STANNO nel DB (scelta esplicita: configurazione completa
// dall'applicazione), ma cifrate con una chiave che vive solo in env
// (ENCRYPTION_KEY): senza quella chiave i valori sono leggibili solo come
// rumore. Il DB e' Turso, remoto e condiviso.
//
// Formato del valore salvato: base64(iv) . base64(tag) . base64(ciphertext)
// Nessun "server-only": il worker IMAP deve poter decifrare le password.

const ALGORITMO = "aes-256-gcm";

function chiave(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "Variabile ENCRYPTION_KEY mancante. Impostala in .env.local (almeno 32 caratteri) per usare le caselle email."
    );
  }
  // Derivazione deterministica: la stessa ENCRYPTION_KEY produce sempre la
  // stessa chiave AES-256, indipendentemente dalla lunghezza dichiarata.
  return createHash("sha256").update(secret, "utf8").digest();
}

export function cifraSecret(testo: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, chiave(), iv);
  const ciphertext = Buffer.concat([cipher.update(testo, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decifraSecret(valore: string): string {
  const parti = valore.split(".");
  if (parti.length !== 3) {
    throw new Error("Valore cifrato non valido (formato atteso iv.tag.ciphertext).");
  }
  const [ivB64, tagB64, dataB64] = parti;
  const decipher = createDecipheriv(ALGORITMO, chiave(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptionKeyConfigurata(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}
