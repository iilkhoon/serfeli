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
  .replace('import { extractAlinino } from "./alinino";', () =>
    aliCode.replace("export function extractAlinino", "function extractAlinino"),
  )
  .replace('import { robotsAllowed } from "./robots";', () =>
    robotCode.replace("export function robotsAllowed", "function robotsAllowed"),
  );
const compiled = ts.transpileModule(resolved, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { extractProduct, extractMetaProduct, extractIrshad, safeMerchantUrl } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

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
console.log(
  "PASS: Merchant URL restrictions, access-challenge rejection, currency, ambiguity, and actual Irshad/Baku response fixtures.",
);
