import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const domains = JSON.parse(fs.readFileSync("docs/local-merchants.json", "utf8")).map(
  (s) => s.domain,
);
const aliCode = ts.transpileModule(fs.readFileSync("lib/alinino.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const robotCode = ts.transpileModule(fs.readFileSync("lib/robots.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const irshadCode = ts.transpileModule(fs.readFileSync("lib/irshad.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const irshadModule = "data:text/javascript;base64," + Buffer.from(irshadCode).toString("base64");
const priceCode = ts.transpileModule(fs.readFileSync("lib/price.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const priceModule = "data:text/javascript;base64," + Buffer.from(priceCode).toString("base64");
const htmlProductsSource = fs
  .readFileSync("lib/html-products.ts", "utf8")
  .replace('from "./price";', () => `from "${priceModule}";`);
const htmlProductsCode = ts.transpileModule(htmlProductsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const htmlProductsModule =
  "data:text/javascript;base64," + Buffer.from(htmlProductsCode).toString("base64");
const code = fs
  .readFileSync("lib/extractor.ts", "utf8")
  .replace(
    'import { merchantDomains } from "./merchants";',
    "const merchantDomains=" +
      JSON.stringify([
        "kontakt.az",
        "irshad.az",
        "bakuelectronics.az",
        "ispace.az",
        "soliton.az",
        "birmarket.az",
        "technomania.az",
        ...domains,
      ]) +
      ";",
  );
const resolved = code
  .replace('from "./irshad";', () => `from "${irshadModule}";`)
  .replace('from "./html-products";', () => `from "${htmlProductsModule}";`)
  .replace('from "./price";', () => `from "${priceModule}";`)
  .replace('import { extractAlinino } from "./alinino";', () =>
    aliCode.replace("export function extractAlinino", "function extractAlinino"),
  )
  .replace(/import \{[^}]*\} from "\.\/robots";/, () => robotCode.replace(/^export /gm, ""));
const compiled = ts.transpileModule(resolved, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  extractProduct,
  extractMetaProduct,
  extractIrshad,
  safeMerchantUrl,
  parsePrice,
  stockFromAvailability,
  isBotChallenge,
  scanProduct,
  extractMicrodataProduct,
  parseProductPage,
} = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

for (const url of [
  "http://irshad.az/test",
  "https://irshad.az.evil.example/test",
  "https://user:pass@irshad.az/test",
  "https://127.0.0.1/",
  "https://irshad.az:8443/test",
])
  assert.throws(() => safeMerchantUrl(url));
assert.equal(
  safeMerchantUrl("https://technomania.az/product/apple-airpods-4-qulaqlq").hostname,
  "technomania.az",
);
assert.throws(() => extractProduct("<html><h1>Just a moment</h1></html>"));
assert.throws(() =>
  extractProduct(
    '<script type="application/ld+json">{"@type":"Product","offers":{"price":10,"priceCurrency":"USD"}}</script>',
  ),
);
const multiple =
  '<script type="application/ld+json">[{"@type":"Product","offers":{"price":10,"priceCurrency":"AZN"}},{"@type":"Product","offers":{"price":20,"priceCurrency":"AZN"}}]</script>';
assert.throws(() => extractProduct(multiple));
if (fs.existsSync("work/irshad-product.html")) {
  const p = extractIrshad(fs.readFileSync("work/irshad-product.html", "utf8"));
  assert.equal(p.sku, "99536");
  assert.equal(p.name, "iPhone 16 128 GB Black");
  assert.equal(p.price, 2399.99);
  assert.equal(p.stock, true);
}
if (fs.existsSync("work/baku-product.html")) {
  const p = extractProduct(fs.readFileSync("work/baku-product.html", "utf8"));
  assert.equal(p.price, 1799.99);
  assert.equal(p.stock, true);
}
if (fs.existsSync("work/sitemaps/soliton-product.txt")) {
  const p = extractMetaProduct(fs.readFileSync("work/sitemaps/soliton-product.txt", "utf8"));
  assert.equal(p.price, 1459.99);
  assert.equal(p.stock, true);
  assert(p.image.startsWith("https://"));
}
assert.throws(() =>
  extractProduct(
    '<script type="application/ld+json">{"@type":"Product","offers":[{"price":10,"priceCurrency":"AZN"},{"price":20,"priceCurrency":"AZN"}]}</script>',
  ),
);
// Price parsing: AZN shelf formats, machine formats, rejection of foreign currencies and junk.
for (const [raw, want] of [
  ["1 299,99 ₼", 1299.99],
  ["1\u00a0299,99 AZN", 1299.99],
  ["1.299,99", 1299.99],
  ["1,299.99", 1299.99],
  ["1299.0000", 1299],
  ["1299,5", 1299.5],
  ["2,499.00", 2499],
  ["1.299.000", 1299000],
  ["2999 ", 2999],
  [12999, 12999],
  ["₼ 2,999.00", 2999],
])
  assert.equal(parsePrice(raw), want, String(raw));
for (const raw of ["0", 0, "", "USD 10", "$10", "10 €", "abc", "1,2,3", "1.2.3,4.5", -5, null])
  assert(Number.isNaN(parsePrice(raw)), String(raw));
// Stock: only recognised schema.org/meta values are known; anything else stays unknown.
assert.deepEqual(stockFromAvailability("https://schema.org/InStock"), {
  stock: true,
  stockKnown: true,
});
assert.deepEqual(stockFromAvailability("http://schema.org/OutOfStock"), {
  stock: false,
  stockKnown: true,
});
assert.deepEqual(stockFromAvailability("in stock"), { stock: true, stockKnown: true });
assert.deepEqual(stockFromAvailability("available"), { stock: false, stockKnown: false });
assert.deepEqual(stockFromAvailability(undefined), { stock: false, stockKnown: false });
// Bot challenges are recognised (and stop the source in the crawler).
assert(isBotChallenge("<html><head><title>Just a moment...</title></head></html>"));
assert(isBotChallenge("<script>window._cf_chl_opt={}</script>"));
assert(!isBotChallenge('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'));
// Lowercase currency is AZN; schema.org type IRIs are Products; names are entity-decoded.
const ld = extractProduct(
  '<script type="application/ld+json">{"@type":"http://schema.org/Product","name":"Nova S3 75&quot;","offers":{"price":"1 299,99","priceCurrency":"azn","availability":"InStock"}}</script>',
);
assert.equal(ld.price, 1299.99);
assert.equal(ld.name, 'Nova S3 75"');
assert.equal(ld.stock, true);
const unknownStock = extractProduct(
  '<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":10,"priceCurrency":"AZN"}}</script>',
);
assert.equal(unknownStock.stockKnown, false);
// Real pages saved 2026-10-31 (scripts/fixtures). bytelecom.az: meta tags only, currency "azn",
// product:price:amount is the regular price and product:discount_price the current one.
const by = extractProduct(fs.readFileSync("scripts/fixtures/bytelecom-product.html", "utf8"));
assert.equal(by.price, 2499);
assert.equal(by.name, "Asus Tuf Gaming Core i5 16/512GB SSD");
assert.equal(by.sku, "8850");
assert.equal(by.brand, "Asus");
assert.deepEqual([by.stock, by.stockKnown], [true, true]);
assert(by.image.startsWith("https://bytelecom.az/"));
assert.throws(() =>
  extractMetaProduct(
    '<meta property="og:title" content="X"><meta property="product:price:amount" content="10"><meta property="product:price:currency" content="AZN"><meta property="product:discount_price" content="8"><meta property="product:discount_price" content="7">',
  ),
);
const noSale = extractMetaProduct(
  '<meta property="og:title" content="X"><meta property="product:price:amount" content="10"><meta property="product:price:currency" content="AZN"><meta property="product:discount_price" content="0">',
);
assert.equal(noSale.price, 10);
assert.equal(noSale.stockKnown, false);
// compstore.az: one Product JSON-LD with a numeric AZN price; legacy pages publish price "0",
// which must never become an offer.
const cs = extractProduct(fs.readFileSync("scripts/fixtures/compstore-product.html", "utf8"));
assert.equal(cs.price, 12999);
assert.deepEqual([cs.stock, cs.stockKnown], [true, true]);
assert.match(cs.name, /^ASUS ROG Zephyrus G16/);
assert.throws(() =>
  extractProduct(fs.readFileSync("scripts/fixtures/compstore-product-noprice.html", "utf8")),
);
// mgstore.az (Magento): the JSON-LD offer is the current cash price; the meta tag and the
// StrikethroughPrice are the regular price.
const mg = extractProduct(fs.readFileSync("scripts/fixtures/mgstore-product.html", "utf8"));
assert.equal(mg.price, 189.99);
assert.equal(mg.sku, "TM-MT-XMT-1101-VC-0144");
assert.equal(mg.brand, "Samsung");
assert.deepEqual([mg.stock, mg.stockKnown], [true, true]);
const mgOut = extractProduct(fs.readFileSync("scripts/fixtures/mgstore-product-oos.html", "utf8"));
assert.deepEqual([mgOut.stock, mgOut.stockKnown], [false, true]);
// Network path with a stubbed fetch: robots.txt decides, challenges and 429 stop, sitemaps obey
// robots unless robots.txt advertises them.
const responses = new Map();
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  const r = responses.get(String(url));
  if (!r) return new Response("", { status: 404 });
  return typeof r === "function" ? r() : r.clone();
};
responses.set(
  "https://compstore.az/robots.txt",
  new Response("User-agent: *\nDisallow: /search/\nDisallow: /private\n", { status: 200 }),
);
responses.set(
  "https://compstore.az/ok.html",
  new Response(fs.readFileSync("scripts/fixtures/compstore-product.html", "utf8"), {
    status: 200,
    headers: { "content-type": "text/html; charset=UTF-8" },
  }),
);
assert.equal((await scanProduct("https://compstore.az/ok.html")).price, 12999);
await assert.rejects(() => scanProduct("https://compstore.az/search/x.html"), /avtomatik/);
assert(!requested.includes("https://compstore.az/search/x.html"), "robots.txt must stop the fetch");
responses.set(
  "https://smartelectronics.az/robots.txt",
  () =>
    new Response("<title>Just a moment...</title>", {
      status: 403,
      headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
    }),
);
await assert.rejects(
  () => scanProduct("https://smartelectronics.az/az/mehsullar/x"),
  (e) => e.name === "SourceAccessError" && e.challenge === true,
);
responses.set(
  "https://bytelecom.az/robots.txt",
  new Response("User-agent: *\nDisallow:\n", { status: 200 }),
);
responses.set(
  "https://bytelecom.az/az/products/limited",
  () => new Response("slow down", { status: 429, headers: { "retry-after": "120" } }),
);
await assert.rejects(
  () => scanProduct("https://bytelecom.az/az/products/limited"),
  (e) => e.status === 429 && e.retryAfterMs === 120000,
);
// Shelf prices read by the store HTML readers: thousands groups are never taken as decimals.
const { parseAmount } = await import(htmlProductsModule);
for (const [raw, want] of [
  ["1.299,00", 1299],
  ["12.000 AZN", 12000],
  ["1,299", 1299],
  ["1,399.00 ₼", 1399],
  ["1 299,99", 1299.99],
  ["10442,00", 10442],
  ["899.99", 899.99],
  ["8,565.0", 8565],
  ["0.00", NaN],
  ["Qiymət soruşun", NaN],
])
  assert(
    Object.is(parseAmount(raw), want) || parseAmount(raw) === want,
    raw + " → " + parseAmount(raw),
  );
// Captured product pages of the sitemap/category sources (scripts/fixtures/<id>-product.html).
// stock: true/false = known, undefined = the page does not say. old = crossed-out price.
const pages = [
  {
    id: "xiaomi-store",
    url: "https://xiaomi.az/telephones/smartphones/redmi-note-13-pro-5g-8gb-256gb-black",
    name: "Xiaomi Redmi Note 13 Pro(5G)",
    price: 799,
    stock: false,
    sku: "Xiaomi Redmi Note 13 Pro(5G)",
    brand: "Xiaomi",
  },
  {
    id: "ultrastore",
    url: "https://ultrastore.az/oyun-qulaqcigi-hyperx-cloud-stinger-2-wireless-676a2aa-az",
    name: "Oyun qulaqcığı HyperX Cloud Stinger 2 wireless (676A2AA)",
    price: 200,
    stock: true,
    sku: "676A2AA",
    brand: "HyperX",
  },
  {
    id: "eraelectronics",
    url: "https://eraelectronics.az/chaynik-bosch-tta5603/",
    name: "Çaydan Bosch TTA5603",
    price: 129.99,
    old: 219.99,
    stock: true,
    sku: "TTA5603",
    brand: "Bosch",
  },
  {
    id: "okim",
    url: "https://okim.az/telefon-nokia-3310-dual-dark-blue",
    name: "Telefon Nokia 3310 Dual Dark Blue",
    price: 149,
    stock: true,
    sku: "1012526",
    brand: "Nokia",
  },
  {
    id: "smeg",
    url: "https://smeg.az/refrigerators/tproduct/976710342782-yal-soyuducu",
    name: "SMEG FAB50RPG5 Yaşıl Soyuducu",
    price: 10442,
    stock: true,
    sku: "FAB50RPG5",
    brand: "SMEG",
  },
  {
    id: "texnohome",
    url: "https://texnohome.az/az/product/smartfon-xiaomi-redmi-17-8-256gb-black",
    name: "Smartfon Xiaomi Redmi 17 8/256GB Black",
    price: 649.99,
    stock: true,
    sku: "1010800",
    brand: "Xiaomi",
  },
  {
    id: "telehome",
    url: "https://telehome.az/az/mehsul/televizor-beko-b65m-d-790-b",
    name: "Televizor Beko B65M D 790 B",
    price: 1399,
    stock: undefined,
    sku: "legacy-257",
    brand: "BEKO",
  },
  {
    id: "nano",
    url: "https://nano.az/mehsul/leaderhub-l75zm-75-interaktiv-agilli-lovhe",
    name: "LeaderHub L75ZM 75″ interaktiv ağıllı lövhə",
    price: 3250,
    stock: true,
    sku: "LEADERHUB-L75ZM",
    brand: "LeaderHub",
  },
  {
    id: "minorstore",
    url: "https://minorstore.az/product/1795-soyuducu-pozis-rk-139-w",
    name: "Soyuducu Pozis RK 139 W",
    price: 789,
    stock: true,
    sku: "1795",
  },
  {
    id: "digitalhome",
    url: "https://digitalhome.az/products/adapter-samsung-pd-45w-usb-c",
    name: "Adapter Samsung PD 45W USB-C",
    price: 49.99,
    stock: true,
    sku: "3538",
    brand: "Samsung",
  },
  {
    // JSON-LD says 28.7 USD (a currency conversion); the shelf price is 49 AZN, was 59 AZN.
    id: "almali",
    url: "https://almali.az/product/logitech-wireless-combo-mk220-russian-layout/",
    name: "LOGITECH Wireless Combo MK220 – Russian layout",
    price: 49,
    old: 59,
    stock: true,
    sku: "131993",
  },
  {
    id: "smarton",
    url: "https://smarton.az/mehsullar/hp-elitebook-x360-1040-g8-358u2ea-noutbuk-satisi-ve-qiymeti-online-kredit",
    name: "HP EliteBook x360 1040 G8 (358U2EA) Noutbuk",
    price: 4119,
    stock: true,
    sku: "48107",
    brand: "HP",
  },
  {
    id: "mobifon",
    url: "https://www.mobifon.az/az/smart-saatlar/smart-saatlar/p/apple-watch-series-11-gps-46mm-black",
    name: "Apple Watch Series 11 GPS 46mm Black",
    price: 899.99,
    old: 1299.99,
    stock: undefined,
    sku: "730",
  },
  {
    id: "bestel",
    url: "https://bestel.az/noutbuklar/lenovo-thinkbook-15-g2-itl-3",
    name: "Lenovo ThinkBook 15 G2 ITL",
    price: 1348,
    old: 2176,
    stock: undefined,
    sku: "20VE003QRU",
  },
  {
    id: "worldtelecom",
    url: "https://www.w-t.az/smartfonlar-ve-aksessuarlar/apple/apple-iphone-16-128-gb-teal+p3568",
    name: "Apple iPhone 16 128 GB Teal",
    price: 2349,
    stock: true,
    sku: "3568",
  },
];
for (const t of pages) {
  const html = fs.readFileSync(`scripts/fixtures/${t.id}-product.html`, "utf8");
  const p = parseProductPage(html, t.url);
  assert.equal(p.name, t.name, t.id);
  assert.equal(p.price, t.price, t.id);
  assert.equal(p.currency, "AZN", t.id);
  assert.equal(p.oldPrice, t.old, t.id + " old price");
  assert.equal(p.stockKnown, t.stock !== undefined, t.id + " stockKnown");
  assert.equal(p.stock, t.stock === true, t.id + " stock");
  assert.equal(p.sku, t.sku, t.id + " sku");
  if (t.brand) assert.equal(p.brand, t.brand, t.id + " brand");
  assert.equal(p.url, t.url, t.id);
  assert.match(p.image || "", /^https:\/\//, t.id + " image");
  assert(
    domains.includes(new URL(t.url).hostname.replace(/^www\./, "")) ||
      domains.includes(new URL(t.url).hostname),
    t.id + " domain",
  );
}
// Microdata: one product → read; a listing with several prices → rejected.
const micro = (offers) =>
  `<div itemscope itemtype="http://schema.org/Product"><h1 itemprop="name">Test</h1>${offers}</div>`;
const offer = (price) =>
  `<span itemprop="offers" itemscope itemtype="http://schema.org/Offer"><meta itemprop="price" content="${price}"><meta itemprop="priceCurrency" content="AZN"><link itemprop="availability" href="https://schema.org/InStock"></span>`;
assert.equal(extractMicrodataProduct(micro(offer(10))).price, 10);
assert.throws(() => extractMicrodataProduct(micro(offer(10) + offer(20))));
assert.throws(() => extractMicrodataProduct(micro(offer(10).replace("AZN", "USD"))));
// A page with no price (out of stock, "0.00 AZN", "Tezliklə") yields no offer.
assert.throws(() =>
  parseProductPage(
    fs
      .readFileSync("scripts/fixtures/okim-product.html", "utf8")
      .replace(/<p class="price">[\s\S]*?<\/p>/, '<p class="price">\n 0.00 AZN\n </p>'),
    "https://okim.az/x",
  ),
);
assert.throws(() =>
  parseProductPage(
    fs
      .readFileSync("scripts/fixtures/worldtelecom-product.html", "utf8")
      .replace(/(<div class="price">)[\s\S]*?(<\/div>)/, "$1$2"),
    "https://www.w-t.az/x+p1",
  ),
);
console.log(
  "PASS: Merchant URL restrictions, access-challenge rejection, currency, ambiguity, AZN price formats, discount vs regular price, stock mapping, robots/challenge/429 fetch path, real Irshad/Baku/Bytelecom/Compstore/MG page fixtures, and " +
    pages.length +
    " captured product pages (JSON-LD, microdata and store HTML readers).",
);
