// Product pages whose structured data is missing or wrong: the price is read from the visible
// product block of the page itself. Each reader anchors on the main product heading so related
// product cards further down the page are never used. The sale price is the offer price; the
// crossed-out price is returned as oldPrice and never used as the offer price.
import type { ScannedProduct } from "./extractor";

export const clean = (value: string) =>
  value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_s, hex, decimal) => {
      const point = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#039;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

// "1,399.00", "8,565.0", "10442,00", "1 299.99" → number. Returns NaN for anything else.
export function parseAmount(raw: string) {
  let s = clean(raw)
    .replace(/[^\d.,\s]/g, "")
    .trim();
  s = s.replace(/(\d)\s+(?=\d{3}\b)/g, "$1").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if ((s.match(/\./g) || []).length > 1) return NaN;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 10000000 ? n : NaN;
}

const meta = (html: string, key: string) =>
  [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((t) =>
      new RegExp("(?:property|name|itemprop)\\s*=\\s*[\"']" + key + "[\"']", "i").test(t),
    )
    ?.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]
    ?.replace(/&amp;/g, "&");

function httpsUrl(value: string | undefined, base: string) {
  if (!value) return undefined;
  try {
    const u = new URL(value.replace(/&amp;/g, "&").trim(), base);
    if (u.protocol === "http:" && u.hostname === new URL(base).hostname) u.protocol = "https:";
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

// Text from the first match of `pattern` at or after `from`.
function after(html: string, from: number, pattern: RegExp) {
  const m = pattern.exec(html.slice(from));
  return m ? m : undefined;
}

function product(
  fields: Omit<ScannedProduct, "currency" | "checkedAt" | "stock" | "stockKnown"> & {
    stock?: boolean;
    oldPrice?: number;
  },
): ScannedProduct & { oldPrice?: number } {
  if (!fields.name) throw new Error("Məhsul adı oxunmadı.");
  if (!Number.isFinite(fields.price) || fields.price <= 0)
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const { stock, oldPrice, ...rest } = fields;
  return {
    ...rest,
    ...(oldPrice && oldPrice > fields.price ? { oldPrice } : {}),
    currency: "AZN",
    stock: stock === true,
    stockKnown: stock !== undefined,
    checkedAt: new Date().toISOString(),
  };
}

// JSON-LD Product nodes of a page (for name/SKU/image/availability when the price itself is wrong).
function ldProduct(html: string) {
  const found: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    if ([o["@type"]].flat().includes("Product")) found.push(o);
    if (o["@graph"]) walk(o["@graph"]);
  };
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  }
  return found.length === 1 ? found[0] : undefined;
}

// almali.az (WooCommerce): the JSON-LD offer is a USD conversion of the shelf price, so the AZN
// price is read from the product summary's <p class="price"> (<ins> sale, <del> old price).
export function extractAlmali(html: string, url: string) {
  const h1 = html.search(/<h1\b[^>]*class\s*=\s*["'][^"']*product_title/i);
  if (h1 < 0) throw new Error("Məhsul bloku tapılmadı.");
  const name = clean(after(html, h1, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const block = after(html, h1, /<p\b[^>]*class\s*=\s*["']price["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (!block || !/AZN/.test(block)) throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const amounts = (part: string) =>
    [...part.matchAll(/<bdi>([\s\S]*?)<\/bdi>/gi)].map((m) => parseAmount(m[1]));
  const sale = block.match(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i)?.[1];
  const old = block.match(/<del\b[^>]*>([\s\S]*?)<\/del>/i)?.[1];
  const prices = sale ? amounts(sale) : amounts(block);
  // A price range ("from – to") belongs to a variable product with no single price.
  if (prices.length !== 1) throw new Error("Bir neçə qiymət var; dəqiq variant seçilməyib.");
  const ld = ldProduct(html);
  const offers = ld ? [ld.offers].flat()[0] : undefined;
  const availability = String((offers as { availability?: unknown })?.availability || "");
  const image = [ld?.image].flat()[0];
  return product({
    name,
    price: prices[0],
    oldPrice: old ? amounts(old)[0] : undefined,
    sku: String(ld?.sku ?? ""),
    image: httpsUrl(typeof image === "string" ? image : meta(html, "og:image"), url),
    description: clean(String(ld?.description || "")).slice(0, 1500),
    stock: availability ? availability.endsWith("InStock") : undefined,
  });
}

// okim.az (OpenCart): <h1>, <p class="price"> (price-new / price-old when discounted), and the
// "Brendlər / Model / Mövcudluq" list.
export function extractOkim(html: string, url: string) {
  const start = html.search(/class\s*=\s*["'][^"']*product-info-details/i);
  if (start < 0) throw new Error("Məhsul bloku tapılmadı.");
  const block = html.slice(start, start + 20000);
  const name = clean(block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const priceBlock = block.match(/<p\b[^>]*class\s*=\s*["']price["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (!priceBlock || !/AZN|₼/.test(priceBlock))
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const sale = priceBlock.match(/class\s*=\s*["']price-new["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const old = priceBlock.match(/class\s*=\s*["']price-old["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const stockText = clean(
    block.match(/Mövcudluq:\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "",
  ).toLocaleLowerCase("az");
  return product({
    name,
    price: parseAmount(sale || priceBlock),
    oldPrice: old ? parseAmount(old) : undefined,
    sku: clean(block.match(/Model:\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || ""),
    brand: clean(block.match(/Brendlər\s*<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") || undefined,
    image: httpsUrl(
      html.match(
        /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*id\s*=\s*["']product-cloud-zoom["']/i,
      )?.[1] || meta(html, "og:image"),
      url,
    ),
    description: clean(meta(html, "description") || "").slice(0, 1500),
    stock: /anbarda|stokda var|mövcuddur/.test(stockText)
      ? true
      : /yoxdur|mövcud deyil|bitib/.test(stockText)
        ? false
        : undefined,
  });
}

// eraelectronics.az (OpenCart theme): h1.product-title, span.price-new / price-old, "Stokda var",
// "Model:" and the "Brend:" attribute.
export function extractEra(html: string, url: string) {
  const start = html.search(/<h1\b[^>]*class\s*=\s*["']product-title["']/i);
  if (start < 0) throw new Error("Məhsul bloku tapılmadı.");
  // The short attribute list is commented out in the page; only visible markup is read.
  const block = html.slice(start, start + 60000).replace(/<!--[\s\S]*?-->/g, " ");
  const name = clean(block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const priceBlock =
    block.match(/class\s*=\s*["']price-block[\s\S]*?(?=<div class="price-info|$)/i)?.[0] || "";
  const sale =
    priceBlock.match(/class\s*=\s*["'][^"']*price-new[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    priceBlock.match(/class\s*=\s*["'][^"']*price-main[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const old = priceBlock.match(/class\s*=\s*["']price-old["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if (!sale || !/manat|AZN|₼/i.test(sale))
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const stockText = clean(
    block.match(/class\s*=\s*["']product-stock["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "",
  ).toLocaleLowerCase("az");
  return product({
    name,
    price: parseAmount(sale),
    oldPrice: old ? parseAmount(old) : undefined,
    sku: clean(block.match(/<strong>\s*Model:\s*<\/strong>([^<]*)/i)?.[1] || ""),
    // Specification table row: <span class="attr-name">Brend</span> … <td>Bosch</td>.
    brand:
      clean(
        block.match(
          /class\s*=\s*["']attr-name["'][^>]*>\s*Brend\s*<\/span>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>/i,
        )?.[1] || "",
      ) || undefined,
    image: httpsUrl(meta(html, "og:image"), url),
    description: clean(meta(html, "description") || "").slice(0, 1500),
    stock: /stokda var/.test(stockText)
      ? true
      : /stokda yoxdur|mövcud deyil|bitib/.test(stockText)
        ? false
        : undefined,
  });
}

// mobifon.az: h1.title and the .cont-price block (crossed-out old price, span.nprice sale price).
export function extractMobifon(html: string, url: string) {
  const start = html.search(/<form\b[^>]*class\s*=\s*["']product-features["']/i);
  if (start < 0) throw new Error("Məhsul bloku tapılmadı.");
  const block = html.slice(start, start + 30000);
  const name = clean(block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const priceBlock = block.match(/class\s*=\s*["']cont-price["'][\s\S]*?<\/p>/i)?.[0] || "";
  const sale = priceBlock.match(/class\s*=\s*["']nprice["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const old = priceBlock.match(/text-decoration:\s*line-through[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if (!sale || !/manat/i.test(sale)) throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const id = block.match(/data-id\s*=\s*["'](\d+)["']/i)?.[1] || "";
  const image = block.match(
    /class\s*=\s*["']single-product-link["'][^>]*href\s*=\s*["']([^"']+)/i,
  )?.[1];
  return product({
    name,
    price: parseAmount(sale),
    oldPrice: old ? parseAmount(old) : undefined,
    sku: id,
    image: httpsUrl(image?.replace("/./", "/"), url),
    description: clean(meta(html, "description") || "").slice(0, 1500),
  });
}

// bestel.az (Nuxt, server-rendered): h1.product-inner-title, p.product-inner-code "[MPN]",
// p.product-price and p.product-old-price.
export function extractBestel(html: string, url: string) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  const start = body.search(/<h1\b[^>]*class\s*=\s*["']product-inner-title["']/i);
  if (start < 0) throw new Error("Məhsul bloku tapılmadı.");
  const block = body.slice(start, start + 6000);
  const name = clean(block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const code = clean(
    block.match(/class\s*=\s*["']product-inner-code["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "",
  ).replace(/^\[|\]$/g, "");
  const sale = block.match(/<p\b[^>]*class\s*=\s*["']product-price["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const old = block.match(
    /<p\b[^>]*class\s*=\s*["']product-old-price["'][^>]*>([\s\S]*?)<\/p>/i,
  )?.[1];
  if (!sale || !/AZN/.test(sale)) throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const numberOnly = (s: string) => parseAmount(s.replace(/<span[\s\S]*$/i, ""));
  return product({
    name,
    price: numberOnly(sale),
    oldPrice: old ? numberOnly(old) : undefined,
    sku: code,
    // The large gallery images come right before the title.
    image: httpsUrl(
      body
        .slice(Math.max(0, start - 30000), start)
        .match(/<img\b[^>]*src\s*=\s*["']([^"']+\/conversions\/[^"']+-lg\.jpg)["']/i)?.[1],
      url,
    ),
    description: clean(meta(html, "description") || "").slice(0, 1500),
    // "Tezliklə" (coming soon) replaces the cart button of products that cannot be ordered.
    stock: /class\s*=\s*["'][^"']*not-stock-product/i.test(block) ? false : undefined,
  });
}

// w-t.az: the title block (.param-container.product-name) holds the name and the price; the cart
// block shows "Səbətə at" for orderable products and "Stokda Yoxdur" otherwise.
export function extractWorldTelecom(html: string, url: string) {
  const start = html.search(/class\s*=\s*["']param-container product-name["']/i);
  if (start < 0) throw new Error("Məhsul bloku tapılmadı.");
  const block = html.slice(start, start + 4000);
  const name = clean(block.slice(block.indexOf(">") + 1).split(/<div\b/i)[0]);
  const priceBlock =
    block.match(/<div\b[^>]*class\s*=\s*["']price["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const old = priceBlock.match(/<(del|s)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  const current = priceBlock.replace(/<(del|s)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  if (!/₼|AZN/.test(current)) throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const cart =
    html
      .slice(start)
      .match(/class\s*=\s*["']param-container product-cart["'][\s\S]*?<\/div>/i)?.[0] || "";
  return product({
    name,
    price: parseAmount(current.replace(/₼|AZN/g, " ")),
    oldPrice: old ? parseAmount(old) : undefined,
    sku: block.match(/data-id\s*=\s*["'](\d+)["']/i)?.[1] || "",
    image: httpsUrl(
      html.match(/<img\b[^>]*id\s*=\s*["']mainImage["'][^>]*src\s*=\s*["']([^"']+)/i)?.[1],
      url,
    ),
    description: clean(meta(html, "description") || "").slice(0, 1500),
    stock: /addToCart|Səbətə at/.test(cart)
      ? true
      : /Stokda Yoxdur/i.test(cart)
        ? false
        : undefined,
  });
}

// smeg.az (Tilda store): the title is only "colour + type" ("Yaşıl Soyuducu"); the model code is the
// whole product description. The model becomes the SKU and is put in front of the title so the
// product can be matched across stores.
export function smegProduct(p: ScannedProduct): ScannedProduct {
  const model = (p.description || "").trim();
  if (!/^[A-Z0-9][A-Z0-9-]{3,24}$/.test(model)) return p;
  return {
    ...p,
    name: [p.brand || "SMEG", model, p.name].join(" "),
    sku: model,
    specs: { ...p.specs, Model: model },
  };
}
export const productFixups: Record<string, (p: ScannedProduct) => ScannedProduct> = {
  "smeg.az": smegProduct,
};

// Readers by merchant host (without www.).
export const htmlProductReaders: Record<string, (html: string, url: string) => ScannedProduct> = {
  "almali.az": extractAlmali,
  "okim.az": extractOkim,
  "eraelectronics.az": extractEra,
  "mobifon.az": extractMobifon,
  "bestel.az": extractBestel,
  "w-t.az": extractWorldTelecom,
};
