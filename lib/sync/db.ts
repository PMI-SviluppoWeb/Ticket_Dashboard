import { createClient } from "@libsql/client";

// Lettura lazy delle env: gli import vengono hoistati prima di dotenv.config(),
// quindi non leggere process.env a livello di modulo.
function getUrl(): string {
  return process.env.TURSO_DATABASE_URL || "";
}

function getToken(): string {
  return process.env.TURSO_AUTH_TOKEN || "";
}

type TursoClient = ReturnType<typeof createClient>;
let cachedClient: TursoClient | null | undefined;

function getClient(): TursoClient | null {
  const url = getUrl();
  if (!url) return null;
  if (cachedClient === undefined) {
    cachedClient = createClient({ url, authToken: getToken() || undefined });
  }
  return cachedClient;
}

function requireClient(): TursoClient {
  const client = getClient();
  if (!client) {
    throw new Error(
      "TURSO_DATABASE_URL mancante: impossibile accedere al database Turso. Verifica il caricamento di .env.local."
    );
  }
  return client;
}

type Row = Record<string, unknown>;

function prepare(sql: string) {
  const sqlFixed = sql.replace(/@([A-Za-z0-9_]+)/g, ":$1");
  return {
    async get(args?: Record<string, unknown>): Promise<Row | undefined> {
      const client = requireClient();
      const result = await client.execute({ sql: sqlFixed, args: args as any });
      const row = result.rows[0];
      return row ? (row as Row) : undefined;
    },
    async all(args?: Record<string, unknown>): Promise<Row[]> {
      const client = requireClient();
      const result = await client.execute({ sql: sqlFixed, args: args as any });
      return result.rows.map((r) => r as Row);
    },
    async run(args?: Record<string, unknown>): Promise<{ changes: number }> {
      const client = requireClient();
      const result = await client.execute({ sql: sqlFixed, args: args as any });
      return { changes: result.rowsAffected };
    },
  };
}

export const syncDb = {
  prepare,
  async exec(sql: string): Promise<void> {
    await requireClient().execute(sql);
  },
  async ping(): Promise<void> {
    await requireClient().execute("SELECT 1");
  },
  get client(): TursoClient {
    return requireClient();
  },
  get hasConnection(): boolean {
    return !!getUrl();
  },
};
