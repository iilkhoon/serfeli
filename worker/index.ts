import handler from "vinext/server/fetch-handler";
import { tickDueCrawlJobs } from "../lib/crawl-jobs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
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
