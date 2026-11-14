// Runs once when the server starts (vinext/Next instrumentation hook). It loads the public catalog
// so the first visitor does not wait for it, and with CRON_ENABLED=1 it drives the sitemap import
// every minute (lib/cron.ts). `npm run dev` leaves the cron off unless CRON_ENABLED is set.
export async function register() {
  const { publicCatalog } = await import("./lib/public-data");
  void publicCatalog();
  if (process.env.CRON_ENABLED !== "1") return;
  const { startCrawlCron } = await import("./lib/cron");
  startCrawlCron();
}
