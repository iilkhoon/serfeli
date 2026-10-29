import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const moduleUrl = (file, replace = (code) => code) =>
  "data:text/javascript;base64," +
  Buffer.from(
    replace(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    ),
  ).toString("base64");
const irshad = moduleUrl("lib/irshad.ts");
const woo = moduleUrl("lib/woocommerce.ts");
const techno = moduleUrl("lib/technomania.ts");
const {
  extractBakuListing,
  extractIrshadListingPage,
  extractListing,
  listingCategories,
  brandFromName,
  bakuCategory,
} = await import(
  moduleUrl("lib/listing-sources.ts", (code) =>
    code
      .replace('"./irshad"', JSON.stringify(irshad))
      .replace('"./technomania"', JSON.stringify(techno))
      .replace('"./woocommerce"', JSON.stringify(woo)),
  )
);
const { storeApiSources, normalizeStoreProducts } = await import(woo);
// Category guesses: "avtomobil" is not a phone, a PC liquid cooler is not a fridge.
const wooCategory = (name, slugs) =>
  normalizeStoreProducts("techbar", [
    {
      id: 1,
      name,
      permalink: "https://techbar.az/p/1",
      categories: slugs.map((slug) => ({ name: slug, slug })),
    },
  ]).products[0].category;
assert.equal(wooCategory("Hikvision K2 dashcam", ["avtomobil-kameralari"]), "avto");
assert.equal(wooCategory("Deepcool LT520 Maye Soyuducu", ["maye-soyuducular"]), "aksesuar");
assert.equal(wooCategory("Samsung Galaxy A17", ["mobil-telefonlar"]), "telefon");
assert.equal(wooCategory("Bosch soyuducu", ["soyuducular"]), "ev");
const { crawlSources } = await import(moduleUrl("lib/crawl-sources.ts"));

// WooCommerce Store API: snapshot ids, AZN minor units, no price for variable products, paging.
for (const s of storeApiSources) {
  const source = crawlSources.find((c) => c.id === s.id);
  assert(source?.listing && source.listingJson, s.id + " is a scheduled Store API source");
  assert(source.listingStart.startsWith(s.origin + "/wp-json/wc/store/v1/products?"));
}
const row = (id, extra = {}) => ({
  id,
  name: "Fen Eurolux EU-HD" + id,
  permalink: "https://eurolux.az/product/fen-" + id + "/",
  sku: "EU-" + id,
  is_in_stock: true,
  prices: { currency_code: "AZN", currency_minor_unit: 2, price: "4990" },
  categories: [{ name: "Fen", slug: "fen" }],
  ...extra,
});
const apiUrl =
  "https://eurolux.az/wp-json/wc/store/v1/products?per_page=2&orderby=id&order=asc&page=1";
const full = extractListing(
  "eurolux",
  JSON.stringify([row(1), row(2, { type: "variable", has_options: true })]),
  apiUrl,
);
assert.deepEqual(
  full.records.products.map((p) => p.id),
  ["wc-eurolux-1", "wc-eurolux-2"],
);
assert.deepEqual(
  full.records.offers.map((o) => [o.id, o.price, o.stock]),
  [["wc-offer-eurolux-1", 49.9, true]],
);
assert.deepEqual(full.pages, [apiUrl.replace("page=1", "page=2")]);
assert.deepEqual(extractListing("eurolux", JSON.stringify([row(3)]), apiUrl).pages, []);
assert.throws(() => extractListing("eurolux", "{}", apiUrl), /siyahısı/);

// Baku Electronics: Next.js category data, discounted price wins, stock from quantity.
const category =
  "https://bakuelectronics.az/catalog/telefonlar-qadcetler/smartfonlar-mobil-telefonlar";
const baku = extractBakuListing(
  fs.readFileSync("scripts/fixtures/baku-category.html", "utf8"),
  category,
);
assert.equal(baku.items.length, 6);
assert.equal(baku.items[0].name, "Smartfon Apple iPhone 18 Pro 256GB GLACIER");
assert.equal(baku.items[0].price, 3589.99);
assert.equal(baku.items[0].brand, "Apple");
assert.equal(baku.items[4].brand, "HONOR");
assert.equal(baku.items[0].stock, true);
assert.equal(baku.items[0].stockKnown, true);
assert.equal(
  baku.items[0].url,
  "https://bakuelectronics.az/mehsul/iphone-18-pro-256gb-glacier-235686",
);
assert.equal(baku.items[0].category, "telefon");
assert.equal(baku.pages.length, Math.ceil(326 / 18) - 1);
assert.equal(baku.pages[0], category + "?page=2");
// Later pages never re-enqueue the page list.
const later = fs
  .readFileSync("scripts/fixtures/baku-category.html", "utf8")
  .replace('"page":1', '"page":2');
