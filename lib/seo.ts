import type { Metadata } from "next";
import {
  bestRecordedOffersFor,
  categories,
  canonicalProductId,
  money,
  type Catalog,
  type Offer,
  type Product,
} from "./catalog";

export const SITE_URL = "https://qepik-az.mythicfern36.chatgpt.site";
export const SITE_NAME = "Qəpik";
const SOCIAL_CARD = SITE_URL + "/social-card.png";
const DESCRIPTION_LIMIT = 160;

// Every public route and how many path segments it accepts. Anything else is a 404.
const ROUTES: Record<string, [number, number]> = {
  mehsul: [2, 2],
  kateqoriya: [2, 2],
  magazalar: [1, 2],
  kataloq: [1, 1],
  endirimler: [1, 1],
  rehber: [1, 1],
  "magaza-qeydiyyat": [1, 1],
  admin: [1, 1],
  bildirisler: [1, 1],
  secilmisler: [1, 1],
  muqayise: [1, 1],
  axtaris: [1, 1],
};
// Account, tool and search pages: never in the index.
const PRIVATE_PAGES = new Set([
  "admin",
  "bildirisler",
  "secilmisler",
  "muqayise",
  "axtaris",
  "magaza-qeydiyyat",
]);
// Personal pages whose links are not worth following either.
const NOFOLLOW_PAGES = new Set(["admin", "bildirisler", "secilmisler"]);
const LISTING_PAGES = new Set(["kataloq", "kateqoriya", "endirimler", "magazalar"]);

const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  home: {
    title: "Qiymət müqayisəsi — Azərbaycan mağazalarında sərfəli qiymətlər",
    description:
      "Azərbaycan mağazalarında telefon, noutbuk, ev texnikası və digər məhsulların qiymətlərini müqayisə edin. Stok, çatdırılma və taksit şərtləri bir yerdə.",
  },
  kataloq: {
    title: "Bütün məhsullar və qiymətlər",
    description:
      "Qəpik kataloqundakı bütün məhsulların Azərbaycan mağazalarındakı qiymətləri. Brend, qiymət və mağazaya görə süzün, ən sərfəli təklifi tapın.",
  },
  magazalar: {
    title: "Azərbaycan mağazaları",
    description:
      "Qəpik-də qiymətləri izlənən Azərbaycan onlayn mağazalarının siyahısı: hər mağazanın məhsulları, rəsmi saytı və qiymət müqayisəsi.",
  },
  endirimler: {
    title: "Qiyməti düşən məhsullar",
    description:
      "Azərbaycan mağazalarında qiyməti son vaxtlar düşən məhsullar. Əvvəlki və indiki qiyməti müqayisə edib endirimdən yararlanın.",
  },
  rehber: {
    title: "Alış-veriş bələdçisi",
    description:
      "Qiymət müqayisəsi, taksit, çatdırılma və zəmanət şərtlərini necə yoxlamaq lazımdır: Qəpik-in onlayn alış-veriş bələdçisi.",
  },
  "magaza-qeydiyyat": {
    title: "Mağaza qeydiyyatı",
    description: "Mağazanızın məhsul və qiymətlərini Qəpik-də göstərmək üçün müraciət edin.",
  },
  admin: { title: "Admin paneli", description: "Qəpik idarəetmə paneli." },
  bildirisler: {
    title: "Qiymət bildirişləri",
    description: "İzlədiyiniz məhsulların qiymət bildirişləri.",
  },
  secilmisler: { title: "Seçilmişlər", description: "Seçdiyiniz məhsullar." },
  muqayise: {
    title: "Məhsul müqayisəsi",
    description: "Seçdiyiniz məhsulların xüsusiyyətlərini və qiymətlərini yan-yana müqayisə edin.",
  },
  axtaris: {
    title: "Axtarış nəticələri",
    description: "Qəpik-də məhsul axtarışı.",
  },
};

