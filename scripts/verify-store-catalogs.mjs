import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeStoreProducts } from "../lib/woocommerce.ts";
import { tapShopProduct } from "../lib/tap-marketplace.ts";
const sample = {
  id: 1,
  name: "Test",
  permalink: "https://eurolux.az/product/test",
  type: "simple",
  prices: { price: "599", currency_code: "AZN", currency_minor_unit: 0 },
  images: [],
  categories: [],
  is_in_stock: true,
};
assert.equal(normalizeStoreProducts("eurolux", [sample]).offers[0].price, 599);
assert.equal(
  normalizeStoreProducts("eurolux", [
    { ...sample, prices: { ...sample.prices, price: "59900", currency_minor_unit: 2 } },
  ]).offers[0].price,
  599,
);
assert.equal(
  normalizeStoreProducts("eurolux", [{ ...sample, prices: { ...sample.prices, price: "0" } }])
    .offers.length,
  0,
);
assert.equal(
  normalizeStoreProducts("eurolux", [{ ...sample, type: "variable", has_options: true }]).offers
    .length,
  0,
);
assert.equal(
  normalizeStoreProducts("eurolux", [
    { ...sample, prices: { ...sample.prices, currency_code: "USD" } },
  ]).offers.length,
  0,
);
const snapshots = ["techbar", "casio", "eurolux", "seehome", "allstar", "soliton"].map((id) =>
  JSON.parse(fs.readFileSync("lib/store-catalogs/" + id + ".json", "utf8")),
);
const tap = JSON.parse(fs.readFileSync("lib/store-catalogs/tap-shops.json", "utf8"));
for (const s of snapshots) {
  assert.equal(s.products.length + s.warnings.length, s.sourceCount);
  assert.equal(new Set(s.products.map((p) => p.id)).size, s.products.length);
  const ids = new Set(s.products.map((p) => p.id));
  assert(s.offers.every((o) => ids.has(o.productId) && o.price > 0 && !o.demo));
}
const ad = {
  __typename: "Ad",
  features: { adFeatures: { hasLabel: true, label: "RETAILER" } },
  shop: { __ref: "Shop:1" },
  status: "APPROVED",
  legacyResourceId: 1,
  path: "/elanlar/elektronika/noutbuklar/1",
  title: "Laptop",
  price: 100,
  azProperties: [{ name: "Yeni?", value: "Xeyr" }],
};
const state = { "Ad:1": ad, "Shop:1": { name: "Shop", uri: "/shops/test" } };
const parsed = tapShopProduct(state);
assert.equal(parsed.products.length, 1);
assert.equal(parsed.offers[0].condition, "used");
assert.equal(parsed.offers[0].stockKnown, false);
assert.equal(
  tapShopProduct({
    ...state,
    "Ad:1": { ...ad, features: { adFeatures: { hasLabel: false, label: "RETAILER" } } },
  }).products.length,
  0,
);
assert.equal(tapShopProduct({ ...state, "Ad:1": { ...ad, shop: null } }).products.length, 0);
// The public endpoint serves slices; ask for the products under test in batches.
async function publicCatalog(ids) {
  const out = { products: [], offers: [], liveSource: undefined };
  for (let i = 0; i < ids.length; i += 60) {
    const q = new URLSearchParams({ path: "/verify", ids: ids.slice(i, i + 60).join(",") });
    const r = await fetch("http://127.0.0.1:5173/api/v1/catalog?" + q);
    assert.equal(r.status, 200);
    const slice = await r.json();
    out.products.push(...slice.products);
    out.offers.push(...slice.offers);
    out.liveSource = slice.liveSource;
  }
  return out;
}
const c = await publicCatalog([
  ...new Set(
    [...snapshots, tap].flatMap((s) => [
      ...s.products.map((p) => p.id),
      ...s.offers.map((o) => o.productId),
    ]),
  ),
]);
const products = new Map(c.products.map((p) => [p.id, p])),
  offers = new Map(c.offers.map((o) => [o.id, o]));
for (const s of [...snapshots, tap]) {
  for (const p of s.products) assert(products.has(p.id), p.id);
  for (const o of s.offers) {
    assert.equal(offers.get(o.id)?.price, o.price, o.id);
    assert.equal(offers.get(o.id)?.stock, o.stock, o.id);
  }
}
console.log(
  JSON.stringify({
    result: "PASS",
    activeProducts: c.products.filter((p) => p.active).length,
    newFullCatalogProducts: snapshots.reduce((n, s) => n + s.products.length, 0),
    tapAds: tap.products.length,
    tapShops: tap.stores.length,
    sourceRows: snapshots.reduce((n, s) => n + s.sourceCount, 0),
    quarantined: snapshots.flatMap((s) => s.warnings),
  }),
);
