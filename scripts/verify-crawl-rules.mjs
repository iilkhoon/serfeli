import assert from "node:assert/strict";
import { robotsAllowed } from "../lib/robots.ts";
import {
  parseSitemap,
  isProductCandidate,
  sourceUrlAllowed,
  discoverCategoryLinks,
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
console.log(
  "PASS: Robots wildcards/query rules, specific agents, longest Allow rule, XML safety, source boundaries, product/category separation and pagination links.",
);
