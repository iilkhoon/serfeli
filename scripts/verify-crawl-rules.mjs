import assert from "node:assert/strict";
import fs from "node:fs";
import { robotsAllowed, robotsCrawlDelayMs, robotsSitemaps } from "../lib/robots.ts";
import {
  parseSitemap,
  isProductCandidate,
  sourceUrlAllowed,
  discoverCategoryLinks,
  categoryPagesFromSitemap,
} from "../lib/crawl-sources.ts";
const robots =
  "User-agent: *\nDisallow: /catalog/\nDisallow: /*?dir*\nDisallow: /secret$\nAllow: /catalog/public/\n";
assert(robotsAllowed(robots, "/soyuducu-test"));
assert(!robotsAllowed(robots, "/catalog/item"));
assert(robotsAllowed(robots, "/catalog/public/item"));
assert(!robotsAllowed(robots, "/item?dir=asc"));
assert(robotsAllowed(robots, "/item?page=2"));
assert(!robotsAllowed(robots, "/secret"));
assert(robotsAllowed(robots, "/secret-more"));
assert(robotsAllowed("User-agent: *\nDisallow: /\nUser-agent: QepikBot\nAllow: /", "/item"));
assert(
  !robotsAllowed(
    "User-agent: *\nAllow: /\nUser-agent: QepikBot\nDisallow: /private/",
    "/private/test",
  ),
);
assert(robotsAllowed("User-agent: OtherBot\nDisallow: /", "/item"));
assert.throws(() => parseSitemap("<!DOCTYPE xml><urlset></urlset>"));
assert.throws(() => parseSitemap("<html>Blocked</html>"));
assert.throws(() => parseSitemap("<urlset><url><loc>https://soliton.az/item</loc></url>"));
assert.deepEqual(
  parseSitemap("<urlset><url><loc>https://soliton.az/item?a=1&amp;b=2</loc></url></urlset>").locs,
  ["https://soliton.az/item?a=1&b=2"],
);
assert(isProductCandidate("baku", "https://bakuelectronics.az/mehsul/test-123"));
assert(!isProductCandidate("baku", "https://bakuelectronics.az/catalog/test"));
assert(!sourceUrlAllowed("baku", "https://bakuelectronics.az.evil.example/item"));
assert(!isProductCandidate("mgstore", "https://mgstore.az/catalog/product/view/id/1"));
assert(!isProductCandidate("soliton", "https://soliton.az/az/pages/info.html"));
const links = discoverCategoryLinks(
  "bytelecom",
  "https://bytelecom.az/category/test",
  '<a href="/az/products/item">Product</a><a href="?page=2">Next</a><a href="https://evil.example/az/products/x">Bad</a>',
);
assert.equal(links.products.length, 1);
assert.equal(links.pages.length, 1);
// An empty "Disallow:" ends a group: the next User-agent block must not be merged into it.
assert(
  robotsAllowed("User-agent: *\nDisallow:\n\nUser-agent: BadBot\nDisallow: /\n", "/item"),
  "rules for another bot must not apply to QepikBot",
);
assert(!robotsAllowed("User-agent: Googlebot\nDisallow:\n\nUser-agent: *\nDisallow: /\n", "/item"));
assert(robotsAllowed("User-agent: *\nCrawl-delay: 5\nUser-agent: Foo\nDisallow: /\n", "/x"));
assert.equal(robotsCrawlDelayMs("User-agent: *\nCrawl-delay: 30\nDisallow: /cart\n"), 30000);
assert.equal(robotsCrawlDelayMs("User-agent: *\nCrawl-delay: 2.5\n"), 2500);
assert.equal(robotsCrawlDelayMs("User-agent: OtherBot\nCrawl-delay: 30\n"), 0);
assert.equal(robotsCrawlDelayMs("User-agent: *\nDisallow: /x\n"), 0);
// Live robots.txt of mgstore.az (2026-10-31): products allowed, the advertised sitemaps listed.
const mgRobots =
  "User-agent: *\nDisallow: */search\nDisallow: /catalog/\nDisallow: /*?dir*\nDisallow: /media/x\n\nSitemap: https://mgstore.az/media/sitemap/sitemap_az.xml\nSitemap: https://mgstore.az/media/sitemap/sitemap_ru.xml\n";
