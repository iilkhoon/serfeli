// Applies drizzle/*.sql to the SQLite database (DATABASE_PATH, default data/qepik.db).
// Applied files are recorded in d1_migrations, the same table Wrangler used for D1, so a database
// copied from the old local D1 state keeps its history. Safe to re-run: only new files apply.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = path.resolve(root, process.env.DATABASE_PATH || "data/qepik.db");
mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");
db.exec(
  "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
);
const applied = new Set(
  db
    .prepare("SELECT name FROM d1_migrations")
    .all()
    .map((r) => r.name),
);
const dir = path.join(root, "drizzle");
const pending = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && !applied.has(f))
  .sort();
for (const name of pending) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(readFileSync(path.join(dir, name), "utf8"));
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
    db.exec("COMMIT");
    console.log("Migrasiya tətbiq edildi:", name);
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("Migrasiya alınmadı:", name);
    throw e;
  }
}
if (!pending.length) console.log("Baza aktualdır:", path.relative(root, file));
db.close();