export type ParsedRoute = {
  route: string;
  parts: string[];
  page: string;
  params: URLSearchParams;
};
export function parseRoute(path: string): ParsedRoute {
  const at = path.indexOf("?");
  const route = (at < 0 ? path : path.slice(0, at)) || "/";
  const parts = route.split("/").filter(Boolean);
  return {
    route,
    parts,
    page: parts[0] || "home",
    params: new URLSearchParams(at < 0 ? "" : path.slice(at + 1)),
  };
}

// The listing page number from ?page=, when it is a real page beyond the first one.
export function listingPageNumber(params: URLSearchParams) {
  const raw = params.get("page");
  if (!raw || !/^[1-9]\d{0,5}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n > 1 ? n : undefined;
}

// Parameters that change only the order or a filter of a listing; such URLs are not indexed.
function hasNonCanonicalParams(params: URLSearchParams, page: string) {
  for (const [key] of params) {
    if (key === "page" && LISTING_PAGES.has(page) && listingPageNumber(params)) continue;
    return true;
  }
  return false;
}

const fold = (s: string) => s.toLocaleLowerCase("az").replace(/\s+/g, " ").trim();

// The product name as shown to people: the variant only when the name does not already say it.
export function productLabel(p: Product) {
  const name = p.name.trim();
  const variantWords = (p.variant || "")
    .split(/[·|]/)
    .map((v) => v.trim())
    .filter(Boolean);
  const missing = variantWords.filter((v) => !fold(name).includes(fold(v)));
  return [name, ...missing, p.distinction ? "(" + p.distinction.trim() + ")" : ""]
    .filter(Boolean)
    .join(" ");
}

// One real, priced offer per active merchant (demo and zero/NaN prices are already excluded).
export function pricedOffers(c: Catalog, productId: string): Offer[] {
  return bestRecordedOffersFor(c, productId).filter(
    (o) => !o.demo && Number.isFinite(o.price) && o.price > 0,
  );
}
const isAvailable = (o: Offer) => o.stock && o.stockKnown !== false;

type Stats = {
  storeProducts: Map<string, number>;
  categoryProducts: Map<string, number>;
  byId: Map<string, Product>;
};
const statsCache = new WeakMap<Catalog, Stats>();
// Counts used for descriptions, empty-page detection and the sitemap, built once per catalog.
export function catalogStats(c: Catalog): Stats {
  let stats = statsCache.get(c);
  if (stats) return stats;
  const active = c.products.filter((p) => p.active);
  const activeIds = new Set(active.map((p) => p.id));
  const perStore = new Map<string, Set<string>>();
  const add = (storeId: string, productId: string) => {
    const set = perStore.get(storeId) || new Set<string>();
    set.add(productId);
    perStore.set(storeId, set);
  };
  for (const p of active) if (p.sourceStoreId) add(p.sourceStoreId, p.id);
  for (const o of c.offers) if (!o.demo && activeIds.has(o.productId)) add(o.storeId, o.productId);
  const categoryProducts = new Map<string, number>();
  for (const p of active)
    categoryProducts.set(p.category, (categoryProducts.get(p.category) || 0) + 1);
  stats = {
    storeProducts: new Map([...perStore].map(([k, v]) => [k, v.size])),
    categoryProducts,
    byId: new Map(c.products.map((p) => [p.id, p])),
  };
  statsCache.set(c, stats);
  return stats;
}

function activeProduct(c: Catalog, id: string | undefined) {
  if (!id) return undefined;
  const p = catalogStats(c).byId.get(canonicalProductId(c, id));
  return p?.active ? p : undefined;
}
const activeStore = (c: Catalog, id: string | undefined) =>
  id ? c.stores.find((s) => s.id === id && s.active) : undefined;
const categoryById = (id: string | undefined) => categories.find((x) => x.id === id);

// A product page is worth indexing only when at least one merchant has a real price for it.
export function isIndexableProduct(c: Catalog, p: Product) {
  return p.active && pricedOffers(c, p.id).length > 0;
}

export type RouteDecision =
  | { kind: "ok" }
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };
// Status for a catch-all path: 404 for unknown routes, permanent redirects to the canonical slug.
export function routeDecision(path: string, c: Catalog): RouteDecision {
  const { parts, page, params } = parseRoute(path);
  const limits = ROUTES[page];
  if (!limits || parts.length < limits[0] || parts.length > limits[1]) return { kind: "notFound" };
  const query = params.size ? "?" + params.toString() : "";
  const id = parts[1];
  const lower = id?.toLowerCase();
  if (page === "mehsul") {
    const canonical = canonicalProductId(c, id);
    const p = catalogStats(c).byId.get(canonical);
    if (p?.active) return canonical === id ? { kind: "ok" } : redirect("/mehsul/" + canonical);
    // Old upper-case links keep working.
    const loose = activeProduct(c, lower);
    if (loose && lower !== id) return redirect("/mehsul/" + loose.id);
    return { kind: "notFound" };
  }
  if (page === "kateqoriya") {
    if (categoryById(id)) return { kind: "ok" };
    if (categoryById(lower)) return redirect("/kateqoriya/" + lower);
    return { kind: "notFound" };
  }
  if (page === "magazalar" && id) {
    if (activeStore(c, id)) return { kind: "ok" };
    if (activeStore(c, lower)) return redirect("/magazalar/" + lower);
    return { kind: "notFound" };
  }
  return { kind: "ok" };
  function redirect(to: string): RouteDecision {
    return { kind: "redirect", to: to + query };
  }
}

