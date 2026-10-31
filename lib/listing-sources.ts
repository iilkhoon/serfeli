// Category-page importers. Some merchants publish the full product row (name, price, stock, image)
// on their category pages, so one request yields a whole page of products instead of one.
import type { ScannedProduct } from "./extractor";
import type { Offer, Product } from "./catalog";
import { extractIrshadListing } from "./irshad";
import { normalizeTechnomania } from "./technomania";
import { normalizeStoreProducts, storeApiSources, type StoreApiRow } from "./woocommerce";

// items are scanned rows the importer turns into records; records are already normalized.
export type ListingPage = {
  items: ScannedProduct[];
  pages: string[];
  records?: { products: Product[]; offers: Offer[]; completeSnapshot?: boolean };
};

// Leading words that name the product type, not the brand ("Smartfon Apple iPhone…").
const typeWords = new Set(
  [
    "smartfon",
    "mobil",
    "telefon",
    "noutbuk",
    "planşet",
    "televizor",
    "qulaqlıq",
    "ağıllı",
    "saat",
    "soyuducu",
    "paltaryuyan",
    "qabyuyan",
    "tozsoran",
    "kondisioner",
    "monitor",
    "printer",
    "kamera",
    "oyun",
    "konsolu",
    "dinamik",
    "fen",
    "ütü",
    "mikrodalğalı",
    "soba",
    "blender",
    "mikser",
    "çaydan",
    "qəhvə",
    "maşını",
    "elektrik",
    "simsiz",
    "portativ",
    "kompüter",
    "aksesuar",
    "adapter",
    "kabel",
    "qab",
    "üz",
    "saç",
  ].map((w) => w.toLocaleLowerCase("az")),
);

export function brandFromName(name: string) {
  for (const word of name.split(/\s+/)) {
    const w = word.replace(/[^\p{L}\p{N}&+-]/gu, "");
    if (!w || typeWords.has(w.toLocaleLowerCase("az"))) continue;
    if (/^i(Phone|Pad|Mac|Pod)/.test(w) || /^(MacBook|AirPods)/i.test(w)) return "Apple";
    // Brands are written with a capital or in caps; model numbers start with a digit.
    return /^\p{Lu}/u.test(w) ? w.slice(0, 40) : "";
  }
  return "";
}

// bakuelectronics.az category tree → storefront category ids. Leaf rules win over section rules;
// anything unmapped falls back to the importer's name-based guess.
const bakuLeaves: Record<string, string> = {
  "smartfonlar-mobil-telefonlar": "telefon",
  "duymeli-telefonlar": "telefon",
  "ev-ofis-telefonlari": "telefon",
  "smart-saatlar": "saat",
  saatlar: "saat",
  qulaqliqlar: "audio",
  plansetler: "planset",
  "elektron-kitablar": "planset",
  noutbuklar: "noutbuk",
  komputerler: "noutbuk",
  "oyun-notbuklari": "noutbuk",
  televizorlar: "tv",
  "ses-sistemleri": "audio",
  "foto-ve-video": "foto",
  "usaq-neqliyyati": "oyuncaq",
  // Accessory leaves sit under device sections; without these the name-based guess files a
  // "Galaxy S25" case as a phone.
  aksesuarlar: "aksesuar",
  "komputer-aksesuarlari": "aksesuar",
  "televizor-aksesuarlari": "aksesuar",
  "oyun-konsollar-ucun-aksessuarlar": "aksesuar",
  "ev-texnikasi-ucun-aksesuarlar": "aksesuar",
  "iqlim-texnikasi-aksesuarlar": "aksesuar",
};
const bakuSections: Record<string, string> = {
  "oyun-konsollari-oyunlar": "oyun",
  "boyuk-meiset-texnikasi": "ev",
  "kicik-meiset-texnikasi": "ev",
  "iqlim-texnikasi": "ev",
  "qab-qacaq-tava-qazan": "ev",
  "gozellik-ve-baxim": "gozellik",
  "mebel-tekstil-v-dekor": "mebel",
  "idman-ve-hobbi": "idman",
  "usaq-alemi": "oyuncaq",
  kitablar: "kitab",
  "avto-ve-moto-mehsullari": "avto",
};
export function bakuCategory(path: string) {
  const [, section = "", leaf = ""] = path.toLowerCase().split("/").filter(Boolean);
  return bakuLeaves[leaf] || bakuSections[section] || "";
}

type BakuItem = {
  id: number;
  product_code: number;
  name: string;
  slug: string;
  price: number;
  discounted_price?: number | null;
  quantity?: number | null;
  image?: string | null;
  pre_order?: boolean;
  perMonth?: { month: number; price: number } | null;
};

