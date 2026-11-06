// Irshad renders one section for every represented variant. Never use a hidden section's price
// or the trailing analytics event as the currently selected product.
import type { ScannedProduct } from "./extractor";

type Section = { attrs: string; body: string; sku: string; active: boolean; url?: string };
type MerchantRow = {
  id?: unknown;
  code?: unknown;
  model?: unknown;
  group?: { id?: unknown; title?: unknown };
  brand?: { main_trans?: { title?: unknown } };
  type?: { main_trans?: { title?: unknown } };
  category?: { parents_with_self?: { title?: unknown }[] };
};
const clean = (value: string) =>
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
const attr = (tag: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp("(?:^|\\s)" + escaped + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i"))?.[2];
};
const norm = (s: string) =>
  clean(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
function productUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const u = new URL(value.replace(/&amp;/g, "&"), "https://irshad.az");
    if (
      u.protocol !== "https:" ||
      !/^(www\.)?irshad\.az$/.test(u.hostname) ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      !/^\/(?:az\/)?mehsullar\/[^/]+\/?$/.test(u.pathname)
    )
      return undefined;
    u.hash = "";
    return u.href;
  } catch {
    return undefined;
  }
}
function sameProductUrl(a: string, b: string) {
  const path = (raw: string) => new URL(raw).pathname.replace(/^\/az\//, "/").replace(/\/$/, "");
  return path(a) === path(b);
}
function imageUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const u = new URL(value.replace(/&amp;/g, "&"), "https://irshad.az");
    return u.protocol === "https:" &&
      /^(?:storage\.)?irshad\.az$/.test(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port &&
      !/\.(?:svg|gif)(?:$|\?)/i.test(u.pathname)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
function sections(html: string): Section[] {
  if (html.length > 6000000) throw new Error("İrşad məhsul sənədi ölçü limitini keçir.");
  const found: Section[] = [];
  for (const opening of html.matchAll(/<section\b([^>]*)>/gi)) {
    const classes = (attr(opening[1], "class") || "").split(/\s+/);
    if (!classes.includes("product-view")) continue;
    const sku = attr(opening[1], "id")?.match(/^productSection(\d+)$/)?.[1];
    if (!sku) throw new Error("Məhsul bölməsinin sabit kodu oxunmadı.");
    const start = opening.index! + opening[0].length;
    const tags = /<\/?section\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 1,
      closing: RegExpExecArray | null = null;
    while ((closing = tags.exec(html))) {
      depth += /^<\//.test(closing[0]) ? -1 : 1;
      if (depth === 0) break;
    }
    if (!closing) throw new Error("İrşad məhsul bölməsi yarımçıqdır.");
    const active =
      !classes.includes("d-none") &&
      !classes.includes("hidden") &&
      !/(?:^|\s)hidden(?:\s|=|$)/i.test(opening[1]) &&
      attr(opening[1], "aria-hidden") !== "true" &&
      !/display\s*:\s*none/i.test(attr(opening[1], "style") || "");
    found.push({
      attrs: opening[1],
      body: html.slice(start, closing.index),
      sku,
      active,
      url: productUrl(attr(opening[1], "data-url")),
    });
  }
  if (!found.length || found.length > 100 || new Set(found.map((s) => s.sku)).size !== found.length)
    throw new Error("İrşad məhsul variantları dəqiq müəyyənləşmədi.");
  return found;
}
function analyticsRows(html: string): MerchantRow[] {
  const result: MerchantRow[] = [];
  for (const marker of html.matchAll(/\bemitDataLayerEvent\s*\(\s*(?=\[)/g)) {
    const start = marker.index! + marker[0].length;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < Math.min(html.length, start + 1500000); i++) {
      const c = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (!depth) {
          try {
            const value = JSON.parse(html.slice(start, i + 1));
            if (Array.isArray(value))
              result.push(...value.filter((v) => v && typeof v === "object"));
          } catch {
            /* Analytics is optional and is never executed. */
          }
          break;
        }
      }
    }
  }
  return result;
}
function priceValue(text: string) {
  if (!/(?:\bAZN\b|₼)/i.test(text) || /\b(?:USD|EUR|RUB|TRY)\b|[$€]/i.test(text))
    throw new Error("Aktiv variantın AZN qiyməti oxunmadı.");
  let amount = text.replace(/AZN|₼|[\s\u00a0\u202f]/gi, "");
  if (!/^\d[\d.,]*$/.test(amount)) throw new Error("İrşad qiymət formatı düzgün deyil.");
  const separator = Math.max(amount.lastIndexOf("."), amount.lastIndexOf(","));
  if (separator >= 0) {
    const decimals = amount.length - separator - 1;
    amount =
      decimals > 0 && decimals <= 2
        ? amount.slice(0, separator).replace(/[.,]/g, "") + "." + amount.slice(separator + 1)
        : amount.replace(/[.,]/g, "");
  }
  const price = Number(amount);
  if (!Number.isFinite(price) || price <= 0 || price > 10000000)
    throw new Error("İrşad qiyməti düzgün deyil.");
  return price;
}
function categoryFrom(type: string, name: string) {
  const text = (type || name).toLocaleLowerCase("az");
  if (/aksesuar|adapter|çanta|kab[eə]l|klaviatura|siçan|mouse|keyboar|qoruyucu/.test(text))
    return "aksesuar";
  if (/qulaql|airpods|dinamik|audio|headphone/.test(text)) return "audio";
  if (/planşet|planset|ipad/.test(text)) return "planset";
  if (/telefon|iphone|smartfon|galaxy|redmi|poco|honor/.test(text)) return "telefon";
  if (/noutbuk|notbuk|notebook|macbook|laptop/.test(text)) return "noutbuk";
  if (/televizor|television|\btv\b/.test(text)) return "tv";
  if (/saat|watch/.test(text)) return "saat";
  if (/playstation|xbox|oyun/.test(text)) return "oyun";
  if (/kitab|isbn/.test(text)) return "kitab";
  if (/foto|kamera|camera/.test(text)) return "foto";
  if (/fen|saç|hair|kosmet|ətir/.test(text)) return "gozellik";
  if (/soyuducu|paltaryuyan|qabyuyan|tozsoran|soba|ütü|mikser|blender|məişət|meişət/.test(text))
    return "ev";
  return undefined;
}
// Credit terms printed next to the price. The store's own plan: radio inputs carrying
// data-monthly-payment and data-total-price, labelled "N ay". Bank cards: "200 AZN x 12 ay" followed
// by "Birbank ilə 12 aya faizsiz ödə!". Kept here (not in lib/installments.ts) so this module stays
// import-free; the rules match normalizeInstallments(): cheapest total per term, at most six terms,
// interestFree = total not above the cash price.
type Term = {
  months: number;
  total: number;
  monthly: number;
  provider?: string;
  interestFree?: boolean;
};
const money = (raw: string | undefined) => {
  const s = (raw || "").replace(/AZN|₼|\s/gi, "");
  return /^\d+(?:\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
};
export function irshadInstallments(block: string, cash: number): Term[] {
  const raw: Omit<Term, "interestFree">[] = [];
  const labels = new Map<string, number>();
  for (const l of block.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const months = clean(l[2]).match(/^(\d{1,2})\s*ay$/i)?.[1];
    const target = attr(l[1], "for");
    if (months && target) labels.set(target, Number(months));
  }
  for (const input of block.matchAll(/<input\b([^>]*)>/gi)) {
    const monthly = money(attr(input[1], "data-monthly-payment"));
    const months = labels.get(attr(input[1], "id") || "") || 0;
    if (!months || !(monthly > 0)) continue;
    const stated = money(attr(input[1], "data-total-price"));
    const total =
      stated > 0 && Math.abs(stated - monthly * months) <= months * 0.01
        ? stated
        : Math.round(monthly * months * 100) / 100;
    raw.push({ months, total, monthly, provider: "İrşad hissəli ödəniş" });
  }
  for (const m of clean(block).matchAll(
    /(\d+(?:\.\d{1,2})?)\s*(?:AZN|₼)\s*x\s*(\d{1,2})\s*ay\s+([\p{L}][\p{L}\p{N} .-]{1,40}?)\s+ilə\s+(\d{1,2})\s+aya\s+faizsiz/giu,
  )) {
    const monthly = Number(m[1]),
      months = Number(m[2]);
    if (m[2] !== m[4] || !(monthly > 0)) continue;
    raw.push({
      months,
      monthly,
      total: Math.round(monthly * months * 100) / 100,
      provider: m[3].trim(),
    });
  }
  const best = new Map<number, Term>();
  for (const t of raw) {
    if (t.months < 2 || t.months > 60 || (cash > 0 && t.total < cash * 0.9)) continue;
    const term = { ...t, interestFree: cash > 0 && t.total <= cash + t.months * 0.01 };
    const prior = best.get(t.months);
    if (!prior || term.total < prior.total - 0.005) best.set(t.months, term);
    else if (Math.abs(term.total - prior.total) < 0.005 && term.provider) {
      const names = new Set([...(prior.provider || "").split(", "), term.provider].filter(Boolean));
      prior.provider = [...names].join(", ").slice(0, 80);
    }
  }
  return [...best.values()].sort((a, b) => a.months - b.months).slice(-6);
}
function sectionProduct(section: Section, metadata?: MerchantRow): ScannedProduct {
  const { body, sku: sectionId } = section;
  const name = clean(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  if (!name || name.length > 400) throw new Error("İrşad məhsul adı oxunmadı.");
  const firstCode = body.match(/\bdata-product-code\s*=\s*["']([^"']+)["']/i)?.[1];
  const sku = firstCode || sectionId;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sku)) throw new Error("İrşad məhsul kodu düzgün deyil.");
  const codeText = body.match(
    /<div\b[^>]*class=["'][^"']*\bproduct__code\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1];
  const visibleCode = codeText?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (visibleCode && clean(visibleCode) !== sku)
    throw new Error("İrşad görünən məhsul kodu uyğun gəlmir.");
  const detailsAt = body.search(/class=["'][^"']*\bproduct-view__details\b/i);
  const pricing = detailsAt >= 0 ? body.slice(0, detailsAt) : body;
  const prices = [...pricing.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
    .filter((m) => (attr(m[1], "class") || "").split(/\s+/).includes("new-price"))
    .map((m) => priceValue(clean(m[2])));
  const unique = [...new Set(prices)];
  if (unique.length !== 1) throw new Error("İrşad variantının tək AZN qiyməti müəyyənləşmədi.");
  const titleBoundary = body.search(/class=["'][^"']*\bproduct-view__fixed-bar\b/i);
  const stockLabels = clean(
    titleBoundary >= 0 ? body.slice(0, titleBoundary) : body.slice(0, 3500),
  );
  const unavailable = /stokda\s+yoxdur|mövcud\s+deyil|satışda\s+yoxdur|tükənib|bitib/i.test(
    stockLabels,
  );
  const available = /stokda\s+var/i.test(stockLabels);
  if (available && unavailable) throw new Error("İrşad stok məlumatı ziddiyyətlidir.");
  const gallery = [...body.matchAll(/<a\b([^>]*)>/gi)].find(
    (m) => attr(m[1], "data-fancybox") === "gallery-" + sectionId,
  );
  const image =
    imageUrl(gallery && attr(gallery[1], "href")) ||
    [...body.matchAll(/<img\b([^>]*)>/gi)]
      .filter((m) => norm(attr(m[1], "alt") || "") === norm(name))
      .map((m) => imageUrl(attr(m[1], "src")))
      .find(Boolean);
  const specs: Record<string, string> = {};
  const variants: string[] = [];
  for (const group of body.matchAll(
    /<span\b[^>]*>([^<]+)<\/span>\s*<ul\b([^>]*\bclass=["'][^"']*\bproduct__(?:colors|memory)\b[^"']*["'][^>]*)>([\s\S]*?)<\/ul>/gi,
  )) {
    const key = clean(group[1]).replace(/:$/, "").trim();
    const checked = [...group[3].matchAll(/<input\b([^>]*)>/gi)].find((m) =>
      /(?:^|\s)checked(?:\s|=|$)/i.test(m[1]),
    );
    const inputId = checked && attr(checked[1], "id");
    const label =
      inputId &&
      [...group[3].matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)].find(
        (m) => attr(m[1], "for") === inputId,
      );
    const text = label ? clean(label[2]) : "";
    const color =
      label &&
      attr(label[1], "style")
        ?.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1]
        ?.trim();
    const value = text || color;
    if (key && value) {
      specs[key] = value.slice(0, 200);
      if (text || !/^#|^rgb/i.test(value)) variants.push(value);
      else if (/rəng/i.test(key)) {
        const memoryParts = [...name.matchAll(/\d+\s*(?:GB|TB)\b/gi)];
        const lastMemory = memoryParts.at(-1);
        const colorName = lastMemory && name.slice(lastMemory.index! + lastMemory[0].length).trim();
        if (colorName && colorName.length <= 50) variants.push(colorName);
      }
    }
  }
  const technical =
    body.match(
      new RegExp(
        "<div\\b[^>]*id=[\"']technical" +
          sectionId +
          "[\"'][^>]*>([\\s\\S]*?)(?=<div\\b[^>]*id=[\"']description" +
          sectionId +
          "[\"']|$)",
        "i",
      ),
    )?.[1] || "";
  const blocks = technical
    .split(/<div\b[^>]*class=["'][^"']*\bproduct-view__details__technical-info__item["'\s]/i)
    .slice(1);
  for (const block of blocks) {
    const heading = clean(block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
    const items = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => clean(m[1]))
      .filter(Boolean);
    if (!heading) continue;
    for (const item of items) {
      const at = item.indexOf(":");
      const key = at > 0 ? heading + " — " + item.slice(0, at).trim() : heading;
      const value = at > 0 ? item.slice(at + 1).trim() : item;
      if (value)
        specs[key.slice(0, 100)] = (specs[key] ? specs[key] + " · " + value : value).slice(0, 200);
    }
  }
  const description = clean(
    body.match(
      new RegExp(
        "<div\\b[^>]*id=[\"']product__desc_" + sectionId + "[\"'][^>]*>([\\s\\S]*?)<\\/div>",
        "i",
      ),
    )?.[1] || "",
  ).slice(0, 1500);
  const brand = metadata?.brand?.main_trans?.title;
  const model = metadata?.model;
  if (typeof model === "string" && model) specs["İstehsalçı modeli"] = model.slice(0, 200);
  const installmentOptions = irshadInstallments(pricing, unique[0]);
  return {
    name,
    sku,
    price: unique[0],
    currency: "AZN",
    stock: available,
    stockKnown: available || unavailable,
    checkedAt: new Date().toISOString(),
    image,
    brand: typeof brand === "string" ? brand : undefined,
    description,
    specs,
    variant: variants.length ? variants.join(" · ") : "Mənbədəki model",
    variantId: sectionId,
    familyId: metadata?.group?.id ? "irshad-group-" + metadata.group.id : undefined,
    category: categoryFrom(
      typeof metadata?.type?.main_trans?.title === "string" ? metadata.type.main_trans.title : "",
      name,
    ),
    url: section.url,
    ...(installmentOptions.length ? { installmentOptions } : {}),
  };
}
function parsePage(html: string, requestedUrl?: string, includeVariants = false) {
  const all = sections(html),
    active = all.filter((s) => s.active);
  if (active.length !== 1) throw new Error("Aktiv məhsul variantı dəqiq müəyyənləşmədi.");
  const canonicalTag = [...html.matchAll(/<link\b([^>]*)>/gi)].find(
    (m) => attr(m[1], "rel") === "canonical",
  );
  const canonical = productUrl(canonicalTag && attr(canonicalTag[1], "href"));
  const requested = requestedUrl && productUrl(requestedUrl);
  if (requestedUrl && !requested) throw new Error("İrşad məhsul ünvanı düzgün deyil.");
  if (requested && active[0].url && !sameProductUrl(requested, active[0].url))
    throw new Error("Aktiv İrşad variantı soruşulan URL-ə uyğun deyil.");
  if (canonical && active[0].url && !sameProductUrl(canonical, active[0].url))
    throw new Error("Aktiv İrşad variantı canonical ünvanına uyğun deyil.");
  const rows = analyticsRows(html);
  // Analytics metadata is accepted only for a represented SKU. A shared brand/type is safe only
  // when its explicit group title appears in every represented variant title.
  const family = rows.find(
    (row) =>
      all.some((s) => s.sku === String(row.id)) &&
      typeof row.group?.title === "string" &&
      norm(row.group.title).length >= 4 &&
      all.every((s) =>
        norm(s.body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").includes(
          norm(String(row.group?.title)),
        ),
      ),
  );
  const ordered = [active[0], ...(includeVariants ? all.filter((s) => s !== active[0]) : [])];
  const products: ScannedProduct[] = [],
    skipped: { variantId: string; url?: string; error: string }[] = [];
  for (const s of ordered) {
    try {
      const own = rows.find((row) => String(row.id) === s.sku);
      const product = sectionProduct(s, own || family);
      if (s === active[0] && canonical) product.url = canonical;
      if (!product.url) {
        if (s === active[0] && requested) product.url = requested;
        else if (s !== active[0]) throw new Error("İrşad variantının açıq məhsul URL-i yoxdur.");
      }
      products.push(product);
    } catch (error) {
      if (s === active[0]) throw error;
      skipped.push({
        variantId: s.sku,
        url: s.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { products, skipped, totalSections: all.length };
}
export function extractIrshadCatalogPage(html: string, requestedUrl?: string) {
  return parsePage(html, requestedUrl, true);
}
export function extractIrshadVariants(html: string, requestedUrl?: string): ScannedProduct[] {
  return extractIrshadCatalogPage(html, requestedUrl).products;
}
export function extractIrshad(html: string, requestedUrl?: string): ScannedProduct {
  return parsePage(html, requestedUrl, false).products[0];
}

function divBlocks(html: string, wanted: (attrs: string) => boolean) {
  const blocks: { attrs: string; body: string }[] = [];
  const opening = /<div\b([^>]*)>/gi;
  let found: RegExpExecArray | null;
  while ((found = opening.exec(html))) {
    if (!wanted(found[1])) continue;
    const start = found.index + found[0].length;
    const tags = /<\/?div\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 1,
      closing: RegExpExecArray | null = null;
    while ((closing = tags.exec(html))) {
      depth += /^<\//.test(closing[0]) ? -1 : 1;
      if (!depth) break;
    }
    if (!closing) throw new Error("İrşad məhsul kartı yarımçıqdır.");
    blocks.push({ attrs: found[1], body: html.slice(start, closing.index) });
    opening.lastIndex = closing.index + closing[0].length;
  }
  return blocks;
}
const hasClass = (attrs: string, name: string) =>
  (attr(attrs, "class") || "").split(/\s+/).includes(name);
/** Parse the public product-list fragment. Every price is bound to its own data-selected-id.
 * Hidden color choices are accepted only with explicit id + title + URL + original image.
 */
export function extractIrshadListing(html: string) {
  if (html.length > 12000000) throw new Error("İrşad siyahısı ölçü limitini keçir.");
  const cards = divBlocks(html, (attrs) => hasClass(attrs, "product"));
  const products = new Map<string, ScannedProduct>();
  const skipped: { variantId: string; url?: string; error: string }[] = [];
  const rows = analyticsRows(html);
  for (const card of cards) {
    const titleLink = [...card.body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find((m) =>
      hasClass(m[1], "product__name"),
    );
    if (!titleLink) {
      skipped.push({ variantId: "", error: "Kartın məhsul başlığı yoxdur." });
      continue;
    }
    const cardId =
      (attr(titleLink[1], "data-selected-id") || "").match(/^(\d+)(?:_|$)/)?.[1] ||
      (attr(card.attrs, "class") || "").match(/\bproduct-(\d+)(?:_|\s|$)/)?.[1];
    if (!cardId) {
      skipped.push({ variantId: "", error: "Kartın sabit məhsul ID-si yoxdur." });
      continue;
    }
    const choices = new Map<
      string,
      { name: string; url?: string; image?: string; group?: string }
    >();
    const defaultName = clean(titleLink[2]);
    const imageBlock = divBlocks(card.body, (attrs) => hasClass(attrs, "product__img")).find(
      (b) => (attr(b.attrs, "data-selected-id") || "").split("_")[0] === cardId,
    );
    const defaultImage =
      imageBlock &&
      [...imageBlock.body.matchAll(/<img\b([^>]*)>/gi)]
        .map((m) => imageUrl(attr(m[1], "src")))
        .find(Boolean);
    choices.set(cardId, {
      name: defaultName,
      url: productUrl(attr(titleLink[1], "href")),
      image: defaultImage,
    });
    for (const input of card.body.matchAll(/<input\b([^>]*)>/gi)) {
      const id = attr(input[1], "value"),
        inputName = attr(input[1], "name") || "";
      if (!id || !/^\d+$/.test(id) || !inputName.startsWith("color_")) continue;
      const name = clean(attr(input[1], "data-title") || ""),
        url = productUrl(attr(input[1], "data-url")),
        image = imageUrl(attr(input[1], "data-img-src"));
      if (name && url && image)
        choices.set(id, { name, url, image, group: inputName.match(/^color_(\d+)_/)?.[1] });
    }
    const tools = divBlocks(card.body, (attrs) => hasClass(attrs, "product__tools"));
    const prices = divBlocks(card.body, (attrs) => hasClass(attrs, "product__flex-right"));
    const type = clean(
      divBlocks(card.body, (attrs) => hasClass(attrs, "product__type"))[0]?.body || "",
    );
    for (const [variantId, facts] of choices) {
      try {
        if (!facts.name || !facts.url || !facts.image)
          throw new Error("Variantın adı, URL-i və ya öz şəkli yoxdur.");
        const priceBlocks = prices.filter((b) => attr(b.attrs, "data-selected-id") === variantId);
        if (priceBlocks.length !== 1)
          throw new Error("Qiymət bloku məhsul ID-si ilə dəqiq bağlanmayıb.");
        const own = priceBlocks[0].body;
        const amounts = [
          ...new Set(
            [...own.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
              .filter((m) => hasClass(m[1], "new-price"))
              .map((m) => priceValue(clean(m[2]))),
          ),
        ];
        if (amounts.length !== 1) throw new Error("Variantın tək nağd AZN qiyməti yoxdur.");
        const labelText = clean(
          divBlocks(own, (attrs) => hasClass(attrs, "product__labels"))[0]?.body || "",
        );
        const stock = /stokda\s+var/i.test(labelText),
          unavailable = /stokda\s+yoxdur|mövcud\s+deyil|satışda\s+yoxdur|tükənib|bitib/i.test(
            labelText,
          );
        if (stock && unavailable) throw new Error("Variantın stok məlumatı ziddiyyətlidir.");
        const tool = tools.find((b) => attr(b.attrs, "data-selected-id") === variantId);
        const sku =
          tool?.body.match(/\bdata-product-code\s*=\s*["']([^"']+)["']/i)?.[1] || variantId;
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sku))
          throw new Error("Variantın məhsul kodu düzgün deyil.");
        const metadata = rows.find((r) => String(r.id) === variantId);
        const brand = metadata?.brand?.main_trans?.title;
        const product: ScannedProduct = {
          name: facts.name,
          sku,
          variantId,
          familyId: facts.group ? "irshad-group-" + facts.group : undefined,
          url: facts.url,
          image: facts.image,
          price: amounts[0],
          currency: "AZN",
          stock,
          stockKnown: stock || unavailable,
          checkedAt: new Date().toISOString(),
          brand: typeof brand === "string" ? brand : undefined,
          category: categoryFrom(type, facts.name),
          variant: "Mənbədəki model",
          specs: type ? { "Mənbə məhsul növü": type } : {},
        };
        const installmentOptions = irshadInstallments(own, amounts[0]);
        if (installmentOptions.length) product.installmentOptions = installmentOptions;
        const existing = products.get(variantId);
        if (
          existing &&
          (existing.name !== product.name ||
            existing.price !== product.price ||
            !sameProductUrl(existing.url!, product.url!))
        )
          throw new Error("Təkrar məhsul ID-si ziddiyyətli məlumat verir.");
        products.set(variantId, product);
      } catch (error) {
        skipped.push({
          variantId,
          url: facts.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return { products: [...products.values()], skipped, totalCards: cards.length };
}