function clampDescription(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= DESCRIPTION_LIMIT) return clean;
  const cut = clean.slice(0, DESCRIPTION_LIMIT - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).replace(/[\s,.;:—-]+$/, "") + "…";
}

const absolute = (src: string) => {
  try {
    return new URL(src, SITE_URL).href;
  } catch {
    return undefined;
  }
};
// Product photos only; the favicon placeholder is not an image of the product.
function productImage(p: Product) {
  if (!p.image || p.image === "/favicon.svg") return undefined;
  const url = absolute(p.image);
  return url && /^https?:/.test(url) ? url : undefined;
}

const plural = (n: number, word: string) => n.toLocaleString("az") + " " + word;

function productDescription(c: Catalog, p: Product, label: string) {
  const offers = pricedOffers(c, p.id);
  const available = offers.filter(isAvailable);
  if (available.length) {
    const low = Math.min(...available.map((o) => o.price));
    return `${label}: ${plural(available.length, "mağazada")} satışdadır, ən sərfəli qiymət ${money(low)}. Nağd qiymət, stok, çatdırılma və taksit şərtlərini müqayisə edin.`;
  }
  if (offers.length) {
    const low = Math.min(...offers.map((o) => o.price));
    return `${label}: son qeydə alınan qiymət ${money(low)} (${plural(offers.length, "mağaza")}). Stok vəziyyətini, çatdırılma və taksit şərtlərini Qəpik-də yoxlayın.`;
  }
  return `${label}: xüsusiyyətlər və Azərbaycan mağazalarındakı təkliflər. Qiymət məlumatı hazırda yoxdur.`;
}

