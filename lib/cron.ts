import { getD1 } from "../db/sqlite";
import { tickDueCrawlJobs } from "./crawl-jobs";

const INTERVAL_MS = 60000;
const state = globalThis as typeof globalThis & { __qepikCron?: NodeJS.Timeout };

// One tick per minute, never two at once: a slow tick simply delays the next one.
export function startCrawlCron() {
  if (state.__qepikCron) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await tickDueCrawlJobs(getD1());
      if (r.errors) console.error("Cron idxal: iş xətaları", JSON.stringify(r));
      else if (r.ticks) console.log("Cron idxal:", JSON.stringify(r));
    } catch (e) {
      console.error("Cron idxal xətası:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  state.__qepikCron = setInterval(tick, INTERVAL_MS);
  state.__qepikCron.unref?.();
  console.log("Cron idxal işə düşdü: hər dəqiqə.");
  setTimeout(tick, 5000).unref?.();
}
