import vinext from "vinext";
import { defineConfig } from "vite";
import { localAuth } from "./scripts/vite/local-auth-plugin";

// Plain Node build: `npm run build` emits dist/, `npm start` serves it with the vinext production
// server. Data lives in a SQLite file (db/sqlite.ts); the import cron runs in-process
// (instrumentation.ts).
export default defineConfig({
  plugins: [vinext(), localAuth()],
});