export function pageSeo(path: string, c: Catalog): Metadata {
  const { route, parts, page, params } = parseRoute(path);
  const stats = catalogStats(c);
  const product = page === "mehsul" ? activeProduct(c, parts[1]) : undefined;
  const category = page === "kateqoriya" ? categoryById(parts[1]) : undefined;
  const store = page === "magazalar" ? activeStore(c, parts[1]) : undefined;
  const fixed = STATIC_PAGES[page];
  const pageNo = LISTING_PAGES.has(page) ? listingPageNumber(params) : undefined;
  const pageSuffix = pageNo ? ` — səhifə ${pageNo}` : "";

  let title: string, description: string;
  let empty = false;
  let image: { url: string; alt: string } | undefined;
  let canonicalPath = route === "/" ? "" : route.replace(/\/+$/, "");
  if (product) {
    const label = productLabel(product);
    title = `${label} qiymətləri`;
    description = productDescription(c, product, label);
    empty = !isIndexableProduct(c, product);
    canonicalPath = "/mehsul/" + product.id;
    const src = productImage(product);
    if (src) image = { url: src, alt: label };
  } else if (category) {
    const count = stats.categoryProducts.get(category.id) || 0;
    empty = count === 0;
    title = `${category.name} qiymətləri${pageSuffix}`;
    description = count
      ? `${category.name}: ${plural(count, "məhsulun")} Azərbaycan mağazalarındakı qiymətlərini müqayisə edin. Stok, çatdırılma və taksit şərtləri bir yerdə.`
      : `${category.name} kateqoriyasında hazırda məhsul yoxdur.`;
  } else if (store) {
    const count = stats.storeProducts.get(store.id) || 0;
    empty = count === 0;
    title = `${store.name} qiymətləri və məhsulları${pageSuffix}`;
    description = count
      ? `${store.name} (${store.domain}) mağazasının ${plural(count, "məhsulu")}: qiymətlər, stok və çatdırılma şərtləri. Digər mağazalarla müqayisə edib sərfəli seçin.`
      : `${store.name} (${store.domain}) mağazasının məhsulları hələ Qəpik-ə əlavə edilməyib.`;
    if (store.logo) {
      const logo = absolute(store.logo);
      if (logo) image = { url: logo, alt: store.name + " loqosu" };
    }
  } else if (page === "axtaris") {
    const q = (params.get("q") || "").trim().slice(0, 80);
    title = q ? `“${q}” üçün axtarış nəticələri` : STATIC_PAGES.axtaris.title;
    description = q
      ? `“${q}” üçün Azərbaycan mağazalarındakı məhsullar və qiymətlər.`
      : STATIC_PAGES.axtaris.description;
  } else if (fixed) {
    title = fixed.title + pageSuffix;
    description = fixed.description;
  } else {
    title = "Səhifə tapılmadı";
    description = "Bu səhifə Qəpik-də mövcud deyil.";
    empty = true;
  }
  description = clampDescription(description);

  const privatePage = PRIVATE_PAGES.has(page);
  const filtered = hasNonCanonicalParams(params, page);
  const index = !privatePage && !filtered && !empty;
  const canonical = SITE_URL + canonicalPath + (pageNo && !filtered ? "?page=" + pageNo : "");
  const ogImage = image || {
    url: SOCIAL_CARD,
    alt: "Qəpik — Azərbaycan qiymət müqayisəsi",
  };
  return {
    title: title + " | " + SITE_NAME,
    description,
    alternates: { canonical },
    robots: {
      index,
      follow: !NOFOLLOW_PAGES.has(page),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "az_AZ",
      type: "website",
      images: [
        image ? { url: ogImage.url, alt: ogImage.alt } : { ...ogImage, width: 1200, height: 630 },
      ],
    },
    twitter: {
      card: image ? "summary" : "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

type Json = Record<string, unknown>;
const breadcrumbs = (items: [string, string][]): Json => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: SITE_URL + path,
  })),
});
const HOME_CRUMB: [string, string] = ["Ana səhifə", "/"];
const safeUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
};
const round = (n: number) => Math.round(n * 100) / 100;

