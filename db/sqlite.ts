// SQLite on disk (Node's built-in node:sqlite) behind the small part of the Cloudflare D1 API the
// app uses: prepare/bind/all/first/run/raw, batch (one transaction) and exec. The app was written
// against D1, and D1 is SQLite, so the queries and migrations in drizzle/ run unchanged.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type D1Meta = { changes: number; last_row_id: number; duration: number };
export type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: D1Meta;
};
type Bindable = SQLInputValue | boolean | undefined;

const READER = /^\s*(select|with|pragma|explain|values)\b/i;
const RETURNING = /\breturning\b/i;

export class D1PreparedStatement {
  constructor(
    private readonly database: D1Database,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...values: Bindable[]) {
    return new D1PreparedStatement(this.database, this.sql, values.map(toSql));
  }

  /** Runs the statement now, synchronously; used by batch() inside its transaction. */
  execute<T>(): D1Result<T> {
    const started = performance.now();
    const stmt = this.database.raw.prepare(this.sql);
    if (READER.test(this.sql) || RETURNING.test(this.sql)) {
      const results = stmt.all(...this.params) as T[];
      return result(results, 0, 0, started);
    }
    const r = stmt.run(...this.params);
    return result<T>([], Number(r.changes), Number(r.lastInsertRowid), started);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.database.raw.prepare(this.sql).get(...this.params) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return (column ? (row[column] ?? null) : { ...row }) as T | null;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const stmt = this.database.raw.prepare(this.sql);
    stmt.setReturnArrays?.(true);
    return stmt.all(...this.params) as T[];
  }
}

export class D1Database {
  constructor(readonly raw: DatabaseSync) {}

  prepare(sql: string) {
    return new D1PreparedStatement(this, sql);
  }

  // D1 runs a batch as one transaction: all statements apply, or none do.
  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((s) => s.execute<T>());
      this.raw.exec("COMMIT");
      return results;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }

  async exec(sql: string) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }
}

function toSql(value: Bindable): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function result<T>(results: T[], changes: number, lastRowId: number, started: number) {
  return {
    results,
    success: true as const,
    meta: { changes, last_row_id: lastRowId, duration: performance.now() - started },
  };
}

/** The database file: DATABASE_PATH, or data/qepik.db in the working directory. */
export function databasePath() {
  return path.resolve(process.env.DATABASE_PATH || "data/qepik.db");
}

export function openDatabase(file = databasePath()) {
  mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  // WAL lets the cron, the seed script and page requests read while one of them writes.
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;");
  return new D1Database(raw);
}

// One connection per process, kept across dev-server module reloads.
const shared = globalThis as typeof globalThis & { __qepikDb?: D1Database };
export function getD1() {
  shared.__qepikDb ??= openDatabase();
  return shared.__qepikDb;
}
