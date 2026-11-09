import assert from "node:assert/strict";
import { register } from "node:module";

// --- Unit checks: lib/seo.ts and lib/seo-sitemap.ts, no server needed. ------------------------
// A tiny loader so the TypeScript sources (extensionless imports, JSON imports) run under Node.
const hooks = `
import fs from "node:fs";
import ts from "${import.meta.resolve("typescript")}";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (/^\\.{1,2}\\//.test(specifier) && context.parentURL?.endsWith(".ts")) {
    for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
      const url = new URL(specifier + ext, context.parentURL);
      if (fs.existsSync(fileURLToPath(url)) && fs.statSync(fileURLToPath(url)).isFile())
        return { url: url.href, shortCircuit: true, format: url.href.endsWith(".json") ? "json" : undefined };
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = ts.transpileModule(fs.readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    return { format: "module", source, shortCircuit: true };
  }
  if (url.endsWith(".json"))
    return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
  return next(url, context);
}`;
register("data:text/javascript," + encodeURIComponent(hooks), import.meta.url);
const seo = await import("../lib/seo.ts");
const sm = await import("../lib/seo-sitemap.ts");
const { SITE_URL } = seo;

const product = (id, extra = {}) => ({
  id,
  name: "Acme X10 128 GB Black",
  brand: "Acme",
  category: "telefon",
  variant: "128 GB · Black",
  image: "https://cdn.example.az/x10.webp",
  specs: { MPN: "X10-128", EAN: "4006381333931" },
  description: "Acme telefon <script>alert(1)</script>",
  active: true,
  featured: false,
  ...extra,
});
const offer = (id, productId, storeId, price, extra = {}) => ({
  id,
  productId,
  storeId,
  price,
  shipping: 0,
  months: 0,
  installmentTotal: price,
  stock: true,
  warranty: "",
  url: "https://" + storeId + ".az/p/" + productId,
  demo: false,
  checkedAt: "2026-10-20T10:00:00.000Z",
  cities: ["Bakı"],
  sponsored: false,
  ...extra,
});
const store = (id, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  domain: id + ".az",
  color: "#000",
  active: true,
  description: "",
  ...extra,
});
const c = {
  productAliases: { "old-x10": "x10" },
  products: [
    product("x10"),
    product("x20", { name: "Acme X20", variant: "256 GB", image: "/favicon.svg" }),
    product("noprice", { name: "Acme Boş", variant: "" }),
    product("gone", { active: false }),
    product("demo-only", { name: "Demo məhsul" }),
    product("oos", { name: "Acme Stoksuz", category: "audio" }),
  ],
  stores: [store("alpha"), store("beta"), store("closed", { active: false }), store("empty")],
  offers: [
    offer("o1", "x10", "alpha", 1789),
    offer("o2", "x10", "beta", 1849.5),
    offer("o3", "x10", "beta", 0),
    offer("o4", "x10", "closed", 999),
    offer("o5", "x20", "alpha", Number.NaN),
    offer("o6", "x20", "beta", 2100, { stock: false }),
    offer("o7", "demo-only", "alpha", 50, { demo: true }),
    offer("o8", "oos", "alpha", 300, { stock: false }),
    offer("o9", "noprice", "alpha", -1),
  ],
  history: [],
  reviews: [
    { id: "r1", productId: "x10", rating: 5, text: "", name: "A", status: "approved", date: "" },
    { id: "r2", productId: "x10", rating: 4, text: "", name: "B", status: "approved", date: "" },
    { id: "r3", productId: "x10", rating: 1, text: "", name: "C", status: "pending", date: "" },
  ],
  settings: { headline: "", announcement: "" },
};
const ld = (path) => JSON.parse(seo.structuredData(path, c) || "[]");
const byType = (items, type) => items.find((x) => x["@type"] === type);

// Labels do not repeat a variant the name already contains.
assert.equal(seo.productLabel(c.products[0]), "Acme X10 128 GB Black");
assert.equal(seo.productLabel(c.products[1]), "Acme X20 256 GB");
assert.equal(
  seo.productLabel(product("d", { distinction: "MPN A1" })),
  "Acme X10 128 GB Black (MPN A1)",
);

