// Copies the bundled catalog (lib/catalog-storage.ts) into the local D1 database in .wrangler/state.
// In production the Worker cron does this step by step; local wrangler dev does not run crons,
// so without this the local site shows 0 products. Safe to re-run: finished catalogs are skipped.
import path from "node:path";
import { projectRoot } from "./local-env.mjs";

const { getPlatformProxy } = await import("wrangler");
const { createServer } = await import("vite");

const proxy = await getPlatformProxy({
  configPath: path.join(projectRoot, "dist/server/wrangler.json"),
  persist: { path: path.join(projectRoot, ".wrangler/state/v3") },
});
const vite = await createServer({
  configFile: false,
  root: projectRoot,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { materializeCatalog } = await vite.ssrLoadModule("/lib/catalog-storage.ts");
  let status = await materializeCatalog(proxy.env.DB);
  let last = -1;
  while (!status.complete) {
    status = await materializeCatalog(proxy.env.DB);
    const pct = Math.floor((status.cursor / status.total) * 100);
    if (pct >= last + 10) {
      console.log(`Kataloq bazaya yazılır: ${status.cursor}/${status.total} (${pct}%)`);
      last = pct;
    }
  }
  console.log(`Kataloq hazırdır: ${status.total} qeyd.`);
} finally {
  await vite.close();
  await proxy.dispose();
}