assert.equal(extractBakuListing(later, category + "?page=2").pages.length, 0);
const soldOut = fs
  .readFileSync("scripts/fixtures/baku-category.html", "utf8")
  .replace(/"quantity":\d+/, '"quantity":0');
assert.equal(extractBakuListing(soldOut, category).items[0].stock, false);
assert.throws(() => extractBakuListing("<html></html>", category), /tapılmadı/);

// Only leaf categories are read, so parent pages do not repeat their children.
const cats = listingCategories(
  "baku",
  JSON.parse(fs.readFileSync("scripts/fixtures/baku-categories.json", "utf8")),
);
assert(cats.length > 100);
assert(!cats.includes("https://bakuelectronics.az/catalog/telefonlar-plansetler"));
assert(
  cats.includes(
    "https://bakuelectronics.az/catalog/telefonlar-plansetler/smartfonlar-mobil-telefonlar",
  ),
);
assert(!cats.some((u) => u.endsWith("/muqayise-et")));
assert.deepEqual(listingCategories("irshad", [category]), []);

assert.equal(brandFromName("Smartfon Samsung Galaxy A08"), "Samsung");
assert.equal(brandFromName("Ağıllı saat Apple Watch"), "Apple");
assert.equal(brandFromName("Paltaryuyan 7 kq"), "");
assert.equal(bakuCategory("/catalog/telefonlar-plansetler/aksesuarlar"), "aksesuar");
assert.equal(bakuCategory("/catalog/tv-audio-video/televizorlar"), "tv");
assert.equal(bakuCategory("/catalog/boyuk-meiset-texnikasi/soyuducular"), "ev");
assert.equal(bakuCategory("/catalog/tikinti-ve-temir/el-aletleri"), "");

// İrşad: the public list fragment and its "load more" page link.
const listUrl = "https://irshad.az/az/products/list?q=&direction=asc&sort=id";
const list = extractIrshadListingPage(
  fs.readFileSync("scripts/fixtures/irshad-list.html", "utf8"),
  listUrl,
);
assert(list.items.length >= 9, "irshad items " + list.items.length);
assert(
  list.items.every((p) => p.url.startsWith("https://irshad.az/") && p.price > 0 && p.variantId),
);
assert.deepEqual(list.pages, [listUrl + "&page=2"]);
assert.deepEqual(extractIrshadListingPage('<div id="productGridItems"></div>', listUrl).pages, []);

console.log(
  `PASS: category-page import for Baku Electronics (${baku.items.length} rows, discount, stock, paging, leaf categories), İrşad list fragment (${list.items.length} variants, load-more paging) and WooCommerce Store API pages (snapshot ids, AZN minor units, variable products, paging). No network.`,
);

// Production storefront ranking is checked with the real shared offer helpers, not mock sort keys.
const catalogSource = fs.readFileSync("lib/catalog.ts", "utf8");
const helperSource =
  catalogSource.slice(
    catalogSource.indexOf("export function canonicalProductId"),
    catalogSource.indexOf("export const categories"),
  ) + catalogSource.slice(catalogSource.indexOf("const offerIndex"));
const helpersUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(helperSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64");
const { validOffers, bestRecordedOffersFor } = await import(helpersUrl);
const { catalogSlice, rankProductsByStoreCount } = await import(
  moduleUrl("lib/catalog-query.ts", (code) =>
    code.replace('"./catalog"', JSON.stringify(helpersUrl)),
  )
);
const product = (id, category = "telefon", extra = {}) => ({
  id,
  name: "Acme Phone X1 " + id,
  brand: "Acme",
  category,
  variant: "128 GB · Black",
  image: "/favicon.svg",
  specs: {},
  description: "",
  active: true,
  featured: false,
  ...extra,
});
const offer = (productId, storeId, price, extra = {}) => ({
  id: productId + "-" + storeId + "-" + price,
  productId,
  storeId,
  price,
  shipping: 0,
  shippingKnown: false,
  stock: true,
  stockKnown: true,
  demo: false,
  cities: ["Bakı"],
  url: "https://example.test/" + productId,
  checkedAt: "2026-10-29T00:00:00Z",
  warranty: "",
  months: 0,
  installmentTotal: 0,
  sponsored: false,
  ...extra,
});
const rankedCatalog = {
  products: [
    product("three"),
    product("two"),
    product("case", "aksesuar"),
    product("unknown"),
    product("demo", "telefon", { featured: true }),
    product("unpriced"),
    product("ganja"),
  ],
  stores: Array.from({ length: 7 }, (_, i) => ({
    id: "s" + (i + 1),
    name: "Store " + (i + 1),
    active: i < 6,
  })),
  offers: [
    offer("three", "s1", 500),
    offer("three", "s2", 510),
    offer("three", "s3", 520),
    offer("three", "s1", 490), // Same seller must count once and retain its cheapest live price.
    offer("three", "s1", 1, { stock: false }),
    offer("three", "s4", 1, { demo: true }),
    offer("three", "s5", 1, { stockKnown: false }),
    offer("three", "s7", 1),
    offer("two", "s1", 100),
    offer("two", "s2", 110),
    ...[1, 2, 3, 4].map((n) => offer("case", "s" + n, 20 + n)),
    offer("unknown", "s1", 10, { stockKnown: false }),
    offer("demo", "s1", 1, { demo: true }),
    ...[1, 2, 3, 4, 5].map((n) => offer("ganja", "s" + n, 600 + n, { cities: ["Gəncə"] })),
  ],
  history: [],
  reviews: [],
  settings: { headline: "", announcement: "" },
};
assert.equal(validOffers(rankedCatalog, "three", "Bakı").length, 3);
assert.equal(validOffers(rankedCatalog, "three", "Bakı")[0].price, 490);
assert.equal(validOffers(rankedCatalog, "unknown").length, 0);
assert.equal(validOffers(rankedCatalog, "demo").length, 0);
assert.equal(
  bestRecordedOffersFor(rankedCatalog, "three").filter((o) => o.storeId === "s1").length,
  1,
);
assert.equal(
  catalogSlice(rankedCatalog, { path: "/kataloq" }).storeStats.s1.count,
  5,
  "store totals count products, not duplicate price rows or demo rows",
);
for (const path of ["/kataloq", "/kateqoriya/telefon", "/axtaris?q=Phone+X1"]) {
  const slice = catalogSlice(rankedCatalog, { path, city: "Bakı" });
  const mainIds = slice.matched.filter((id) => id !== "case");
  assert.deepEqual(
    mainIds.slice(0, 2),
    ["three", "two"],
    path + " descends by distinct real stocked stores",
  );
}
assert.deepEqual(
  catalogSlice(rankedCatalog, { path: "/kataloq", city: "Bakı" }).matched.slice(0, 3),
  ["case", "three", "two"],
);
const searchOrder = catalogSlice(rankedCatalog, {
  path: "/axtaris?q=Phone+X1",
  city: "Bakı",
}).matched;
assert.equal(
  searchOrder.at(-1),
  "case",
  "search primary products precede accessories, including unavailable primary models",
);
assert.equal(
  catalogSlice(rankedCatalog, { path: "/kataloq", city: "Bakı", sort: "low" }).matched[0],
  "case",
);
assert.equal(
  catalogSlice(rankedCatalog, { path: "/kataloq", city: "Bakı", sort: "high" }).matched[0],
  "three",
);
assert.deepEqual(
  catalogSlice(rankedCatalog, { path: "/kataloq", city: "Bakı", sort: "low" }).matched.slice(0, 3),
  ["case", "two", "three"],
);
assert.deepEqual(
  catalogSlice(rankedCatalog, { path: "/kataloq", city: "Bakı", sort: "name" }).matched.slice(0, 3),
  ["case", "three", "two"],
);
const homeBaku = catalogSlice(rankedCatalog, { path: "/", city: "Bakı" });
const homeGanja = catalogSlice(rankedCatalog, { path: "/", city: "Gəncə" });
assert.equal(
  rankProductsByStoreCount(homeBaku, homeBaku.products, "Bakı")[0].id,
  "case",
  "featured/demo heroes must not jump the home ranking",
);
assert.equal(
  rankProductsByStoreCount(homeGanja, homeGanja.products, "Gəncə")[0].id,
  "ganja",
  "home payload and ranking respect the selected city",
);
console.log(
  "PASS: storefront ranking by distinct real known-stock sellers, duplicate merchant suppression, cheapest merchant price, unknown/demo/disabled exclusions, search accessories, explicit price sorts and city-aware home ranking. No network.",
);
