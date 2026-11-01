import { extractAlinino } from "./alinino";
import { extractIrshad as parseIrshad, extractIrshadVariants } from "./irshad";
import { robotsAllowed, robotsCrawlDelayMs, robotsSitemaps } from "./robots";
import { merchantDomains } from "./merchants";
import { htmlProductReaders, productFixups } from "./html-products";
import { parsePrice } from "./price";
export { parsePrice };
// Only known merchant hosts may be fetched. Never bypass access challenges.
export const allowedHosts = merchantDomains;
export function safeMerchantUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !allowedHosts.some((h) => u.hostname === h || u.hostname === `www.${h}`)
  )
    throw new Error("Yalnız dəstəklənən mağazanın HTTPS ünvanını daxil edin.");
  return u;
}
export class SourceAccessError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs = 0,
    public challenge = false,
  ) {
    super(message);
    this.name = "SourceAccessError";
  }
}
// Bot-protection interstitials (served with 200 or 403/503). These are never retried or bypassed:
// the source is stopped and marked blocked.
const challengeMarkers =
  /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare|DDoS-Guard|Checking your browser)|window\._cf_chl_opt|cf-browser-verification|id=["']challenge-form["']/i;
export function isBotChallenge(html: string) {
  return challengeMarkers.test(html.slice(0, 20000));
}
// 401/403/429 and bot challenges stop the source (see lib/crawl-jobs.ts).
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const crawlDelays = new Map<string, number>();
// Crawl-delay announced by the host's robots.txt, as last read by this isolate.
export function crawlDelayMs(host: string) {
  return crawlDelays.get(host.replace(/^www\./, "")) || 0;
}
// Hosts whose robots.txt asks for a Crawl-delay (seconds × 1000); every other host gets 1 s.
const slowHosts: Record<string, number> = { "irshad.az": 30000, "smarton.az": 30000 };
const nextFetch = new Map<string, number>();
const fetchQueues = new Map<string, Promise<unknown>>();
async function sourceFetch(url: URL, timeoutMs = 12000, extraHeaders: Record<string, string> = {}) {
  const host = url.hostname.replace(/^www\./, "");
  const prior = fetchQueues.get(host) || Promise.resolve();
  const task = prior
    .catch(() => {})
    .then(async () => {
      const wait = Math.max(0, (nextFetch.get(host) || 0) - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      nextFetch.set(host, Date.now() + Math.max(slowHosts[host] || 1000, crawlDelayMs(host)));
      return fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "QepikBot/1.0 (+https://qepik-az.mythicfern36.chatgpt.site)",
          Accept: "text/html,text/plain;q=0.8",
          ...extraHeaders,
        },
      });
    });
  fetchQueues.set(host, task);
  try {
    return await task;
  } finally {
    if (fetchQueues.get(host) === task) fetchQueues.delete(host);
  }
}
async function sourceResponse(
  url: URL,
  timeoutMs = 12000,
  extraHeaders: Record<string, string> = {},
) {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const r = await sourceFetch(current, timeoutMs, extraHeaders);
    if (r.headers.get("cf-mitigated")?.toLowerCase() === "challenge") {
      await r.body?.cancel().catch(() => {});
      throw new SourceAccessError(
        "Mağaza bot yoxlaması göstərir; mənbə dayandırıldı.",
        403,
        0,
        true,
      );
    }
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel().catch(() => {});
      const location = r.headers.get("location");
      if (!location) throw new Error("Yönləndirmə ünvanı yoxdur.");
      const next = safeMerchantUrl(new URL(location, current).href);
      if (next.hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, ""))
        throw new Error("Başqa mağazaya yönləndirmə rədd edildi.");
      current = next;
      continue;
    }
    return r;
  }
  throw new Error("Yönləndirmə limiti keçildi.");
}
async function readPage(url: URL, extraHeaders: Record<string, string> = {}, json = false) {
  const response = await sourceResponse(url, 12000, extraHeaders);
  const type = response.headers.get("content-type") || "";
  if (response.ok && !(json ? type.includes("application/json") : type.includes("text/html"))) {
    await response.body?.cancel().catch(() => {});
    throw new Error(json ? "Mənbə JSON cavabı vermədi." : "Mənbə HTML səhifəsi deyil.");
  }
  const text = await limitedText(response);
  if (!json && isBotChallenge(text))
    throw new SourceAccessError("Mağaza bot yoxlaması göstərir; mənbə dayandırıldı.", 403, 0, true);
  return text;
}
async function limitedText(r: Response) {
  if (!r.ok) {
    await r.body?.cancel().catch(() => {});
    const retry = r.headers.get("retry-after");
    // Retry-After (seconds or HTTP date), capped at one hour; 0 when the server gives none.
    const delay = retry
      ? /^\d+$/.test(retry.trim())
        ? Number(retry.trim()) * 1000
        : Math.max(0, Date.parse(retry) - Date.now())
      : 0;
    throw new SourceAccessError(
      `Mağaza sorğunu qəbul etmədi (HTTP ${r.status}).`,
      r.status,
      Number.isFinite(delay) ? Math.min(delay, 3600000) : 0,
    );
  }
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Səhifə boşdur.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const v = await reader.read();
    if (v.done) break;
    bytes += v.value.length;
    if (bytes > 3000000) {
      await reader.cancel();
      throw new Error("Səhifə 3 MB limitini keçir.");
    }
    chunks.push(v.value);
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(all);
}
// A sitemap is read when robots.txt allows its path, when robots.txt itself advertises it
// (Sitemap: line), or when it is listed by a sitemap index that was read under those rules.
export async function readMerchantSitemap(raw: string, options: { advertised?: boolean } = {}) {
  const url = safeMerchantUrl(raw);
  const policy = await robotsPolicy(url);
  const listed = robotsSitemaps(policy).some((s) => {
    try {
      return new URL(s).href === url.href;
    } catch {
      return false;
    }
  });
  if (!options.advertised && !listed && !robotsAllowed(policy, url.pathname + url.search))
    throw new RobotsDisallowedError();
  const r = await sourceResponse(url, 45000);
  if (!r.ok) await limitedText(r);
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Sitemap boşdur.");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    size += x.value.length;
    if (size > 12000000) {
      await reader.cancel();
      throw new Error("Sitemap 12 MB limitini keçir.");
    }
    parts.push(x.value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return new TextDecoder().decode(all);
}
// Minimal HTML entity decoding for text read from meta tags and JSON-LD.
export function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) =>
      String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)),
    )
    .replace(/&#(\d{1,7});/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&amp;/g, "&");
}
// schema.org ItemAvailability (full URL or bare name) and the common og/meta spellings. Anything
// unrecognised is unknown stock, never "out of stock".
export function stockFromAvailability(raw: unknown) {
  const value = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/[\s_-]/g, "")
    .toLowerCase();
  if (["instock", "limitedavailability", "onlineonly", "instoreonly"].includes(value))
    return { stock: true, stockKnown: true };
  if (["outofstock", "soldout", "discontinued", "oos", "preorder", "backorder"].includes(value))
    return { stock: false, stockKnown: true };
  return { stock: false, stockKnown: false };
}
export function extractMetaProduct(html: string) {
  const fields = new Map<string, string[]>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag[0].match(/(?:property|name)\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
    const value = tag[0].match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
    if (key && value !== undefined)
      fields.set(key, [...(fields.get(key) || []), decodeEntities(value).trim()]);
  }
  const one = (...keys: string[]) => {
    for (const k of keys) {
      const values = [...new Set((fields.get(k) || []).filter(Boolean))];
      if (values.length) return values;
    }
    return [];
  };
  const amounts = one("product:price:amount", "og:price:amount");
  const currency = one("product:price:currency", "og:price:currency")[0] || "";
  const title = one("og:title")[0];
  if (amounts.length !== 1 || currency.toUpperCase() !== "AZN" || !title)
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const listed = parsePrice(amounts[0]);
  if (!Number.isFinite(listed)) throw new Error("Qiymət formatı düzgün deyil.");
  // A sale price below the listed one is what the buyer pays (bytelecom.az prints the regular price
  // as product:price:amount and the current one as product:discount_price). "0"/empty means none.
  const sales = one(
    "product:sale_price:amount",
    "og:sale_price:amount",
    "product:discount_price",
    "og:discount_price",
  )
    .map(parsePrice)
    .filter((v) => Number.isFinite(v) && v < listed);
  if (new Set(sales).size > 1) throw new Error("Endirimli qiymət birmənalı deyil.");
  const price = sales[0] ?? listed;
  const availability = stockFromAvailability(one("product:availability", "og:availability")[0]);
  return {
    // Store SEO suffixes ("… qiymeti ve kreditle satisi") are not part of the product name.
    name: title.replace(/\s+qiym[eə]ti\s+v[eə]\s+kreditl[eə]\s+sat[iı][sş][iı]\s*$/i, "").trim(),
    image: one("og:image")[0],
    description: one("description", "og:description")[0] || "",
    brand: one("product:brand")[0],
    sku: one("product:retailer_item_id")[0] || "",
    gtin: "",
    price,
    currency: "AZN",
    ...availability,
    checkedAt: new Date().toISOString(),
  };
}
// The parts of schema.org Product JSON-LD that are read; values are coerced and validated below.
type LdOffer = { price?: unknown; priceCurrency?: unknown; availability?: unknown };
type LdImage = string | { url?: unknown };
type LdProduct = {
  "@type"?: string | string[];
  "@graph"?: unknown;
  mainEntity?: unknown;
  name?: unknown;
  description?: unknown;
  sku?: unknown;
  mpn?: unknown;
  productID?: unknown;
  gtin?: unknown;
  gtin13?: unknown;
  isbn?: unknown;
  brand?: string | { name?: unknown };
  image?: LdImage | LdImage[];
  offers?: LdOffer | LdOffer[];
};
export type ScannedProduct = {
  name: string;
  sku: string;
  price: number;
  currency: string;
  stock: boolean;
  stockKnown: boolean;
  checkedAt: string;
  image?: string;
  brand?: string;
  description?: string;
  gtin?: string;
  specs?: Record<string, string>;
  variant?: string;
  variantId?: string;
  familyId?: string;
  category?: string;
  url?: string;
  variants?: ScannedProduct[];
  // Crossed-out price shown next to the sale price; never used as the offer price.
  oldPrice?: number;
};
export function extractProduct(html: string) {
  const all: LdProduct[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const o = value as LdProduct;
    if (
      [o["@type"]]
        .flat()
        .some((t) => /^(?:(?:https?:\/\/)?schema\.org\/|schema:)?Product$/.test(String(t)))
    )
      all.push(o);
    if (o["@graph"]) walk(o["@graph"]);
    if (o.mainEntity) walk(o.mainEntity);
  };
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  }
  if (!all.length) {
    try {
      return extractMetaProduct(html);
    } catch (metaError) {
      try {
        return extractMicrodataProduct(html);
      } catch {
        throw metaError;
      }
    }
  }
  const candidates = all
    .map((p) => {
      const o = Array.isArray(p.offers)
        ? p.offers.length === 1
          ? p.offers[0]
          : undefined
        : p.offers;
      return { p, o };
    })
    .filter(
      (v): v is { p: LdProduct; o: LdOffer } =>
        v.o?.price !== undefined && String(v.o?.priceCurrency || "").toUpperCase() === "AZN",
    );
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "Bir neçə məhsul tapıldı. Dəqiq məhsul səhifəsindən istifadə edin."
        : "AZN valyutalı tək məhsul qiyməti oxunmadı. JS/anti-bot səhifəsi ola bilər; manual idxaldan istifadə edin.",
    );
  const { p, o } = candidates[0];
  const price = parsePrice(o.price);
  if (!Number.isFinite(price)) throw new Error("Qiymət formatı düzgün deyil.");
  const first = Array.isArray(p.image) ? p.image[0] : p.image;
  const image = typeof first === "string" ? first : first?.url;
  const brand = typeof p.brand === "string" ? p.brand : p.brand?.name;
  return {
    image: typeof image === "string" ? image : undefined,
    brand: brand ? decodeEntities(String(brand)).trim() : undefined,
    description: decodeEntities(String(p.description || "").replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500),
    gtin: String(p.gtin13 || p.gtin || p.isbn || ""),
    name: decodeEntities(String(p.name || "")).trim(),
    sku: decodeEntities(String(p.sku || p.mpn || p.gtin13 || p.productID || "")).trim(),
    price,
    currency: "AZN",
    ...stockFromAvailability(o.availability),
    checkedAt: new Date().toISOString(),
  };
}
// schema.org Product microdata (itemprop attributes), e.g. OpenCart and Tilda product pages.
// Exactly one distinct AZN price must be present, so pages listing several products are rejected.
export function extractMicrodataProduct(html: string): ScannedProduct {
  const start = html.search(/itemtype\s*=\s*["']https?:\/\/schema\.org\/Product["']/i);
  if (start < 0) throw new Error("Məhsul mikrodatası tapılmadı.");
  const scope = html.slice(start);
  const props = (name: string) =>
    [
      ...scope.matchAll(
        new RegExp("<(\\w+)\\b[^>]*itemprop\\s*=\\s*[\"']" + name + "[\"'][^>]*>", "gi"),
      ),
    ].map((m) => {
      const tag = m[0];
      const value = tag.match(/(?:content|href|src)\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
      if (value !== undefined) return value.replace(/&amp;/g, "&").trim();
      const close = scope.indexOf("</" + m[1], (m.index || 0) + tag.length);
      return close < 0
        ? ""
        : scope
            .slice((m.index || 0) + tag.length, close)
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim();
    });
  const prices = [...new Set(props("price").map(parsePrice))];
  const currencies = [...new Set(props("priceCurrency"))];
  if (prices.length !== 1 || currencies.length !== 1 || currencies[0] !== "AZN")
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const price = prices[0];
  if (!Number.isFinite(price) || price <= 0 || price > 10000000)
    throw new Error("Qiymət formatı düzgün deyil.");
  // The product name is the heading marked itemprop="name", not a breadcrumb item's name.
  const heading = scope.match(/<h1\b[^>]*itemprop\s*=\s*["']name["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const name = (heading ? heading.replace(/<[^>]*>/g, " ") : props("name")[0] || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) throw new Error("Məhsul adı oxunmadı.");
  const brandScope = scope.match(
    /itemprop\s*=\s*["']brand["'][^>]*itemscope[\s\S]*?itemprop\s*=\s*["']name["'][^>]*>([^<]*)</i,
  )?.[1];
  const availability = props("availability")[0] || "";
  const image =
    props("image")[0] ||
    html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)/i)?.[1];
  return {
    name,
    image: image && /^https:\/\//.test(image) ? image : undefined,
    brand: (brandScope || props("brand")[0] || "").trim() || undefined,
    description: (props("description")[0] || "").slice(0, 1500),
    sku: props("sku")[0] || props("mpn")[0] || props("productID")[0] || "",
    gtin: props("gtin13")[0] || "",
    price,
    currency: "AZN",
    stock: /InStock$/i.test(availability),
    stockKnown: /(InStock|OutOfStock|SoldOut|Discontinued|PreOrder)$/i.test(availability),
    checkedAt: new Date().toISOString(),
  };
}
export function extractIrshad(html: string, requestedUrl?: string) {
  return parseIrshad(html, requestedUrl);
}
export class RobotsDisallowedError extends Error {
  constructor() {
    super("Mənbə bu ünvanı avtomatik oxumağa açmır.");
    this.name = "RobotsDisallowedError";
  }
}
const robotsCache = new Map<string, { text: string; at: number }>();
// robots.txt per origin, cached for 5 minutes. A missing file (404/410 and other 4xx) allows all;
// 401/403/429 and bot challenges throw SourceAccessError so the source is stopped; 5xx and
// network errors throw so nothing is fetched until robots.txt can be read.
async function robotsPolicy(url: URL) {
  const key = url.origin;
  let policy = robotsCache.get(key);
  if (!policy || Date.now() - policy.at > 300000) {
    const r = await sourceResponse(new URL("/robots.txt", url));
    if (r.status >= 400 && r.status < 500 && !BLOCKED_STATUSES.has(r.status)) {
      await r.body?.cancel().catch(() => {});
      policy = { text: "", at: Date.now() };
    } else policy = { text: await limitedText(r), at: Date.now() };
    if (isBotChallenge(policy.text))
      throw new SourceAccessError(
        "Mağaza bot yoxlaması göstərir; mənbə dayandırıldı.",
        403,
        0,
        true,
      );
    robotsCache.set(key, policy);
    crawlDelays.set(url.hostname.replace(/^www\./, ""), robotsCrawlDelayMs(policy.text));
  }
  return policy.text;
}
// fragment: request the HTML fragment a store's own "load more" button fetches (X-Requested-With),
// for list endpoints that redirect plain page requests. json: a public JSON catalog endpoint.
// robots.txt still decides.
export async function merchantPage(
  raw: string,
  options: { fragment?: boolean; json?: boolean } = {},
) {
  const url = safeMerchantUrl(raw);
  if (!robotsAllowed(await robotsPolicy(url), url.pathname + url.search))
    throw new RobotsDisallowedError();
  return readPage(
    url,
    options.json
      ? { Accept: "application/json" }
      : options.fragment
        ? { "X-Requested-With": "XMLHttpRequest" }
        : {},
    options.json,
  );
}
export async function scanProduct(
  raw: string,
  options: { variants?: boolean } = {},
): Promise<ScannedProduct> {
  const url = safeMerchantUrl(raw);
  const html = await merchantPage(url.href);
  if (url.hostname.replace(/^www\./, "") === "alinino.az") {
    const rows = extractAlinino(html, url.href);
    if (rows.length > 1 && !options.variants)
      throw new Error("Bir neçə dəqiq variant var. Sitemap idxalından istifadə edin.");
    return { ...rows[0], variants: options.variants ? rows : undefined, url: url.href };
  }
  if (url.hostname.replace(/^www\./, "") === "irshad.az") {
    if (options.variants) {
      const rows = extractIrshadVariants(html, url.href);
      return { ...rows[0], variants: rows };
    }
    return extractIrshad(html, url.href);
  }
  return parseProductPage(html, url.href);
}
// One product page → product: the store's own HTML reader when it has one, otherwise JSON-LD,
// OpenGraph product tags or microdata, followed by the store's fixup.
export function parseProductPage(html: string, raw: string): ScannedProduct {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  const reader = htmlProductReaders[host];
  const fixup = productFixups[host] || ((p: ScannedProduct) => p);
  const p = fixup(reader ? reader(html, url.href) : extractProduct(html));
  // Some stores write their own image URLs as http://; the same host serves them over HTTPS.
  let image = p.image;
  try {
    if (image && new URL(image).protocol === "http:" && new URL(image).hostname === url.hostname)
      image = "https://" + image.slice("http://".length);
  } catch {}
  return { ...p, ...(image ? { image } : {}), url: url.href };
}
