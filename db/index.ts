import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Run the app through Vite/Wrangler with the D1 binding named `DB` (see vite.config.ts).",
    );
  }

  return drizzle(env.DB, { schema });
}
