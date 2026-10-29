// refreshHours: the cron driver starts a new run once the last finished run is this old.
// listing: products are read from category pages (see lib/listing-sources.ts), not one per URL.
export const storeApiFields =
  "id,name,permalink,sku,type,variation,prices,images,categories,brands,attributes,is_in_stock,has_options,is_purchasable";
export const crawlSources: {
  id: string;
  name: string;
  root: string;
  intervalMs?: number;
  refreshHours: number;
  listing?: boolean;
  // First category page for listing sources that do not expose categories in their sitemap.
  listingStart?: string;
  // The listing pages are the HTML fragments the store's own "load more" button requests.
  listingFragment?: boolean;
  // The listing pages are WooCommerce Store API JSON.
  listingJson?: boolean;
}[] = [
  {
    id: "technomania",
    name: "Technomania",
    root: "https://technomania.az/api/catalog/feed?format=json",
    refreshHours: 1,
    listing: true,
    listingJson: true,
    listingStart: "https://technomania.az/api/catalog/feed?format=json",
  },
  // robots.txt asks for Crawl-delay: 30.
  {
    id: "irshad",
    name: "İrşad",
    root: "https://irshad.az/sitemap.xml",
    intervalMs: 30000,
    refreshHours: 24,
    listing: true,
    listingStart: "https://irshad.az/az/products/list?q=&direction=asc&sort=id",
    listingFragment: true,
  },
  {
    id: "baku",
    name: "Baku Electronics",
    root: "https://bakuelectronics.az/sitemap.xml",
    refreshHours: 24,
    listing: true,
  },
  { id: "ispace", name: "iSpace", root: "https://ispace.az/sitemap.xml", refreshHours: 24 },
  {
    id: "compstore",
    name: "Compstore",
    root: "https://compstore.az/sitemap.xml",
    refreshHours: 24,
  },
  {
    id: "smartelectronics",
    name: "Smart Electronics",
    root: "https://smartelectronics.az/az/sitemap_az.xml",
    refreshHours: 24,
  },
  {
    id: "mgstore",
    name: "Music Gallery",
    root: "https://mgstore.az/media/sitemap/sitemap_az.xml",
    refreshHours: 72,
  },
  { id: "soliton", name: "Soliton", root: "https://soliton.az/sitemap.xml", refreshHours: 72 },
  {
    id: "bytelecom",
    name: "Bytelecom",
    root: "https://bytelecom.az/sitemap.xml",
    refreshHours: 72,
  },
  { id: "alinino", name: "Ali & Nino", root: "https://alinino.az/sitemap.xml", refreshHours: 168 },
  // Public WooCommerce Store API catalogs, 100 products per request. Same stores as
  // storeApiSources in lib/woocommerce.ts (kept dependency-free; verify-listing checks they agree).
  ...[
    { id: "techbar", origin: "https://techbar.az", name: "Techbar" },
    { id: "casio", origin: "https://casio.az", name: "Casio Azərbaycan" },
    { id: "eurolux", origin: "https://eurolux.az", name: "Eurolux" },
    { id: "seehome", origin: "https://seehome.az", name: "SeeHome" },
    { id: "allstar", origin: "https://allstar.az", name: "Allstar" },
  ].map((s) => ({
    id: s.id,
    name: s.name,
    root: s.origin + "/sitemap.xml",
    refreshHours: 24,
    listing: true,
    listingJson: true,
    // techbar.az and eurolux.az disallow per_page= and orderby= in robots.txt, so they are read
    // with the API defaults (10 per page).
    listingStart:
      s.origin +
      "/wp-json/wc/store/v1/products?" +
      (["techbar", "eurolux"].includes(s.id) ? "" : "per_page=100&orderby=id&order=asc&") +
      "page=1&_fields=" +
      storeApiFields,
  })),
];
export function sourceUrlAllowed(sourceId: string, raw: string) {
  const source = crawlSources.find((s) => s.id === sourceId);
  if (!source) return false;
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname.replace(/^www\./, "") === new URL(source.root).hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}
export function isProductCandidate(sourceId: string, raw: string) {
  const u = new URL(raw);
  if (u.search || !sourceUrlAllowed(sourceId, raw)) return false;
  const path = u.pathname;
  if (sourceId === "irshad") return /^\/az\/mehsullar\/[^/]+\/?$/.test(path);
  if (sourceId === "baku") return path.startsWith("/mehsul/");
  if (sourceId === "alinino") return path.startsWith("/product/");
  if (sourceId === "soliton")
    return path.startsWith("/az/") && path.endsWith(".html") && !path.includes("/pages/");
  if (sourceId === "bytelecom") return path.startsWith("/az/products/");
  if (sourceId === "ispace") return /^\/product\/[^/]+$/.test(path);
  if (sourceId === "compstore") return /^\/[^/]+\.html$/.test(path);
  if (sourceId === "smartelectronics") return /^\/az\/mehsullar\/[^/]+\/?$/.test(path);
  return (
    !path.startsWith("/catalog/") &&
    !path.startsWith("/customer/") &&
    !path.startsWith("/media/") &&
    path !== "/" &&
    !path.endsWith("/")
  );
}
export function parseSitemap(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML entity qəbul edilmir.");
  if (!/<(?:sitemapindex|urlset)[\s>]/.test(xml)) throw new Error("XML sitemap formatı tapılmadı.");
  const root = /<sitemapindex[\s>]/.test(xml) ? "sitemapindex" : "urlset";
  if (!xml.includes("</" + root + ">")) throw new Error("Sitemap sənədi yarımçıqdır.");
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) =>
    m[1].trim().replace(/&amp;/g, "&"),
  );
  if (locs.length > 60000) throw new Error("Sitemap URL limiti keçildi.");
  return { index: /<sitemapindex[\s>]/.test(xml), locs };
}
export function discoverCategoryLinks(sourceId: string, url: string, html: string) {
  const products = new Set<string>(),
    pages = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1].trim().replace(/&amp;/g, "&"), url);
      if (!sourceUrlAllowed(sourceId, u.href)) continue;
      if (isProductCandidate(sourceId, u.href)) products.add(u.href);
      else if (
        u.pathname === new URL(url).pathname &&
        Number(u.searchParams.get("page")) > 1 &&
        Number(u.searchParams.get("page")) <= 100 &&
        [...u.searchParams.keys()].every((k) => k === "page")
      )
        pages.add(u.href);
    } catch {}
  }
  return { products: [...products], pages: [...pages] };
}
