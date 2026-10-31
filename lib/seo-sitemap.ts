import { categories, type Catalog } from "./catalog";
import { SITE_URL, catalogStats, isIndexableProduct, pricedOffers } from "./seo";

// The sitemap protocol allows 50 000 URLs per file; staying well below keeps files small.
export const SITEMAP_CHUNK = 20_000;
export type SitemapEntry = { loc: string; lastmod?: string };

const latest = (dates: (string | undefined | null)[]) => {
  let best = 0;
  for (const d of dates) {
    const t = d ? Date.parse(d) : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  // Ignore clock skew: a lastmod in the future is not believable.
  return best && best <= Date.now() + 86_400_000 ? new Date(best).toISOString() : undefined;
};

// Only URLs that are indexable: the same rules pageSeo uses for robots (no empty pages).
export function sitemapEntries(c: Catalog): SitemapEntry[] {
  const stats = catalogStats(c);
  const products = c.products.filter((p) => isIndexableProduct(c, p));
  const productDates = new Map(
    products.map((p) => [p.id, latest(pricedOffers(c, p.id).map((o) => o.checkedAt))]),
  );
  const storeDates = new Map<string, string | undefined>();
  for (const s of c.stores)
    storeDates.set(
      s.id,
      latest([
        ...(c.sourceCoverage || []).filter((x) => x.storeId === s.id).map((x) => x.checkedAt),
      ]),
    );
  const newest = latest([...productDates.values()]);
  const entry = (path: string, lastmod?: string): SitemapEntry => ({
    loc: SITE_URL + path,
    ...(lastmod ? { lastmod } : {}),
  });
  return [
    entry("/", newest),
    entry("/kataloq", newest),
    entry("/magazalar"),
    entry("/endirimler"),
    entry("/rehber"),
    ...categories
      .filter((cat) => (stats.categoryProducts.get(cat.id) || 0) > 0)
      .map((cat) =>
        entry(
          "/kateqoriya/" + cat.id,
          latest(products.filter((p) => p.category === cat.id).map((p) => productDates.get(p.id))),
        ),
      ),
    ...c.stores
      .filter((s) => s.active && (stats.storeProducts.get(s.id) || 0) > 0)
      .map((s) => entry("/magazalar/" + s.id, storeDates.get(s.id))),
    ...products.map((p) => entry("/mehsul/" + encodeURIComponent(p.id), productDates.get(p.id))),
  ];
}

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function urlsetXml(entries: SitemapEntry[]) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (e) =>
          "<url><loc>" +
          escapeXml(e.loc) +
          "</loc>" +
          (e.lastmod ? "<lastmod>" + e.lastmod + "</lastmod>" : "") +
          "</url>",
      )
      .join("\n") +
    "\n</urlset>\n"
  );
}

export const sitemapChunkCount = (entries: SitemapEntry[]) =>
  Math.max(1, Math.ceil(entries.length / SITEMAP_CHUNK));
export const sitemapChunkPath = (n: number) => `/sitemaps/${n}.xml`;

export function sitemapIndexXml(entries: SitemapEntry[]) {
  const count = sitemapChunkCount(entries);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    Array.from({ length: count }, (_, i) => {
      const chunk = entries.slice(i * SITEMAP_CHUNK, (i + 1) * SITEMAP_CHUNK);
      const lastmod = latest(chunk.map((e) => e.lastmod));
      return (
        "<sitemap><loc>" +
        escapeXml(SITE_URL + sitemapChunkPath(i + 1)) +
        "</loc>" +
        (lastmod ? "<lastmod>" + lastmod + "</lastmod>" : "") +
        "</sitemap>"
      );
    }).join("\n") +
    "\n</sitemapindex>\n"
  );
}

// /sitemap.xml: a plain urlset while everything fits in one file, otherwise an index of chunks.
export function rootSitemapXml(entries: SitemapEntry[]) {
  return entries.length <= SITEMAP_CHUNK ? urlsetXml(entries) : sitemapIndexXml(entries);
}

// /sitemaps/<n>.xml; undefined for a chunk that does not exist (404).
export function sitemapChunkXml(entries: SitemapEntry[], name: string) {
  const match = /^([1-9]\d{0,4})\.xml$/.exec(name);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (n > sitemapChunkCount(entries)) return undefined;
  return urlsetXml(entries.slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK));
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=1800",
};

export function robotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /axtaris",
    "Disallow: /bildirisler",
    "Disallow: /secilmisler",
    "Disallow: /muqayise",
    "Disallow: /magaza-qeydiyyat",
    "",
    "Sitemap: " + SITE_URL + "/sitemap.xml",
    "",
  ].join("\n");
}