// Product metadata: unique Azerbaijani title/description with the real lowest price.
const m = seo.pageSeo("/mehsul/x10", c);
assert.equal(m.title, "Acme X10 128 GB Black qiymətləri | Qəpik");
assert.match(m.description, /2 mağazada satışdadır, ən sərfəli qiymət 1 789 ₼/);
assert(m.description.length <= 160);
assert.equal(m.alternates.canonical, SITE_URL + "/mehsul/x10");
assert.deepEqual(m.robots, { index: true, follow: true });
assert.equal(m.openGraph.url, SITE_URL + "/mehsul/x10");
assert.equal(m.openGraph.locale, "az_AZ");
assert.equal(m.openGraph.images[0].url, "https://cdn.example.az/x10.webp");
assert.equal(m.twitter.images[0], "https://cdn.example.az/x10.webp");
assert.notEqual(seo.pageSeo("/mehsul/x20", c).title, m.title);
assert.notEqual(seo.pageSeo("/mehsul/x20", c).description, m.description);
// Aliases canonicalise to the target product.
assert.equal(seo.pageSeo("/mehsul/old-x10", c).alternates.canonical, SITE_URL + "/mehsul/x10");
// Placeholder images fall back to the social card.
assert.equal(seo.pageSeo("/mehsul/x20", c).openGraph.images[0].url, SITE_URL + "/social-card.png");
// Products without any real price are thin pages: noindex.
assert.equal(seo.pageSeo("/mehsul/noprice", c).robots.index, false);
assert.equal(seo.pageSeo("/mehsul/demo-only", c).robots.index, false);
// Out-of-stock but priced: indexable, says the last recorded price.
assert.equal(seo.pageSeo("/mehsul/oos", c).robots.index, true);
assert.match(seo.pageSeo("/mehsul/oos", c).description, /son qeydə alınan qiymət 300 ₼/);

// Product JSON-LD: AggregateOffer from real priced offers only.
const items = ld("/mehsul/x10");
const p = byType(items, "Product");
assert.equal(p.offers["@type"], "AggregateOffer");
assert.equal(p.offers.priceCurrency, "AZN");
assert.equal(p.offers.lowPrice, 1789);
assert.equal(p.offers.highPrice, 1849.5);
assert.equal(p.offers.offerCount, 2);
assert.equal(p.offers.offers.length, 2);
assert(p.offers.offers.every((o) => o.price > 0 && o.priceCurrency === "AZN"));
assert(!p.offers.offers.some((o) => o.seller.name === "CLOSED"));
assert.equal(p.mpn, "X10-128");
assert.equal(p.gtin, "4006381333931");
assert.deepEqual(p.aggregateRating.ratingValue, 4.5);
assert.equal(p.aggregateRating.reviewCount, 2);
assert.equal(p.brand.name, "Acme");
const crumbs = byType(items, "BreadcrumbList").itemListElement;
assert.deepEqual(
  crumbs.map((x) => x.item),
  [SITE_URL + "/", SITE_URL + "/kateqoriya/telefon", SITE_URL + "/mehsul/x10"],
);
// NaN and zero prices never become offers; the out-of-stock one remains with OutOfStock.
const x20 = byType(ld("/mehsul/x20"), "Product");
assert.equal(x20.offers.offerCount, 1);
assert.equal(x20.offers.offers[0].availability, "https://schema.org/OutOfStock");
assert.equal(x20.image, undefined);
// No offer object at all without a real price.
assert.equal(byType(ld("/mehsul/noprice"), "Product").offers, undefined);
assert.equal(byType(ld("/mehsul/demo-only"), "Product").offers, undefined);
// Script content cannot close the <script> element.
assert(!seo.structuredData("/mehsul/x10", c).includes("</script"));
assert(!seo.structuredData("/mehsul/x10", c).includes("<"));

// Home: Organization + WebSite with SearchAction.
const home = ld("/");
assert(byType(home, "Organization"));
const site = byType(home, "WebSite");
assert.equal(site.potentialAction["@type"], "SearchAction");
assert.equal(site.potentialAction.target.urlTemplate, SITE_URL + "/axtaris?q={search_term_string}");
assert.equal(seo.pageSeo("/", c).alternates.canonical, SITE_URL);
// Category and store breadcrumbs.
assert.equal(byType(ld("/kateqoriya/telefon"), "BreadcrumbList").itemListElement.length, 3);
assert.equal(byType(ld("/magazalar/alpha"), "BreadcrumbList").itemListElement[2].name, "ALPHA");
// Private pages have no structured data.
assert.equal(seo.structuredData("/admin", c), "");