// bakuelectronics.az renders category pages with Next.js; __NEXT_DATA__ carries the product rows.
export function extractBakuListing(html: string, pageUrl: string): ListingPage {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Kateqoriya məlumatı tapılmadı.");
  const data = JSON.parse(m[1]) as {
    props?: {
      pageProps?: {
        products?: { products?: { items: BakuItem[]; total: number; page: number; size: number } };
        breadcrumb?: { name?: string; title?: string }[];
      };
    };
  };
  const list = data.props?.pageProps?.products?.products;
  if (!list || !Array.isArray(list.items)) throw new Error("Kateqoriya məhsul siyahısı yoxdur.");
  const url = new URL(pageUrl);
  const checkedAt = new Date().toISOString();
  const category =
    bakuCategory(url.pathname) || url.pathname.split("/").filter(Boolean).slice(1).join(" ");
  const items: ScannedProduct[] = [];
  for (const row of list.items) {
    const base = Number(row.price);
    const discounted = Number(row.discounted_price);
    const price = discounted > 0 && discounted < base ? discounted : base;
    if (!row.slug || !row.name || !(price > 0)) continue;
    items.push({
      name: row.name.trim(),
      sku: String(row.product_code || ""),
      price: Math.round(price * 100) / 100,
      currency: "AZN",
      stock: (row.quantity ?? 0) > 0 && !row.pre_order,
      stockKnown: typeof row.quantity === "number",
      checkedAt,
      image: row.image || undefined,
      brand: brandFromName(row.name) || undefined,
      category,
      url: new URL("/mehsul/" + encodeURIComponent(row.slug), url.origin).href,
      ...(row.perMonth?.month
        ? { specs: { [`Taksit (${row.perMonth.month} ay)`]: row.perMonth.price + " ₼/ay" } }
        : {}),
    });
  }
  const pages: string[] = [];
  const page = Number(list.page) || 1;
  if (page === 1 && list.size > 0)
    for (let n = 2; n <= Math.min(Math.ceil(list.total / list.size), 200); n++) {
      const next = new URL(url.pathname, url.origin);
      next.searchParams.set("page", String(n));
      pages.push(next.href);
    }
  return { items, pages };
}

// Category URLs to read from a listing source's sitemap; only leaf categories, so parent pages
// do not re-list the same products.
export function listingCategories(sourceId: string, urls: string[]) {
  if (sourceId !== "baku") return [];
  const cats = urls.filter((u) => {
    const p = new URL(u).pathname;
    return p.startsWith("/catalog/") && p !== "/catalog/muqayise-et";
  });
  const paths = cats.map((u) => new URL(u).pathname.replace(/\/$/, ""));
  return cats.filter((u, i) => !paths.some((p) => p.startsWith(paths[i] + "/")));
}

// irshad.az/az/products/list returns the product grid fragment; its "load more" button names the
// next page.
export function extractIrshadListingPage(html: string, pageUrl: string): ListingPage {
  const { products } = extractIrshadListing(html);
  const next = html.match(/<button\b[^>]*\bid=["']loadMore["'][^>]*\bdata-page=["'](\d+)["']/i);
  const pages: string[] = [];
  const current = Number(new URL(pageUrl).searchParams.get("page") || "1");
  // Only forward: a button that points back (or to the same page) would loop the run.
  if (next && Number(next[1]) > current) {
    const url = new URL(pageUrl);
    url.searchParams.set("page", next[1]);
    pages.push(url.href);
  }
  return { items: products.filter((p) => p.url && p.price > 0), pages };
}

// WooCommerce Store API page: rows keep the ids of the bundled snapshots, so a sync updates them
// in place. A full page means there may be another one.
export function extractStoreApiPage(sourceId: string, body: string, pageUrl: string): ListingPage {
  const rows = JSON.parse(body) as StoreApiRow[];
  if (!Array.isArray(rows)) throw new Error("Mağaza API-si məhsul siyahısı qaytarmadı.");
  const records = normalizeStoreProducts(sourceId, rows);
  const url = new URL(pageUrl);
  const page = Number(url.searchParams.get("page") || "1");
  // WooCommerce returns 10 rows when per_page is not given.
  const perPage = Number(url.searchParams.get("per_page") || "10");
  const pages: string[] = [];
  // Same 25 000-product ceiling as the manual sync, whatever the page size.
  if (rows.length >= perPage && page < Math.ceil(25000 / perPage)) {
    url.searchParams.set("page", String(page + 1));
    pages.push(url.href);
  }
  return { items: [], pages, records };
}

export function extractListing(sourceId: string, html: string, pageUrl: string) {
  if (sourceId === "technomania") {
    const feed = normalizeTechnomania(JSON.parse(html));
    return {
      items: [],
      pages: [],
      records: { products: feed.products, offers: feed.offers, completeSnapshot: true },
    };
  }
  if (storeApiSources.some((s) => s.id === sourceId))
    return extractStoreApiPage(sourceId, html, pageUrl);
  if (sourceId === "baku") return extractBakuListing(html, pageUrl);
  if (sourceId === "irshad") return extractIrshadListingPage(html, pageUrl);
  throw new Error("Bu mənbə üçün kateqoriya oxuyucusu yoxdur.");
}
