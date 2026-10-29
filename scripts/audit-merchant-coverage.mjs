// Read-only audit of an exported catalog. It never starts crawls or writes catalog/DB records.
import fs from "node:fs";
import path from "node:path";
import { crawlSources } from "../lib/crawl-sources.ts";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] || fallback : fallback;
};
const input = option("--input", "work/production-audit/raw-catalog.json");
const output = option("--output", "docs/merchant-coverage-audit.json");
const catalog = JSON.parse(fs.readFileSync(input, "utf8"));
if (
  !Array.isArray(catalog.products) ||
  !Array.isArray(catalog.offers) ||
  !Array.isArray(catalog.stores)
)
  throw new Error("Expected an exported catalog with products, offers and stores arrays.");
const directory = JSON.parse(fs.readFileSync("docs/local-merchants.json", "utf8"));
const previousProbes = JSON.parse(fs.readFileSync("docs/store-api-discovery.json", "utf8"));
const activeProducts = new Map(catalog.products.filter((p) => p.active).map((p) => [p.id, p]));
const activeStores = catalog.stores.filter((s) => s.active);
const realOffers = catalog.offers.filter(
  (o) => !o.demo && activeProducts.has(o.productId) && Number.isFinite(o.price) && o.price > 0,
);
const cache = (name) => {
  const file = "work/merchant-audit/" + name;
  if (!fs.existsSync(file)) return undefined;
  return {
    text: fs.readFileSync(file, "utf8"),
    observedAt: fs.statSync(file).mtime.toISOString(),
    file,
  };
};
const locs = (text) =>
  [...text.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map((m) =>
    m[1].trim().replace(/&amp;/g, "&"),
  );
const productSchemas = (text) =>
  [...text.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(
    (m) => {
      try {
        const value = JSON.parse(m[1]);
        return [value, ...(Array.isArray(value?.["@graph"]) ? value["@graph"] : [])].filter((v) =>
          [v?.["@type"]].flat().includes("Product"),
        );
      } catch {
        return [];
      }
    },
  );
const evidence = [];
const addEvidence = (merchantId, name, urls, files, note, parserHint) => {
  const loaded = files.map((file) => cache(file)).filter(Boolean);
  if (!loaded.length) return;
  const productFile = loaded.find((f) => f.file.endsWith("-product.txt"));
  const products = productFile ? productSchemas(productFile.text) : [];
  evidence.push({
    merchantId,
    name,
    urls,
    observedAt: loaded
      .map((f) => f.observedAt)
      .sort()
      .at(-1),
    localEvidence: loaded.map((f) => f.file),
    status: "primary_sources_read_http_200",
    note,
    parserHint,
    sampleProducts: products.map((p) => ({
      name: p.name,
      url: p.url || p.offers?.url,
      brand: typeof p.brand === "string" ? p.brand : p.brand?.name,
      price: p.offers?.price,
      currency: p.offers?.priceCurrency,
      availability: p.offers?.availability,
      image: Array.isArray(p.image) ? p.image[0] : p.image,
      mpn: p.mpn,
      color: p.color,
    })),
    importedByThisAudit: false,
    catalogWritesByThisAudit: false,
    inventoryComplete: false,
  });
};
addEvidence(
  "compstore",
  "CompStore",
  [
    "https://compstore.az/robots.txt",
    "https://compstore.az/sitemap.xml",
    "https://compstore.az/sitemap-posts.xml",
    "https://compstore.az/asus-rog-zephyrus-g16-oled-gu606ax-tb100w-90nr0pe2-m005t0-gaming-laptop.html",
  ],
  ["compstore-robots.txt", "compstore-sitemap.txt", "compstore-posts.txt", "compstore-product.txt"],
  "The product sitemap contains AZ/RU URLs and may contain non-products. Its URL count is not a verified unique inventory count.",
  "Existing Product JSON-LD reader can extract sample cash price, stock and image. Accept same-host product .html URLs, exclude /ru/ and category/info routes, and require a Product with positive AZN Offer.",
);
addEvidence(
  "ultrastore",
  "UltraStore",
  [
    "https://ultrastore.az/robots.txt",
    "https://ultrastore.az/sitemap.xml",
    "https://ultrastore.az/interaktiv-lovhe-emkotech-nova-s3-75-az",
  ],
  ["ultrastore-robots.txt", "ultrastore-sitemap.txt", "ultrastore-product.txt"],
  "The sitemap duplicates language versions. Respect robots restrictions on specials/search/cart and query sort/order. This is a read-only integration candidate, not imported inventory.",
  "Product JSON-LD has positive AZN price, stock, image, brand and MPN; decode HTML entities in name/MPN. Product image entries with -az paths identify AZ candidates.",
);
addEvidence(
  "smarton",
  "Smarton",
  [
    "https://smarton.az/robots.txt",
    "https://smarton.az/sitemap.xml",
    "https://smarton.az/storage/sitemap/sitemap.xml",
    "https://smarton.az/storage/sitemap/sitemap_0.xml",
    "https://smarton.az/mehsullar/lg-lbb459emywapyqmer-soyuducu-satisi-ve-qiymeti-online-kredit",
  ],
  [
    "smarton-robots.txt",
    "smarton-sitemap.txt",
    "smarton-child.txt",
    "smarton-map0.txt",
    "smarton-product.txt",
  ],
  "Crawl-delay:30 was respected. The index advertises five child maps; only child0 was read in this bounded audit. AZ and RU entries are mixed. Sample prose contains an old price; do not derive price from description.",
  "Restrict to /mehsullar/ AZ product URLs; generic Product JSON-LD gives current offer price, stock, brand and image. Keep 30-second per-host cadence.",
);
addEvidence(
  "aztech",
  "Aztech",
  [
    "https://aztech.az/robots.txt",
    "https://aztech.az/wp-json/",
    "https://aztech.az/sitemap_index.xml",
  ],
  ["aztech-robots.txt", "aztech-rest.txt", "aztech-sitemap.txt"],
  "Advertised WordPress REST root is accessible but exposes no WooCommerce Store API namespace or product routes. Its advertised sitemap contains posts/pages/news, not a verified price catalog. No price-feed integration is claimed.",
  "Needs a product/feed source or product-specific adapter before any price integration can be marked connected.",
);
for (const item of evidence) {
  const names = item.localEvidence.map((f) => path.basename(f));
  if (names.includes("compstore-posts.txt"))
    item.sitemapUrlsObserved = locs(cache("compstore-posts.txt").text).length;
  if (names.includes("ultrastore-sitemap.txt")) {
    const text = cache("ultrastore-sitemap.txt").text;
    item.sitemapUrlsObserved = locs(text).length;
    item.imageEntriesObserved = [...text.matchAll(/<image:image>/g)].length;
  }
  if (names.includes("smarton-map0.txt")) {
    const urls = locs(cache("smarton-map0.txt").text);
    item.sitemapUrlsObserved = urls.length;
    item.azProductCandidatesInObservedMap = urls.filter((u) =>
      new URL(u).pathname.startsWith("/mehsullar/"),
    ).length;
  }
}

const stores = activeStores.map((s) => {
  const offers = realOffers.filter((o) => o.storeId === s.id);
  const products = new Set(
    [...activeProducts.values()].filter((p) => p.sourceStoreId === s.id).map((p) => p.id),
  );
  for (const o of offers) products.add(o.productId);
  const priced = new Set(offers.map((o) => o.productId));
  const stocked = new Set(
    offers.filter((o) => o.stock === true && o.stockKnown !== false).map((o) => o.productId),
  );
  const unconfirmed = new Set(offers.filter((o) => o.stockKnown === false).map((o) => o.productId));
  const checked = offers
    .map((o) => o.checkedAt)
    .filter((d) => Number.isFinite(Date.parse(d)))
    .sort();
  const source = crawlSources.find((v) => v.id === s.id);
  const claim = catalog.sourceCoverage?.find((v) => v.storeId === s.id);
  const knownDirectory = directory.find((v) => v.id === s.id);
  const priorProbe = previousProbes.find((v) => v.id === s.id);
  const state = stocked.size
    ? "priced_stock_verified"
    : unconfirmed.size
      ? "priced_stock_unconfirmed"
      : priced.size
        ? "priced_no_current_stock"
        : products.size
          ? "catalog_without_prices"
          : "directory_only";
  return {
    id: s.id,
    name: s.name,
    domain: s.domain,
    profileType:
      s.id.startsWith("tap-") || s.sourceStatus === "marketplace_shop"
        ? "marketplace_shop_profile"
        : "merchant_directory_profile",
    state,
    activeCatalogProducts: products.size,
    realPriceProducts: priced.size,
    knownStockProducts: stocked.size,
    stockUnconfirmedProducts: unconfirmed.size,
    realPriceRows: offers.length,
    oldestPriceCheck: checked[0] || null,
    newestPriceCheck: checked.at(-1) || null,
    automaticUpdaterConfigured: !!source,
    updaterRoot: source?.root || null,
    refreshHours: source?.refreshHours || null,
    updaterExecutionVerifiedByThisAudit: false,
    fullInventoryCoverage:
      claim?.complete === true
        ? "source_claim_only_requires_inventory_verification"
        : claim?.complete === false
          ? "partial"
          : "not_proven",
    declaredCoverage: claim || null,
    directoryVerifiedAt: knownDirectory?.verifiedAt || null,
    historicalApiProbe: priorProbe
      ? {
          status: priorProbe.status,
          supported: priorProbe.supported,
          total: priorProbe.total,
          note: "Historical discovery artifact; not proof of current access or integration.",
        }
      : null,
    advertisedSourceResearch: evidence
      .filter((v) => v.merchantId === s.id)
      .map((v) => v.merchantId),
    userFacingPriceStatus: priced.size
      ? "Mənbə və son yoxlanma vaxtına baxın"
      : "Qiymətlər hələ qoşulmayıb",
  };
});
const count = (predicate) => stores.filter(predicate).length;
const report = {
  generatedAt: new Date().toISOString(),
  input: input.replaceAll("\\", "/"),
  inputModifiedAt: fs.statSync(input).mtime.toISOString(),
  scope:
    "Read-only analysis of the provided raw catalog export. Database residency and production runtime are not independently proved by this JSON file.",
  policy:
    "No catalog/DB writes, no crawl jobs started, no authentication/CAPTCHA/403 bypass. New source research uses primary advertised robots/sitemap/REST/product URLs; advertised crawl delays respected.",
  summary: {
    activeDirectoryProfiles: stores.length,
    uniqueMerchantDomains: new Set(stores.map((s) => s.domain.replace(/^www\./, ""))).size,
    marketplaceShopProfiles: count((s) => s.profileType === "marketplace_shop_profile"),
    profilesWithRealPriceRecords: count((s) => s.realPriceProducts > 0),
    profilesWithKnownStock: count((s) => s.knownStockProducts > 0),
    profilesWithStockUnconfirmedOnly: count((s) => s.state === "priced_stock_unconfirmed"),
    profilesWithCatalogButNoPrices: count((s) => s.state === "catalog_without_prices"),
    directoryOnlyProfiles: count((s) => s.state === "directory_only"),
    configuredUpdaterProfiles: count((s) => s.automaticUpdaterConfigured),
    fullInventoryVerifiedProfiles: 0,
    activeRawProducts: activeProducts.size,
    rawPriceRows: catalog.offers.length,
    realActivePriceRows: realOffers.length,
    allStoresImported: false,
    allInventoriesComplete: false,
  },
  stores,
  primarySourceResearch: evidence,
  limits: [
    "A directory/profile count is not a connected live-price store count.",
    "A sitemap URL count includes language aliases, stale URLs and possibly category/blog pages; it is not an imported product count.",
    "Prices with unknown stock are not counted as currently in stock.",
    "Configured updater schedules do not prove an unattended execution occurred.",
    "Newly researched sources remain disconnected until an adapter/import is verified and the resulting records are read back.",
  ],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    { output, ...report.summary, researchedSources: evidence.map((v) => v.merchantId) },
    null,
    2,
  ),
);
