import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { tickDueCrawlJobs } from "../lib/crawl-jobs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  // Cron trigger (see vite.config.ts): keeps sitemap import jobs moving without the admin panel open.
  scheduled(_controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (!env.DB) return;
    ctx.waitUntil(
      tickDueCrawlJobs(env.DB).then(
        (r) => {
          if (r.errors) console.error("Cron idxal: iş xətaları", r);
          else if (r.ticks) console.log("Cron idxal:", r);
        },
        (e) => console.error("Cron idxal xətası:", e instanceof Error ? e.message : e),
      ),
    );
  },
};

export default worker;