// Robots: search, account, filters and empty pages are noindex.
assert.deepEqual(seo.pageSeo("/admin", c).robots, { index: false, follow: false });
assert.deepEqual(seo.pageSeo("/axtaris?q=iphone", c).robots, { index: false, follow: true });
assert.match(seo.pageSeo("/axtaris?q=iphone", c).title, /“iphone” üçün axtarış/);
assert.equal(seo.pageSeo("/kataloq", c).robots.index, true);
assert.equal(seo.pageSeo("/kataloq?sort=low", c).robots.index, false);
assert.equal(seo.pageSeo("/kataloq?sort=low", c).alternates.canonical, SITE_URL + "/kataloq");
assert.equal(seo.pageSeo("/kateqoriya/telefon?brand=Acme", c).robots.index, false);
assert.equal(seo.pageSeo("/mehsul/x10?utm_source=x", c).robots.index, false);
assert.equal(
  seo.pageSeo("/mehsul/x10?utm_source=x", c).alternates.canonical,
  SITE_URL + "/mehsul/x10",
);
// Real pagination keeps its own canonical and title; page=1 and junk collapse to the base URL.
const page2 = seo.pageSeo("/kateqoriya/telefon?page=2", c);
assert.equal(page2.alternates.canonical, SITE_URL + "/kateqoriya/telefon?page=2");
assert.equal(page2.robots.index, true);
assert.match(page2.title, /səhifə 2/);
assert.equal(seo.pageSeo("/kateqoriya/telefon?page=1", c).robots.index, false);
assert.equal(
  seo.pageSeo("/kateqoriya/telefon?page=abc", c).alternates.canonical,
  SITE_URL + "/kateqoriya/telefon",
);
assert.equal(seo.pageSeo("/kateqoriya/telefon?page=2&sort=low", c).robots.index, false);
// Empty category / store.
assert.equal(seo.pageSeo("/kateqoriya/kitab", c).robots.index, false);
assert.equal(seo.pageSeo("/magazalar/empty", c).robots.index, false);
assert.equal(seo.pageSeo("/magazalar/alpha", c).robots.index, true);
assert.match(seo.pageSeo("/magazalar/alpha", c).description, /alpha\.az/);
// Static pages have distinct descriptions.
const statics = ["/", "/kataloq", "/magazalar", "/endirimler", "/rehber"].map(
  (x) => seo.pageSeo(x, c).description,
);
assert.equal(new Set(statics).size, statics.length);

// Route status: 404s, permanent redirects for aliases and upper-case slugs.
const decide = (x) => seo.routeDecision(x, c);
assert.deepEqual(decide("/mehsul/x10"), { kind: "ok" });
assert.deepEqual(decide("/mehsul/old-x10"), { kind: "redirect", to: "/mehsul/x10" });
assert.deepEqual(decide("/mehsul/old-x10?ref=a"), { kind: "redirect", to: "/mehsul/x10?ref=a" });
assert.deepEqual(decide("/mehsul/X10"), { kind: "redirect", to: "/mehsul/x10" });
assert.deepEqual(decide("/kateqoriya/Telefon"), { kind: "redirect", to: "/kateqoriya/telefon" });
assert.deepEqual(decide("/magazalar/ALPHA"), { kind: "redirect", to: "/magazalar/alpha" });
for (const bad of [
  "/mehsul/gone",
  "/mehsul/not-a-product",
  "/mehsul",
  "/mehsul/x10/extra",
  "/kateqoriya/yoxdur",
  "/kateqoriya",
  "/magazalar/closed",
  "/magazalar/alpha/extra",
  "/kataloq/extra",
  "/naməlum",
])
  assert.deepEqual(decide(bad), { kind: "notFound" }, bad);
assert.deepEqual(decide("/magazalar"), { kind: "ok" });
assert.deepEqual(decide("/axtaris?q=x"), { kind: "ok" });

// Sitemap: only indexable pages, real lastmod, XML-escaped, chunked when large.
const entries = sm.sitemapEntries(c);
const locs = entries.map((e) => e.loc);
assert(locs.includes(SITE_URL + "/mehsul/x10"));
assert(locs.includes(SITE_URL + "/mehsul/oos"));
assert(!locs.includes(SITE_URL + "/mehsul/noprice"));
assert(!locs.includes(SITE_URL + "/mehsul/gone"));
assert(!locs.includes(SITE_URL + "/mehsul/demo-only"));
assert(locs.includes(SITE_URL + "/kateqoriya/telefon"));
assert(!locs.includes(SITE_URL + "/kateqoriya/kitab"));
assert(locs.includes(SITE_URL + "/magazalar/alpha"));
assert(!locs.includes(SITE_URL + "/magazalar/closed"));
assert(!locs.includes(SITE_URL + "/magazalar/empty"));
assert(!locs.some((l) => /admin|axtaris|secilmisler|bildirisler|muqayise/.test(l)));
assert.equal(new Set(locs).size, locs.length);
assert.equal(
  entries.find((e) => e.loc.endsWith("/mehsul/x10")).lastmod,
  "2026-10-20T10:00:00.000Z",
);
const xml = sm.rootSitemapXml(entries);
assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert(xml.includes("<urlset"));
assert(sm.urlsetXml([{ loc: SITE_URL + "/a?b=1&c=2" }]).includes("/a?b=1&amp;c=2"));
const many = Array.from({ length: sm.SITEMAP_CHUNK * 2 + 5 }, (_, i) => ({
  loc: SITE_URL + "/mehsul/p" + i,
}));
const index = sm.rootSitemapXml(many);
assert(index.includes("<sitemapindex"));
assert.equal((index.match(/<sitemap>/g) || []).length, 3);
assert(index.includes(SITE_URL + "/sitemaps/3.xml"));
assert.equal((sm.sitemapChunkXml(many, "3.xml").match(/<url>/g) || []).length, 5);
assert.equal((sm.sitemapChunkXml(many, "1.xml").match(/<url>/g) || []).length, sm.SITEMAP_CHUNK);
assert.equal(sm.sitemapChunkXml(many, "4.xml"), undefined);
assert.equal(sm.sitemapChunkXml(many, "0.xml"), undefined);
assert.equal(sm.sitemapChunkXml(many, "../x"), undefined);
// robots.txt
const robots = sm.robotsTxt();
assert(robots.includes("Disallow: /admin"));
assert(robots.includes("Disallow: /api/"));
assert(robots.includes("Sitemap: " + SITE_URL + "/sitemap.xml"));
console.log("PASS (unit): SEO metadata, JSON-LD, robots rules, route status, sitemap chunks.");