assert(robotsAllowed(mgRobots, "/tozsoran-philips-fc9351-01"));
assert.deepEqual(robotsSitemaps(mgRobots), [
  "https://mgstore.az/media/sitemap/sitemap_az.xml",
  "https://mgstore.az/media/sitemap/sitemap_ru.xml",
]);
// Product URL rules confirmed against the live sitemaps/pages on 2026-10-31.
assert(
  isProductCandidate(
    "compstore",
    "https://compstore.az/asus-rog-zephyrus-g16-oled-gu606ax-tb100w-90nr0pe2-m005t0-gaming-laptop.html",
  ),
);
assert(!isProductCandidate("compstore", "https://compstore.az/ru/asus-geforce-rtx-3080.html"));
assert(isProductCandidate("mgstore", "https://mgstore.az/tozsoran-philips-fc9351-01"));
assert(!isProductCandidate("mgstore", "https://mgstore.az/meiset-texnikasi/metbex-texnikasi"));
assert(!isProductCandidate("mgstore", "https://mgstore.az/"));
assert(!isProductCandidate("mgstore", "https://mgstore.az/checkout"));
assert(isProductCandidate("bytelecom", "https://bytelecom.az/az/products/asus-tuf-gaming-core-i5"));
assert(!isProductCandidate("bytelecom", "https://bytelecom.az/az/products/a/b"));
// bytelecom.az: the sitemap's /category/<slug> URLs redirect to the home page; the live category
// page is /az/category/<slug>.
assert.deepEqual(
  categoryPagesFromSitemap("bytelecom", [
    "https://bytelecom.az/category/noutbuklar",
    "https://bytelecom.az/category/mouse/",
    "https://bytelecom.az/page/about",
  ]),
  ["https://bytelecom.az/az/category/noutbuklar", "https://bytelecom.az/az/category/mouse"],
);
assert.deepEqual(categoryPagesFromSitemap("compstore", ["https://compstore.az/category/x"]), []);
// Real bytelecom category page: 16 product links and Livewire page buttons (gotoPage) that are
// served by a plain GET with ?page=N.
const byCategory = discoverCategoryLinks(
  "bytelecom",
  "https://bytelecom.az/az/category/mouse",
  fs.readFileSync("scripts/fixtures/bytelecom-category.html", "utf8"),
);
assert.equal(byCategory.products.length, 16);
assert(byCategory.products.every((u) => u.startsWith("https://bytelecom.az/az/products/")));
assert.deepEqual(byCategory.pages, [
  "https://bytelecom.az/az/category/mouse?page=2",
  "https://bytelecom.az/az/category/mouse?page=3",
]);
// Sitemap sources: only the Azerbaijani product page of each product is a candidate.
for (const [id, yes, no] of [
  ["texnohome", "https://texnohome.az/az/product/x-1", "https://texnohome.az/ru/product/x-1"],
  ["telehome", "https://telehome.az/az/mehsul/x", "https://telehome.az/en/mehsul/x"],
  ["smarton", "https://smarton.az/mehsullar/x", "https://smarton.az/produkty/x"],
  ["ultrastore", "https://ultrastore.az/printer-x-az", "https://ultrastore.az/printer-x-ru"],
  ["minorstore", "https://minorstore.az/product/1795-x", "https://minorstore.az/ru/product/1795-x"],
  ["okim", "https://okim.az/telefon-x", "https://okim.az/telefon-planshetler/telefon-x"],
  ["almali", "https://almali.az/product/x/", "https://almali.az/shop/"],
  ["eraelectronics", "https://eraelectronics.az/x/", "https://eraelectronics.az/index.php?route=x"],
  ["smeg", "https://smeg.az/ovens/tproduct/1-x", "https://smeg.az/ovens"],
  ["mobifon", "https://www.mobifon.az/az/a/b/p/x", "https://www.mobifon.az/az/smart-saatlar"],
  ["bestel", "https://bestel.az/noutbuklar/x", "https://bestel.az/brand/kingston"],
  ["worldtelecom", "https://www.w-t.az/a/b/x+p1", "https://www.w-t.az/hediyye-kartlari/wt/x+p2"],
]) {
  assert(isProductCandidate(id, yes), id + " " + yes);
  assert(!isProductCandidate(id, no), id + " " + no);
}
// Sources without a product sitemap follow category pages; bestel and w-t add numbered pages.
const bestel = discoverCategoryLinks(
  "bestel",
  "https://bestel.az/noutbuklar",
  '<a href="/noutbuklar/x">P</a><a href="/monitorlar">C</a><a href="/basket">B</a><button aria-label="Go to page 3"></button>',
);
assert.deepEqual(bestel.products, ["https://bestel.az/noutbuklar/x"]);
assert.deepEqual(bestel.pages.sort(), [
  "https://bestel.az/monitorlar",
  "https://bestel.az/noutbuklar?page=2",
  "https://bestel.az/noutbuklar?page=3",
]);
const wt = (url, html) => discoverCategoryLinks("worldtelecom", url, html).pages;
assert.deepEqual(wt("https://www.w-t.az/k2+telefonlar?page=2", '<a href="/a/x+p1">P</a>'), [
  "https://www.w-t.az/k2+telefonlar?page=3",
]);
assert.deepEqual(wt("https://www.w-t.az/k2+telefonlar?page=9", "<p>Boşdur</p>"), []);
assert.deepEqual(wt("https://www.w-t.az/", '<a href="/k42+aspiratorlar/bosch+m78">F</a>'), []);
console.log(
  "PASS: Robots wildcards/query rules, specific agents, longest Allow rule, XML safety, source boundaries, product/category separation and pagination links, robots group boundaries, Crawl-delay, advertised sitemaps, live-verified Compstore/MG/Bytelecom URL rules, Bytelecom category rewrite and Livewire paging.",
);
