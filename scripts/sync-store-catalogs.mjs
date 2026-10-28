import { politeText } from "./polite-http.mjs";
import fs from "node:fs";
import { storeApiSources, normalizeStoreProducts } from "../lib/woocommerce.ts";
const fields =
  "id,name,permalink,sku,type,variation,prices,images,categories,brands,attributes,is_in_stock,has_options,is_purchasable";
fs.mkdirSync("work/store-api", { recursive: true });
fs.mkdirSync("lib/store-catalogs", { recursive: true });
async function page(source, n) {
  const r = await politeText(
    source.origin +
      "/wp-json/wc/store/v1/products?per_page=100&orderby=id&order=asc&page=" +
      n +
      "&_fields=" +
      fields,
    { ttlMs: 86400000 },
  );
  const data = JSON.parse(r.body);
  if (!Array.isArray(data)) throw new Error("Invalid products");
  return {
    data,
    total: Number(r.headers["x-wp-total"]),
    pages: Number(r.headers["x-wp-totalpages"]),
    checkedAt: r.checkedAt,
  };
}
const summaries = [];
for (const source of storeApiSources) {
  const first = await page(source, 1);
  if (!first.total || first.total > 25000 || first.pages > 250) throw new Error("Invalid total");
  const pages = [first.data];
  let next = 2;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next <= first.pages) {
        const n = next++;
        const p = await page(source, n);
        if (p.total !== first.total) throw new Error("Catalog changed during import; retry");
        pages[n - 1] = p.data;
        if (n % 10 === 0) console.log(source.id + " page " + n + "/" + first.pages);
      }
    }),
  );
  const rows = pages.flat();
  if (rows.length !== first.total || new Set(rows.map((p) => p.id)).size !== first.total)
    throw new Error(source.id + " incomplete or duplicate");
  const result = normalizeStoreProducts(source.id, rows);
  result.sourceCount = first.total;
  result.pages = first.pages;
  result.source = source.origin + "/wp-json/wc/store/v1/products";
  fs.writeFileSync("lib/store-catalogs/" + source.id + ".json", JSON.stringify(result));
  const summary = {
    id: source.id,
    source: result.source,
    total: first.total,
    products: result.products.length,
    offers: result.offers.length,
    inStock: result.offers.filter((o) => o.stock).length,
    unpriced: result.products.length - result.offers.length,
    warnings: result.warnings,
    checkedAt: result.checkedAt,
    pages: first.pages,
  };
  summaries.push(summary);
  console.log(JSON.stringify(summary));
}
fs.writeFileSync("docs/store-catalog-coverage.json", JSON.stringify(summaries, null, 2));