if (process.env.SEO_UNIT_ONLY === "1") process.exit(0);

// --- Live checks against the dev server (fails without one, as before). ----------------------
const base = "http://127.0.0.1:5173";
const jsonLdOf = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((x) =>
    JSON.parse(x[1]),
  );
let r = await fetch(base + "/");
const homeHtml = await r.text();
assert.equal(r.status, 200);
assert(homeHtml.includes('rel="canonical"'));
assert(homeHtml.includes("application/ld+json"));
assert(homeHtml.includes("SearchAction"));
assert(homeHtml.includes('href="/mehsul/'));
assert(homeHtml.includes('class="pcard'), "home renders product cards on the server");
assert(homeHtml.includes('href="/kateqoriya/'));
const productHtml = await (await fetch(base + "/mehsul/iphone16-black")).text();
assert(productHtml.includes("AggregateOffer"));
assert(productHtml.includes("BreadcrumbList"));
assert(productHtml.includes("1789"));
assert(productHtml.includes('property="og:title"'));
assert(productHtml.includes('name="twitter:card"'));
assert(!productHtml.match(/<title>[^<]*Starter/));
const live = byType(jsonLdOf(productHtml), "Product");
assert.equal(live.offers.priceCurrency, "AZN");
assert(live.offers.lowPrice > 0 && live.offers.highPrice >= live.offers.lowPrice);
assert(live.offers.offers.every((o) => o.price > 0));
r = await fetch(base + "/mehsul/not-a-product");
assert.equal(r.status, 404);
r = await fetch(base + "/kataloq/extra-segment");
assert.equal(r.status, 404);
r = await fetch(base + "/mehsul/IPHONE16-BLACK", { redirect: "manual" });
assert([301, 307, 308].includes(r.status) || r.status === 200, "upper-case slug: " + r.status);
r = await fetch(base + "/robots.txt");
assert.equal(r.status, 200);
assert((await r.text()).includes("Disallow: /admin"));
r = await fetch(base + "/sitemap.xml");
assert.equal(r.status, 200);
let sitemap = await r.text();
// A large catalog is served as an index of chunks; read the chunks through this server.
if (sitemap.includes("<sitemapindex")) {
  const chunks = [...sitemap.matchAll(/\/sitemaps\/(\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  assert(chunks.length > 0);
  const parts = await Promise.all(
    chunks.map(async (name) => {
      const res = await fetch(base + "/sitemaps/" + name);
      assert.equal(res.status, 200);
      return res.text();
    }),
  );
  sitemap = parts.join("\n");
}
assert(sitemap.includes("/mehsul/iphone16-black"));
assert(sitemap.includes("/magazalar/technomania"));
assert(!sitemap.includes("/admin"));
r = await fetch(base + "/sitemaps/999.xml");
assert.equal(r.status, 404);
const admin = await (await fetch(base + "/admin")).text();
assert(admin.includes("noindex"));
const search = await (await fetch(base + "/axtaris?q=iphone")).text();
assert(search.includes("noindex"));
const filtered = await (await fetch(base + "/kataloq?sort=low")).text();
assert(filtered.includes("noindex"));
console.log(
  "PASS: server-rendered product links/content, unique SEO metadata, canonical, Product/AggregateOffer, breadcrumbs, OpenGraph, 404, robots, sitemap, private-page noindex. Sitemap URLs: " +
    (sitemap.match(/<loc>/g) || []).length,
);
