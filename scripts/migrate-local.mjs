// Applies drizzle/*.sql to the local D1 database in .wrangler/state.
// Wrangler records applied files in d1_migrations, so running this again only applies new ones.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./local-env.mjs";

const builtConfig = path.join(projectRoot, "dist/server/wrangler.json");
if (!existsSync(builtConfig)) {
  console.error("dist/server/wrangler.json yoxdur. Əvvəlcə `npm run build` işlədin.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(builtConfig, "utf8"));
for (const db of config.d1_databases ?? []) {
  db.migrations_dir = path.join(projectRoot, "drizzle");
}
const migrateConfig = path.join(path.dirname(builtConfig), "wrangler.migrate.json");
writeFileSync(migrateConfig, JSON.stringify(config));

const result = spawnSync(
  process.execPath,
  [
    path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    migrateConfig,
    "--persist-to",
    path.join(projectRoot, ".wrangler/state"),
  ],
  { stdio: "inherit", env: { ...process.env, CI: "true" } },
);
process.exit(result.status ?? 1);
