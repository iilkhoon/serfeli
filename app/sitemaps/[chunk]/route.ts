import { publicCatalog } from "../../../lib/public-data";
import { sitemapChunkXml, sitemapEntries, SITEMAP_HEADERS } from "../../../lib/seo-sitemap";
export const dynamic = "force-dynamic";
// Chunks of a large sitemap, listed by the index that /sitemap.xml serves once it is needed.
export async function GET(_req: Request, ctx: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await ctx.params;
  const c = await publicCatalog();
  if (c.dataStatus?.state === "unavailable")
    return new Response("Müvəqqəti əlçatan deyil", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" },
    });
  const xml = sitemapChunkXml(sitemapEntries(c), chunk);
  if (!xml)
    return new Response("Tapılmadı", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
