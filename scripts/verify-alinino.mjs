import assert from "node:assert/strict";
import fs from "node:fs";
import { extractAlinino } from "../lib/alinino.ts";
const raw = fs.readFileSync("scripts/fixtures/alinino-product.html", "utf8");
const rows = extractAlinino(
  raw,
  "https://alinino.az/product/the-book-lamp-classik-in-midnight-blue",
);
assert.equal(rows.length, 1);
assert.equal(rows[0].price, 39.87);
assert.equal(rows[0].stock, false);
assert.equal(rows[0].stockKnown, true);
assert.equal(rows[0].variantId, "194547454");
assert(rows[0].image.startsWith("https://"));
assert.throws(() => extractAlinino(raw, "https://alinino.az/product/other"));
const p = {
  id: 42,
  title: "Book fixture",
  url: "/product/book",
  properties: [{ id: 1, title: "ISBN" }],
  characteristics: [{ property_id: 1, title: "9781234567890" }],
  images: [
    { id: 1, medium_url: "https://alinino.az/red.jpg" },
    { id: 2, medium_url: "https://alinino.az/blue.jpg" },
  ],
  variants: [
    { id: 7, price: "10.50", available: true, title: "Red", image_id: 1 },
    { id: 8, price: "20.00", available: false, title: "Blue", image_id: 2 },
  ],
};
const html = `<meta data-config='{"product_id":42}'><meta data-config='{"currency_code":"AZN"}'><form data-main-form data-product-id="42" data-product-json='${JSON.stringify(p)}'></form>`;
const colors = extractAlinino(html, "https://alinino.az/product/book");
assert.equal(colors.length, 2);
assert.deepEqual(
  colors.map((x) => x.price),
  [10.5, 20],
);
assert.equal(colors[1].image, "https://alinino.az/blue.jpg");
assert.equal(colors[0].category, "kitab");
assert.equal(colors[0].familyId, colors[1].familyId);
assert.notEqual(colors[0].variantId, colors[1].variantId);
assert.throws(() => extractAlinino(html.replace("AZN", "USD"), "https://alinino.az/product/book"));
console.log(
  "PASS: Ali & Nino main-form identity, explicit AZN config, current decimal price, stock, variant images/IDs, ISBN category, foreign currency and wrong-product rejection.",
);
