// Copies the bundled catalog (lib/catalog-storage.ts) into the SQLite database. The server's import
// cron does the same step by step, so this only makes a fresh database show products at once.
// Safe to re-run: a finished catalog is skipped.
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const { createServer } = await import("vite");
const vite = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { getD1 } = await vite.ssrLoadModule("/db/sqlite.ts");
  const { materializeCatalog } = await vite.ssrLoadModule("/lib/catalog-storage.ts");
  const db = getD1();
  let status = await materializeCatalog(db);
  let last = -1;
  while (!status.complete) {
    status = await materializeCatalog(db);
    const pct = Math.floor((status.cursor / status.total) * 100);
    if (pct >= last + 10) {
      console.log(`Kataloq bazaya yazılır: ${status.cursor}/${status.total} (${pct}%)`);
      last = pct;
    }
  }
  console.log(`Kataloq hazırdır: ${status.total} qeyd.`);
} finally {
  await vite.close();
}
