import vinext from "vinext";
import { defineConfig } from "vite";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { localAuth } from "./scripts/vite/local-auth-plugin";

// Local D1 data in .wrangler/state is keyed by this id; keep it so the local catalog survives.
const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

const workerConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // Drives lib/crawl-jobs.ts tickDueCrawlJobs from worker/index.ts.
  triggers: { crons: ["* * * * *"] },
  d1_databases: [{ binding: "DB", database_name: "qepik-d1", database_id: LOCAL_DATABASE_ID }],
};

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      localAuth(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: workerConfig,
      }),
    ],
  };
});
