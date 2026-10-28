import fs from "node:fs";
import { politeText } from "./polite-http.mjs";
const urls = JSON.parse(fs.readFileSync("work/sitemap-urls/soliton.json", "utf8"));
const products = [],
  offers = [],
  warnings = [];
const text = (v) =>
  v
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
for (const url of urls) {
  try {
    const r = await politeText(url);
    const meta = {};
    for (const tag of r.body.matchAll(/<meta\s+[^>]*>/gi)) {
      const key = tag[0].match(/(?:property|name)=["']([^"']+)/i)?.[1],
        value = tag[0].match(/content=["']([^"']*)/i)?.[1];
      if (key && value && !meta[key]) meta[key] = text(value);
    }
    const code = new URL(url).pathname.match(/\/(\d{17})[^/]*\.html$/)?.[1];
    if (!code || !meta["og:title"] || !meta["og:image"])
      throw new Error("Məhsul metadatası yoxdur");
    const id = "soliton-" + code;
    let category = /telefon-aksesuarlari/.test(url)
      ? "aksesuar"
      : /telefon/.test(url)
        ? "telefon"
        : /noutbuk|komputer/.test(url)
          ? "noutbuk"
          : /televizor/.test(url)
            ? "tv"
            : /qulaqliq|audio/.test(url)
              ? "audio"
              : /mebel/.test(url)
                ? "mebel"
                : /gozellik/.test(url)
                  ? "gozellik"
                  : "ev";
    products.push({
      id,
      name: meta["og:title"].slice(0, 180),
      brand: meta["og:title"].split(" ")[0].slice(0, 80),
      category,
      variant: "Mənbədəki model",
      image: new URL(meta["og:image"], url).href,
      specs: { Mənbə: "Soliton məhsul səhifəsi" },
      description: "Soliton məhsul səhifəsinin açıq qiymət, stok və şəkil metadatasından alınıb.",
      active: true,
      featured: false,
      sourceStoreId: "soliton",
      sourceUrl: url,
    });
    const price = Number(meta["product:price:amount"]);
    if (meta["product:price:currency"] === "AZN" && price > 0 && price < 10000000) {
      const known = ["in stock", "out of stock"].includes(meta["product:availability"]);
      offers.push({
        id: "soliton-offer-" + code,
        productId: id,
        storeId: "soliton",
        price,
        shipping: 0,
        shippingKnown: false,
        months: 0,
        installmentTotal: 0,
        stock: meta["product:availability"] === "in stock",
        stockKnown: known,
        warranty: "Mağazada dəqiqləşdirin",
        url,
        demo: false,
        checkedAt: r.checkedAt,
        cities: ["Bakı"],
        sponsored: false,
        sourceSku: code,
        sourceName: meta["og:title"],
      });
    }
  } catch (e) {
    warnings.push({ url, error: e.message });
  }
  if ((products.length + warnings.length) % 10 === 0)
    console.log("Soliton " + (products.length + warnings.length) + "/" + urls.length);
}
const data = {
  storeId: "soliton",
  source: "https://soliton.az/sitemap.xml",
  checkedAt: new Date().toISOString(),
  sourceCount: urls.length,
  products,
  offers,
  warnings,
};
fs.writeFileSync("lib/store-catalogs/soliton.json", JSON.stringify(data));
console.log(
  JSON.stringify({
    sourceCount: urls.length,
    products: products.length,
    offers: offers.length,
    warnings,
  }),
);
