import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "Variabile TURSO_DATABASE_URL mancante. Configura il file .env.local con l'URL del database Turso."
  );
}

const tursoClient = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

type Row = Record<string, unknown>;

function prepare(sql: string) {
  const sqlFixed = sql.replace(/@([A-Za-z0-9_]+)/g, ":$1");
  return {
    async get(args?: Record<string, unknown>): Promise<Row | undefined> {
      const result = await tursoClient.execute({ sql: sqlFixed, args: args as any });
      const row = result.rows[0];
      return row ? (row as Row) : undefined;
    },
    async all(args?: Record<string, unknown>): Promise<Row[]> {
      const result = await tursoClient.execute({ sql: sqlFixed, args: args as any });
      return result.rows.map((r) => r as Row);
    },
    async run(args?: Record<string, unknown>): Promise<{ changes: number }> {
      const result = await tursoClient.execute({ sql: sqlFixed, args: args as any });
      return { changes: result.rowsAffected };
    },
  };
}

export const syncDb = {
  prepare,
  async exec(sql: string): Promise<void> {
    await tursoClient.execute(sql);
  },
  async ping(): Promise<void> {
    await tursoClient.execute("SELECT 1");
  },
  client: tursoClient,
};
