import { extractAlinino } from "./alinino";
import { robotsAllowed } from "./robots";
import { merchantDomains } from "./merchants";
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
  ) {
    super(message);
  }
}
const nextFetch = new Map<string, number>();
async function sourceFetch(url: URL, timeoutMs = 12000) {
  const host = url.hostname.replace(/^www\./, "");
  const wait = Math.max(0, (nextFetch.get(host) || 0) - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  nextFetch.set(host, Date.now() + 1000);
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "QepikBot/1.0 (+https://qepik-az.mythicfern36.chatgpt.site)",
      Accept: "text/html,text/plain;q=0.8",
    },
  });
}
async function sourceResponse(url: URL, timeoutMs = 12000) {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const r = await sourceFetch(current, timeoutMs);
    if (r.status >= 300 && r.status < 400) {
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
async function readPage(url: URL) {
  const response = await sourceResponse(url);
  if (!response.headers.get("content-type")?.includes("text/html") && response.ok)
    throw new Error("Mənbə HTML səhifəsi deyil.");
  return limitedText(response);
}
async function limitedText(r: Response) {
  if (!r.ok) {
    const retry = r.headers.get("retry-after");
    const delay = retry
      ? /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry) - Date.now())
      : 60000;
    throw new SourceAccessError(
      `Mağaza sorğunu qəbul etmədi (HTTP ${r.status}).`,
      r.status,
      Number.isFinite(delay) ? delay : 60000,
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
export async function readMerchantSitemap(raw: string) {
  const url = safeMerchantUrl(raw);
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
export function extractMetaProduct(html: string) {
  const fields = new Map<string, string[]>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag[0].match(/(?:property|name)\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
    const value = tag[0].match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
    if (key && value !== undefined)
      fields.set(key, [
        ...(fields.get(key) || []),
        value.replace(/&amp;/g, "&").replace(/&quot;/g, '"'),
      ]);
  }
  const amounts = [...new Set(fields.get("product:price:amount") || [])];
  if (
    amounts.length !== 1 ||
    fields.get("product:price:currency")?.[0] !== "AZN" ||
    !fields.get("og:title")?.[0]
  )
    throw new Error("AZN valyutalı tək məhsul qiyməti oxunmadı.");
  const price = Number(amounts[0].replace(",", "."));
  if (!Number.isFinite(price) || price <= 0 || price > 10000000)
    throw new Error("Qiymət formatı düzgün deyil.");
  const availability = (fields.get("product:availability")?.[0] || "").toLowerCase();
  return {
    name: fields.get("og:title")![0],
    image: fields.get("og:image")?.[0],
    description: fields.get("description")?.[0] || "",
    brand: fields.get("product:brand")?.[0],
    sku: fields.get("product:retailer_item_id")?.[0] || "",
    gtin: "",
    price,
    currency: "AZN",
    stock: ["in stock", "instock"].includes(availability),
    stockKnown: ["in stock", "instock", "out of stock", "outofstock"].includes(availability),
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
    if ([o["@type"]].flat().includes("Product")) all.push(o);
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
  if (!all.length) return extractMetaProduct(html);
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
        v.o?.price !== undefined && v.o?.priceCurrency === "AZN",
    );
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "Bir neçə məhsul tapıldı. Dəqiq məhsul səhifəsindən istifadə edin."
        : "AZN valyutalı tək məhsul qiyməti oxunmadı. JS/anti-bot səhifəsi ola bilər; manual idxaldan istifadə edin.",
    );
  const { p, o } = candidates[0];
  const price = Number(String(o.price).replace(",", "."));
  if (!Number.isFinite(price) || price <= 0 || price > 10000000)
    throw new Error("Qiymət formatı düzgün deyil.");
  const first = Array.isArray(p.image) ? p.image[0] : p.image;
  const image = typeof first === "string" ? first : first?.url;
  const brand = typeof p.brand === "string" ? p.brand : p.brand?.name;
  return {
    image: typeof image === "string" ? image : undefined,
    brand: brand ? String(brand) : undefined,
    description: String(p.description || "")
      .replace(/<[^>]*>/g, " ")
      .slice(0, 1500),
    gtin: String(p.gtin13 || p.gtin || p.isbn || ""),
    name: String(p.name || ""),
    sku: String(p.sku || p.mpn || p.gtin13 || ""),
    price,
    currency: "AZN",
    stock: String(o.availability || "").endsWith("InStock"),
    stockKnown: !!o.availability,
    checkedAt: new Date().toISOString(),
  };
}
export function extractIrshad(html: string) {
  const sections = Array.from(
    html.matchAll(/<section\b([^>]*\bclass=["'][^"']*\bproduct-view\b[^"']*["'][^>]*)>/gi),
  );
  const active = sections.filter((m) => !/(?:\s|["'])d-none(?:\s|["'])/.test(m[1]));
  if (active.length !== 1) throw new Error("Aktiv məhsul variantı dəqiq müəyyənləşmədi.");
  const start = active[0].index!,
    next = sections.find((m) => m.index! > start);
  const section = html.slice(start, next?.index || html.length);
  const clean = (s: string) =>
    s
      .replace(/<[^>]*>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const name = clean(section.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const priceText = clean(
    section.match(/<p[^>]*class=["'][^"']*\bnew-price\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
      "",
  );
  const price = Number(priceText.replace(/\s/g, "").replace(/AZN|₼/gi, "").replace(",", "."));
  if (!name || !price || !Number.isFinite(price) || !/(AZN|₼)/i.test(priceText))
    throw new Error("Aktiv variantın AZN qiyməti oxunmadı.");
  const sku =
    section.match(/data-product-code=["']([^"']+)["']/)?.[1] ||
    active[0][1].match(/id=["']productSection(\d+)/)?.[1] ||
    "";
  const labels = section.slice(0, 3500);
  const stock = /Stokda\s+var/i.test(clean(labels));
  return {
    name,
    sku,
    price,
    currency: "AZN",
    stock,
    stockKnown: stock || /stokda yoxdur|mövcud deyil/i.test(clean(labels)),
    checkedAt: new Date().toISOString(),
  };
}
const robotsCache = new Map<string, { text: string; at: number }>();
export async function merchantPage(raw: string) {
  const url = safeMerchantUrl(raw);
  const key = url.origin;
  let policy = robotsCache.get(key);
  if (!policy || Date.now() - policy.at > 300000) {
    const r = await sourceResponse(new URL("/robots.txt", url));
    if (r.status === 404) policy = { text: "", at: Date.now() };
    else policy = { text: await limitedText(r), at: Date.now() };
    robotsCache.set(key, policy);
  }
  if (!robotsAllowed(policy.text, url.pathname + url.search))
    throw new Error("Mənbə bu ünvanı avtomatik oxumağa açmır.");
  return readPage(url);
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
  return {
    ...(url.hostname.replace(/^www\./, "") === "irshad.az"
      ? extractIrshad(html)
      : extractProduct(html)),
    url: url.href,
  };
}
