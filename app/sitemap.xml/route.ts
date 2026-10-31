import { publicCatalog } from "../../lib/public-data";
import { rootSitemapXml, sitemapEntries, SITEMAP_HEADERS } from "../../lib/seo-sitemap";
export const dynamic = "force-dynamic";
export async function GET() {
  const c = await publicCatalog();
  // An empty fallback catalog must not replace the real sitemap; ask crawlers to come back.
  if (c.dataStatus?.state === "unavailable")
    return new Response("Müvəqqəti əlçatan deyil", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" },
    });
  return new Response(rootSitemapXml(sitemapEntries(c)), {
    headers: SITEMAP_HEADERS,
  });
}
