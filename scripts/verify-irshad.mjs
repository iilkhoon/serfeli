import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(fs.readFileSync("lib/irshad.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { extractIrshad, extractIrshadVariants, extractIrshadCatalogPage } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const html = fs.readFileSync("scripts/fixtures/irshad-product.html", "utf8");
const url = "https://irshad.az/mehsullar/iphone-16-128-gb-black";
const product = extractIrshad(html, url);
assert.equal(product.sku, "99536");
assert.equal(product.variantId, "99536");
assert.equal(product.name, "iPhone 16 128 GB Black");
assert.equal(
  product.price,
  2399.99,
  "hidden/recommended/analytics prices must not leak into the active variant",
);
assert.equal(product.stock, true);
assert.equal(product.stockKnown, true);
assert(product.image.endsWith("F2tpSgljCGexbJwa86eQ8Z7FA3SGSX99175mZPbk.webp"));
assert.equal(product.brand, "Apple");
assert.equal(product.category, "telefon");
assert.equal(product.specs["Daxili yaddaş"], "128 GB");
assert.equal(product.specs["Yaddaş — Operativ yaddaş (RAM)"], "8 GB");
assert.equal(product.familyId, "irshad-group-99522");
assert.equal(product.url, "https://irshad.az/az/mehsullar/iphone-16-128-gb-black");
assert.equal(extractIrshadVariants(html, url).length, 2);
assert.equal(extractIrshadVariants(html, url)[1].price, 2299.99);
assert.equal(extractIrshadVariants(html, url)[1].variantId, "99539");
assert.throws(() => extractIrshad(html, "https://irshad.az/mehsullar/another-model"), /URL/);
assert.throws(
  () => extractIrshad(html.replace("Malın kodu:</span><p>99536", "Malın kodu:</span><p>12345")),
  /kod/,
);
assert.throws(() => extractIrshad(html.replace("2399.99 AZN", "2399.99 USD")), /AZN/);
assert.throws(() => extractIrshad(html.replace("2399.99 AZN", "2399.99 AZN / 25 EUR")), /AZN/);
assert.equal(extractIrshad(html.replace("2399.99 AZN", "2 399,99 ₼")).price, 2399.99);
assert.equal(extractIrshad(html.replace("2399.99 AZN", "2.399,99 AZN")).price, 2399.99);
assert.throws(() => extractIrshad(html.replace("2399.99 AZN", "0 AZN")), /qiymət/);
assert.throws(
  () => extractIrshad(html.replace('class="product-view d-none"', 'class="product-view"')),
  /Aktiv/,
);
assert.throws(
  () =>
    extractIrshad(
      html.replace(
        'class="product-view" id="productSection99536"',
        'class="product-view d-none" id="productSection99536"',
      ),
    ),
  /Aktiv/,
);
assert.throws(
  () =>
    extractIrshad(
      html.replace(
        '<p class="new-price">2399.99 AZN</p>',
        '<p class="new-price">2399.99 AZN</p><p class="new-price">2499.99 AZN</p>',
      ),
    ),
  /tək AZN/,
);
const stockless = html.replace(
  '<h1>iPhone 16 128 GB Black</h1><div class="product__labels">Stokda var',
  '<h1>iPhone 16 128 GB Black</h1><div class="product__labels">Stokda yoxdur',
);
assert.equal(extractIrshad(stockless).stock, false);
assert.equal(extractIrshad(stockless).stockKnown, true);
const unknown = html.replace(
  '<h1>iPhone 16 128 GB Black</h1><div class="product__labels">Stokda var',
  '<h1>iPhone 16 128 GB Black</h1><div class="product__labels">Faizsiz təklif',
);
assert.equal(extractIrshad(unknown).stock, false);
assert.equal(
  extractIrshad(unknown).stockKnown,
  false,
  "recommendation stock must not imply active product stock",
);
const hiddenInvalid = html.replace("2299.99 AZN", "qiymət yoxdur");
assert.equal(
  extractIrshad(hiddenInvalid).price,
  2399.99,
  "a broken hidden variant must not break active parsing",
);
const report = extractIrshadCatalogPage(hiddenInvalid);
assert.equal(report.products.length, 1);
assert.equal(report.skipped.length, 1);
assert.equal(report.skipped[0].variantId, "99539");
assert.equal(report.totalSections, 2);
const external = html.replace(
  'data-url="https://irshad.az/az/mehsullar/iphone-16-128-gb-white"',
  'data-url="https://evil.example/mehsullar/iphone-16-128-gb-white"',
);
assert.equal(extractIrshadCatalogPage(external).skipped.length, 1);
const alpha = html
  .replace('data-product-code="99536"', 'data-product-code="RCKQA9U"')
  .replace("Malın kodu:</span><p>99536", "Malın kodu:</span><p>RCKQA9U");
assert.equal(extractIrshad(alpha).sku, "RCKQA9U");
assert.equal(extractIrshad(alpha).variantId, "99536");
// Optional cached response checks supplement the committed, portable fixture.
for (const [file, sku, count] of [
  ["work/irshad-product.html", "99536", 5],
  ["work/research/irshad-samsung.html", "102649", 6],
  ["work/research/iphone17-pro-blue.html", "RCKQA9U", 5],
]) {
  if (!fs.existsSync(file)) continue;
  const saved = fs.readFileSync(file, "utf8"),
    active = extractIrshad(saved),
    all = extractIrshadCatalogPage(saved);
  assert.equal(active.sku, sku);
  assert.equal(all.products.length, count);
  assert.equal(all.skipped.length, 0);
  assert(active.image?.startsWith("https://storage.irshad.az/"));
  assert(Object.keys(active.specs).length > 3);
}
console.log(
  "PASS: Irshad active identity, variant isolation, explicit URLs, numeric IDs/alphanumeric SKU, AZN decimals, stock uncertainty, original images, selected attributes, portable fixture and cached response checks. No network.",
);
