import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeOfficialFeed } from "../lib/catalog-feed.ts";
import { fetchTechnomania } from "../lib/technomania.ts";
const feed = await fetchTechnomania();
const base = {
  products: [
    { id: "iphone16-black", name: "Canonical model", active: true },
    { id: "tm-removed-0", active: true },
  ],
  offers: [
    { id: "tm-offer-removed-0", storeId: "technomania", productId: "tm-removed-0", stock: true },
    { id: "other-source", storeId: "irshad", price: 2000 },
  ],
  history: [],
  stores: [],
  settings: {},
  reviews: [],
};
const c = mergeOfficialFeed(base, feed);
assert.equal(c.products.find((p) => p.id === "iphone16-black").name, "Canonical model");
assert.equal(c.products.find((p) => p.id === "tm-removed-0").active, false);
assert.equal(c.offers.find((o) => o.id === "tm-offer-removed-0").stock, false);
assert(c.offers.some((o) => o.id === "other-source"));
assert.equal(new Set(c.products.map((p) => p.id)).size, c.products.length);
assert.equal(new Set(c.offers.map((p) => p.id)).size, c.offers.length);
assert(feed.products.every((p) => c.products.some((x) => x.id === p.id)));
assert(
  feed.offers.every((o) =>
    c.offers.some((x) => x.id === o.id && x.price === o.price && x.stock === o.stock),
  ),
);
const urls = [...new Set(feed.products.map((p) => p.image))];
const checks = [];
let at = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (at < urls.length) {
      const url = urls[at++];
      try {
        const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(12000) });
        checks.push({ url, status: r.status, type: r.headers.get("content-type") });
      } catch (e) {
        checks.push({ url, error: e.message });
      }
    }
  }),
);
const failed = checks.filter((r) => r.status !== 200 || !r.type?.startsWith("image/"));
const audit = {
  checkedAt: new Date().toISOString(),
  sourceCount: feed.sourceCount,
  variants: feed.variantCount,
  inStock: feed.inStock,
  uniqueImages: urls.length,
  failed,
  checks,
};
fs.writeFileSync("docs/live-catalog-audit.json", JSON.stringify(audit, null, 2));
assert.equal(feed.warnings.length, 0);
assert.equal(failed.length, 0, JSON.stringify(failed));
// The public endpoint serves slices; ask for the products under test in batches.
async function publicCatalog(ids) {
  const out = { products: [], offers: [], liveSource: undefined, productAliases: {} };
  for (let i = 0; i < ids.length; i += 60) {
    const q = new URLSearchParams({ path: "/verify", ids: ids.slice(i, i + 60).join(",") });
    const r = await fetch("http://127.0.0.1:5173/api/v1/catalog?" + q);
    assert.equal(r.status, 200);
    const slice = await r.json();
    out.products.push(...slice.products);
    out.offers.push(...slice.offers);
    out.liveSource = slice.liveSource;
    Object.assign(out.productAliases, slice.productAliases);
  }
  return out;
}
// Visitors no longer trigger the feed; store it the way the admin sync and cron do.
const sign = await fetch("http://127.0.0.1:5173/signin-with-chatgpt?return_to=/admin", {
  redirect: "manual",
});
const sync = await fetch("http://127.0.0.1:5173/api/v1/admin/feed-sync", {
  method: "POST",
  headers: {
    cookie: sign.headers.get("set-cookie").split(";")[0],
    "content-type": "application/json",
    origin: "http://127.0.0.1:5173",
  },
  body: "{}",
});
assert.equal(sync.status, 200);
const api = await publicCatalog([...new Set(feed.offers.map((o) => o.productId))]);
assert.equal(api.liveSource.state, "fresh");
assert(
  feed.offers.every(
    (o) =>
      api.offers.some((x) => x.id === o.id && x.price === o.price && x.stock === o.stock) ||
      // A store's second copy of a listing is hidden together with its offer.
      (api.productAliases[o.productId] && !api.offers.some((x) => x.id === o.id)),
  ),
);
console.log(
  JSON.stringify({
    result: "PASS",
    sourceCount: feed.sourceCount,
    variants: feed.variantCount,
    inStock: feed.inStock,
    imagesChecked: urls.length,
    apiProducts: api.products.filter((p) => p.active).length,
  }),
);
