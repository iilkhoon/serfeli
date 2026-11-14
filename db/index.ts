import { drizzle } from "drizzle-orm/sqlite-proxy";
import { getD1 } from "./sqlite";
import * as schema from "./schema";

// Drizzle over the same SQLite connection the rest of the app uses.
export function getDb() {
  return drizzle(
    async (sql, params, method) => {
      const stmt = getD1().raw.prepare(sql);
      if (method === "run") {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      const rows = stmt.all(...(params as never[])) as unknown as unknown[][];
      return { rows: method === "get" ? (rows[0] ?? []) : rows } as { rows: unknown[] };
    },
    { schema },
  );
}