// Product with an AggregateOffer built only from real, priced merchant offers.
export function productJsonLd(c: Catalog, p: Product): Json {
  const label = productLabel(p);
  const url = SITE_URL + "/mehsul/" + p.id;
  const priced = pricedOffers(c, p.id);
  const available = priced.filter(isAvailable);
  const shown = available.length ? available : priced;
  const image = productImage(p);
  const spec = (...keys: string[]) => {
    for (const k of keys) {
      const v = Object.entries(p.specs || {}).find(([key]) => key.toLowerCase() === k)?.[1];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  };
  const gtin = spec("gtin", "ean", "barkod", "barcode");
  const mpn = spec("mpn");
  const reviews = c.reviews.filter(
    (r) => r.productId === p.id && r.status === "approved" && r.rating >= 1 && r.rating <= 5,
  );
  const category = categoryById(p.category);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url + "#product",
    name: label,
    url,
    sku: p.id,
    ...(image ? { image } : {}),
    ...(p.description?.trim() ? { description: p.description.trim().slice(0, 5000) } : {}),
    ...(p.brand?.trim() ? { brand: { "@type": "Brand", name: p.brand.trim() } } : {}),
    ...(category ? { category: category.name } : {}),
    ...(gtin && /^\d{8,14}$/.test(gtin) ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    ...(reviews.length
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length),
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(shown.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            lowPrice: round(Math.min(...shown.map((o) => o.price))),
            highPrice: round(Math.max(...shown.map((o) => o.price))),
            priceCurrency: "AZN",
            offerCount: shown.length,
            ...(available.length ? { availability: "https://schema.org/InStock" } : {}),
            offers: shown.map((o) => {
              const offerUrl = safeUrl(o.url);
              return {
                "@type": "Offer",
                price: round(o.price),
                priceCurrency: "AZN",
                ...(offerUrl ? { url: offerUrl } : {}),
                ...(o.stockKnown === false
                  ? {}
                  : { availability: "https://schema.org/" + (o.stock ? "InStock" : "OutOfStock") }),
                ...(o.condition && o.condition !== "unknown"
                  ? {
                      itemCondition:
                        "https://schema.org/" +
                        (o.condition === "new" ? "NewCondition" : "UsedCondition"),
                    }
                  : {}),
                seller: {
                  "@type": "Organization",
                  name: c.stores.find((s) => s.id === o.storeId)?.name || o.storeId,
                },
              };
            }),
          },
        }
      : {}),
  };
}

export function structuredDataItems(path: string, c: Catalog): Json[] {
  const { parts, page } = parseRoute(path);
  if (page === "home")
    return [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": SITE_URL + "/#organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: SITE_URL + "/favicon.svg",
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": SITE_URL + "/#website",
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: "az-AZ",
        publisher: { "@id": SITE_URL + "/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: SITE_URL + "/axtaris?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
    ];
  if (page === "mehsul") {
    const p = activeProduct(c, parts[1]);
    if (!p) return [];
    const category = categoryById(p.category);
    return [
      productJsonLd(c, p),
      breadcrumbs([
        HOME_CRUMB,
        category ? [category.name, "/kateqoriya/" + category.id] : ["Məhsullar", "/kataloq"],
        [productLabel(p), "/mehsul/" + p.id],
      ]),
    ];
  }
  if (page === "kateqoriya") {
    const category = categoryById(parts[1]);
    return category
      ? [
          breadcrumbs([
            HOME_CRUMB,
            ["Məhsullar", "/kataloq"],
            [category.name, "/kateqoriya/" + category.id],
          ]),
        ]
      : [];
  }
  if (page === "magazalar") {
    const store = activeStore(c, parts[1]);
    if (parts[1] && !store) return [];
    return [
      breadcrumbs([
        HOME_CRUMB,
        ["Mağazalar", "/magazalar"],
        ...(store ? [[store.name, "/magazalar/" + store.id] as [string, string]] : []),
      ]),
    ];
  }
  if (["kataloq", "endirimler", "rehber"].includes(page))
    return [breadcrumbs([HOME_CRUMB, [STATIC_PAGES[page].title, "/" + page]])];
  return [];
}

// JSON for a <script type="application/ld+json">; "" when the page has no structured data.
export function structuredData(path: string, c: Catalog) {
  const items = structuredDataItems(path, c);
  return items.length ? jsonLdString(items) : "";
}
export const jsonLdString = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
