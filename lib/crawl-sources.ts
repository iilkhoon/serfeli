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
  // Sitemap + product page sources. JSON-LD/microdata pages use extractProduct; almali, okim,
  // eraelectronics, mobifon and bestel have readers in lib/html-products.ts.
  ...[
    {
      id: "xiaomi-store",
      name: "Xiaomi Aləmi",
      root: "https://xiaomi.az/index.php?route=extension/feed/google_sitemap",
    },
    { id: "ultrastore", name: "UltraStore", root: "https://ultrastore.az/sitemap.xml" },
    {
      id: "eraelectronics",
      name: "ERA Electronics",
      root: "https://eraelectronics.az/index.php?route=extension/feed/google_sitemap",
    },
    { id: "okim", name: "Okim", root: "https://okim.az/sitemap.xml" },
    { id: "smeg", name: "Smeg Azərbaycan", root: "https://smeg.az/sitemap-store.xml" },
    { id: "texnohome", name: "Texno Home", root: "https://texnohome.az/sitemap.xml" },
    { id: "telehome", name: "Telehome", root: "https://telehome.az/sitemap.xml" },
    { id: "nano", name: "NANO ICT", root: "https://nano.az/sitemap.xml" },
    { id: "minorstore", name: "Minor Electronics", root: "https://minorstore.az/sitemap.xml" },
    { id: "digitalhome", name: "Digital Home / oneX", root: "https://digitalhome.az/sitemap.xml" },
    { id: "almali", name: "Almalı", root: "https://almali.az/sitemap_index.xml" },
  ].map((s) => ({ ...s, refreshHours: 24 })),
  // robots.txt asks for Crawl-delay: 30.
  {
    id: "smarton",
    name: "Smarton",
    root: "https://smarton.az/sitemap.xml",
    intervalMs: 30000,
    refreshHours: 24,
  },
  // No sitemap: product links are collected from the home page and category pages
  // (isCategoryPage), then every product page is read.
  {
    id: "mobifon",
    name: "Mobifon",
    root: "https://www.mobifon.az/",
    listingStart: "https://www.mobifon.az/",
    refreshHours: 24,
  },
  {
    id: "bestel",
    name: "Bestel",
    root: "https://bestel.az/",
    listingStart: "https://bestel.az/",
    refreshHours: 24,
  },
  // w-t.az has a sitemap, but it only lists 2023 URLs of discontinued products.
  {
    id: "worldtelecom",
    name: "World Telecom",
    root: "https://www.w-t.az/",
    listingStart: "https://www.w-t.az/",
    refreshHours: 24,
  },
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
const productPaths: Record<string, RegExp> = {
  // OpenCart: products at /<category>/<product>; the few /<category>/<sub> pages fail extraction.
  "xiaomi-store": /^\/[^/]+\/[^/]+(?:\/[^/]+)?$/,
  // Azerbaijani pages end in -az, Russian ones in -ru.
  ultrastore: /^\/[^/]+-az$/,
  eraelectronics: /^\/[^/]+\/$/,
  // The canonical product URL is one segment; the sitemap repeats it under category paths.
  okim: /^\/[^/]+$/,
  smeg: /^\/[^/]+\/tproduct\/\d+-[^/]+$/,
  texnohome: /^\/az\/product\/[^/]+$/,
  telehome: /^\/az\/mehsul\/[^/]+$/,
  nano: /^\/mehsul\/[^/]+$/,
  minorstore: /^\/product\/\d+-[^/]+$/,
  digitalhome: /^\/products\/[^/]+$/,
  almali: /^\/product\/[^/]+\/$/,
  smarton: /^\/mehsullar\/[^/]+$/,
  mobifon: /^\/az\/(?:[^/]+\/)+p\/[^/]+$/,
  bestel: /^\/(?!ru\/|en\/|brand\/)[^/]+\/[^/]+$/,
  // Gift cards (/hediyye-kartlari/…) are not comparable products.
  worldtelecom: /^\/(?!hediyye-kartlari\/)(?:[^/]+\/)*[^/]+\+p\d+$/,
};
// Category pages followed from the start page by sources without a product sitemap.
const categoryPaths: Record<string, RegExp> = {
  mobifon: /^\/az\/(?!esas-sehife)[^/]+(?:\/[^/]+)?$/,
  bestel: /^\/(?!ru$|en$|login|register|cart|basket|wishlist|compare|checkout|profile)[a-z0-9-]+$/,
  // "/k2+mobil-telefonlar"; brand filters ("/k42+aspiratorlar/bosch+m78") are not followed.
  worldtelecom: /^\/k\d+\+[^/]+$/,
};
export function isCategoryPage(sourceId: string, raw: string) {
  const u = new URL(raw);
  const rule = categoryPaths[sourceId];
  return (
    !!rule &&
    !u.search &&
    sourceUrlAllowed(sourceId, raw) &&
    !isProductCandidate(sourceId, raw) &&
    rule.test(u.pathname)
  );
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
  // bytelecom.az product pages are /az/products/<slug> (checked 2026-10-31).
  if (sourceId === "bytelecom") return /^\/az\/products\/[^/]+\/?$/.test(path);
  // mgstore.az (Magento): products sit at /<url-key>; deeper paths are the category tree
  // (sitemap_az-2-*.xml, checked 2026-10-31). Single-segment landing pages fail the Product check.
  if (sourceId === "mgstore")
    return (
      /^\/[^/.]+$/.test(path) &&
      !/^\/(?:checkout|customer|wishlist|catalogsearch|search|compare|cart)$/.test(path)
    );
  if (sourceId === "ispace") return /^\/product\/[^/]+$/.test(path);
  // compstore.az: sitemap-posts.xml lists AZ products as /<slug>.html and RU ones under /ru/.
  if (sourceId === "compstore") return /^\/[^/]+\.html$/.test(path);
  // Unverified: smartelectronics.az answers every request (robots.txt included) with a Cloudflare
  // challenge (HTTP 403, 2026-10-31), so its runs stop as blocked before this rule is used.
  if (sourceId === "smartelectronics") return /^\/az\/mehsullar\/[^/]+\/?$/.test(path);
  // Multilingual sitemaps list every product once per language; only the Azerbaijani page is read.
  const rule = productPaths[sourceId];
  if (rule) return rule.test(path);
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
// Category pages to read from a product-page source's sitemap (only sources whose sitemap lists no
// products). bytelecom.az: category-sitemap.xml lists /category/<slug>, which 302-redirects to the
// home page (checked 2026-10-31); the live category page is /az/category/<slug>.
export function categoryPagesFromSitemap(sourceId: string, locs: string[]) {
  if (sourceId !== "bytelecom") return [];
  const pages = new Set<string>();
  for (const raw of locs) {
    const u = new URL(raw);
    const slug = u.pathname.match(/^\/(?:az\/)?category\/([^/]+)\/?$/)?.[1];
    if (!slug || u.search) continue;
    pages.add(new URL("/az/category/" + slug, u.origin).href);
  }
  return [...pages];
}
const maxCategoryPage = 100;
export function discoverCategoryLinks(sourceId: string, url: string, html: string) {
  const products = new Set<string>(),
    pages = new Set<string>();
  const base = new URL(url);
  const addPage = (n: number) => {
    if (!(n > 1 && n <= maxCategoryPage)) return;
    const next = new URL(base.pathname, base.origin);
    next.searchParams.set("page", String(n));
    pages.add(next.href);
  };
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1].trim().replace(/&amp;/g, "&"), url);
      if (!sourceUrlAllowed(sourceId, u.href)) continue;
      u.hash = "";
      if (isProductCandidate(sourceId, u.href)) products.add(u.href);
      else if (isCategoryPage(sourceId, u.href)) pages.add(u.href);
      else if (
        u.pathname === base.pathname &&
        [...u.searchParams.keys()].every((k) => k === "page")
      )
        addPage(Number(u.searchParams.get("page")));
    } catch {}
  }
  // Livewire paginators render buttons (wire:click="gotoPage(2, 'page')") instead of links; the
  // same page is served for a plain GET with ?page=N (bytelecom.az, checked 2026-10-31).
  for (const m of html.matchAll(/wire:click\s*=\s*["']gotoPage\(\s*(\d+)\s*,\s*'page'\s*\)["']/gi))
    addPage(Number(m[1]));
  // bestel.az renders its pager as buttons ("Go to page 7") without links; ?page=N is served by the
  // server, so the numbered pages are added from the highest page label.
  if (sourceId === "bestel" && products.size && isCategoryPage(sourceId, url.split("?")[0])) {
    const last = Math.max(
      0,
      ...[...html.matchAll(/aria-label\s*=\s*["'](?:Go to )?page (\d+)["']/gi)].map((m) =>
        Number(m[1]),
      ),
    );
    const base = new URL(url);
    if (!base.search)
      for (let n = 2; n <= Math.min(last, 100); n++) pages.add(base.href + "?page=" + n);
  }
  // w-t.az loads further pages with its "load more" script; the same pages are served for
  // ?page=N, and a page past the end has no products, which ends the chain.
  if (sourceId === "worldtelecom" && products.size) {
    const base = new URL(url);
    const page = Number(base.searchParams.get("page") || 1);
    const keys = [...base.searchParams.keys()];
    if (
      isCategoryPage(sourceId, base.origin + base.pathname) &&
      keys.every((k) => k === "page") &&
      page < 100
    )
      pages.add(base.origin + base.pathname + "?page=" + (page + 1));
  }
  return { products: [...products], pages: [...pages] };
}
