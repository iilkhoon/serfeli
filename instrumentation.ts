// Runs once when the server starts (vinext/Next instrumentation hook). With CRON_ENABLED=1 it drives
// the sitemap import every minute, the job the Cloudflare cron trigger used to do. It runs in the
// production server only; `npm run dev` leaves it off unless CRON_ENABLED is set.
export async function register() {
  if (process.env.CRON_ENABLED !== "1") return;
  const { startCrawlCron } = await import("./lib/cron");
  startCrawlCron();
}
