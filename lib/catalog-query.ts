// Server-side listing for the storefront. The browser asks for one page of products instead of the
// whole catalog, so filtering, sorting and the per-store counts are computed here.
import {
  recordedOffersFor,
  validOffers,
  priceOf,
  type Catalog,
  type Offer,
  type Point,
  type Product,
  type Review,
} from "./catalog";

export type CatalogQuery = {
  path: string;
  brand?: string;
  store?: string;
  min?: number;
  max?: number;
  sort?: string;
  real?: boolean;
  city?: string;
  limit?: number;
  // Products the page needs regardless of the listing: compare tray, price alerts.
  ids?: string[];
  // Product ids for /secilmisler; the server cannot read the viewer's favorites during SSR.
  favorites?: string[];
};

export type StoreStat = { count: number; real: boolean };

export type CatalogSlice = Catalog & {
  matched: string[];
  matchedTotal: number;
  brands: string[];
  storeStats: Record<string, StoreStat>;
};

export const PAGE_SIZE = 24;
export const MAX_LIMIT = 960;
const MAX_IDS = 60;
const HOME_CATEGORIES = [
  "telefon",
  "audio",
  "ev",
  "tv",
  "noutbuk",
  "oyun",
  "saat",
  "foto",
  "gozellik",
  "mebel",
  "idman",
  "aksesuar",
];
export const HERO_PRODUCT = "iphone17-pro-blue";
// The storefront's city before the viewer picks one; SSR must use the same value to hydrate cleanly.
export const DEFAULT_CITY = "Bakı";

type Index = {
  active: Product[];
  byId: Map<string, Product>;
  haystack: Map<string, string>;
  offers: Map<string, Offer[]>;
  history: Map<string, Point[]>;
  reviews: Map<string, Review[]>;
  storeProducts: Map<string, Set<string>>;
  storeStats: Record<string, StoreStat>;
  home: Product[];
};

// Built once per catalog object; the public catalog is cached, so requests reuse it.
const indexes = new WeakMap<Catalog, Index>();

function group<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function indexOf(c: Catalog): Index {
  let index = indexes.get(c);
  if (index) return index;
  const active = c.products.filter((p) => p.active);
  const storeProducts = new Map<string, Set<string>>();
  for (const o of c.offers) {
    const set = storeProducts.get(o.storeId) || new Set<string>();
    set.add(o.productId);
    storeProducts.set(o.storeId, set);
  }
  const sourced = group(
    c.products.filter((p) => p.sourceStoreId),
    (p) => p.sourceStoreId!,
  );
  const storeStats: Record<string, StoreStat> = {};
  for (const s of c.stores) {
    const real = c.offers.filter((o) => o.storeId === s.id && !o.demo).length;
    storeStats[s.id] = { count: sourced.get(s.id)?.length || real, real: real > 0 };
  }
  const home = new Map(
    active
      .filter((p) => p.featured)
      .slice(0, 6)
      .map((p) => [p.id, p]),
  );
  const perCategory = new Map<string, number>();
  for (const p of active) {
    if (!HOME_CATEGORIES.includes(p.category) || (perCategory.get(p.category) || 0) >= 6) continue;
    if (!validOffers(c, p.id).some((o) => !o.demo)) continue;
    home.set(p.id, p);
    perCategory.set(p.category, (perCategory.get(p.category) || 0) + 1);
  }
  index = {
    active,
    byId: new Map(c.products.map((p) => [p.id, p])),
    haystack: new Map(
      active.map((p) => [p.id, (p.name + " " + p.variant + " " + p.brand).toLocaleLowerCase("az")]),
    ),
    offers: group(c.offers, (o) => o.productId),
    history: group(c.history, (h) => h.productId),
    reviews: group(c.reviews, (r) => r.productId),
    storeProducts,
    storeStats,
    home: [...home.values()],
  };
  indexes.set(c, index);
  return index;
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const num = (k: string) => {
    const v = Number(params.get(k));
    return params.get(k) && Number.isFinite(v) ? v : undefined;
  };
  const ids = (k: string) =>
    params.has(k)
      ? (params.get(k) || "")
          .split(",")
          .filter(Boolean)
          .slice(0, MAX_IDS * 4)
      : undefined;
  return {
    path: params.get("path") || "/",
    brand: params.get("brand") || undefined,
    store: params.get("store") || undefined,
    min: num("min"),
    max: num("max"),
    sort: params.get("sort") || undefined,
    real: params.get("real") === "1",
    city: params.get("city") || undefined,
    limit: num("limit"),
    ids: ids("ids"),
    favorites: ids("favorites"),
  };
}

// Same rules the storefront listing has always used, now evaluated on the server.
function listing(c: Catalog, x: Index, q: CatalogQuery, page: string, parts: string[]) {
  const search = new URLSearchParams(q.path.split("?")[1] || "").get("q") || "";
  const category = page === "kateqoriya" ? parts[1] : "";
  const storeId = page === "magazalar" ? parts[1] : "";
  let p = x.active;
  if (category) p = p.filter((p) => p.category === category);
  if (search) {
    const t = search.toLocaleLowerCase("az");
    p = p.filter((p) => x.haystack.get(p.id)!.includes(t));
  }
  if (page === "secilmisler") {
    const fav = new Set(q.favorites || []);
    p = p.filter((p) => fav.has(p.id));
  }
  const sid = storeId || q.store;
  if (sid) {
    const ids = x.storeProducts.get(sid) || new Set<string>();
    p = p.filter((p) => p.sourceStoreId === sid || ids.has(p.id));
  }
  if (q.real) p = p.filter((p) => recordedOffersFor(c, p.id).some((o) => !o.demo));
  const price = new Map<string, number>();
  const priceFor = (id: string) => {
    let v = price.get(id);
    if (v === undefined) price.set(id, (v = priceOf(c, id)));
    return v;
  };
  if (q.min) p = p.filter((p) => priceFor(p.id) >= q.min!);
  if (q.max) p = p.filter((p) => priceFor(p.id) > 0 && priceFor(p.id) <= q.max!);
  if (page === "endirimler")
    p = p.filter((p) => (x.history.get(p.id) || []).some((h) => h.price > priceFor(p.id)));
  // Brands come from the listing before the brand filter so the select only offers useful choices.
  const brands = [...new Set(p.map((p) => p.brand).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  if (q.brand) p = p.filter((p) => p.brand === q.brand);
  const savings = (id: string) => {
    const l = validOffers(c, id);
    return l.length ? Math.max(...l.map((o) => o.price + o.shipping)) - priceFor(id) : 0;
  };
  const sort = page === "endirimler" ? "saving" : q.sort;
  const key = new Map<string, number | string>();
  if (sort === "low" || sort === "high") for (const v of p) key.set(v.id, priceFor(v.id));
  if (sort === "saving") for (const v of p) key.set(v.id, savings(v.id));
  const inStock = new Map(p.map((v) => [v.id, validOffers(c, v.id, q.city).length > 0 ? 1 : 0]));
  const order = (a: Product, b: Product) => {
    if (sort === "low") return (key.get(a.id) as number) - (key.get(b.id) as number);
    if (sort === "high" || sort === "saving")
      return (key.get(b.id) as number) - (key.get(a.id) as number);
    if (sort === "name") return a.name.localeCompare(b.name);
    return 0;
  };
  // Array.prototype.sort is stable, so ties keep the catalog's own order.
  const sorted = [...p].sort((a, b) => inStock.get(b.id)! - inStock.get(a.id)! || order(a, b));
  return { sorted, brands };
}

export function catalogSlice(c: Catalog, q: CatalogQuery): CatalogSlice {
  const x = indexOf(c);
  const parts = q.path.split("?")[0].split("/").filter(Boolean);
  const page = parts[0] || "home";
  const limit = Math.min(Math.max(q.limit || PAGE_SIZE, PAGE_SIZE), MAX_LIMIT);
  const isListing =
    ["kataloq", "kateqoriya", "axtaris", "endirimler", "secilmisler"].includes(page) ||
    (page === "magazalar" && !!parts[1]);
  const { sorted, brands } = isListing ? listing(c, x, q, page, parts) : { sorted: [], brands: [] };
  const matched = sorted.slice(0, limit);
  const chosen = new Map(matched.map((p) => [p.id, p]));
  const add = (id: string | undefined) => {
    const p = id && x.byId.get(id);
    if (p) chosen.set(p.id, p);
  };
  if (page === "home") for (const p of x.home) chosen.set(p.id, p);
  add(HERO_PRODUCT);
  if (page === "mehsul") {
    const selected = x.byId.get(parts[1]);
    add(selected?.id);
    if (selected?.familyId)
      for (const p of x.active) if (p.familyId === selected.familyId) chosen.set(p.id, p);
  }
  for (const id of (q.ids || []).slice(0, MAX_IDS)) add(id);
  const products = [...chosen.values()];
  const pick = <T>(map: Map<string, T[]>) => products.flatMap((p) => map.get(p.id) || []);
  return {
    ...c,
    products,
    offers: pick(x.offers),
    history: pick(x.history),
    reviews: pick(x.reviews),
    totals: { products: x.active.length, stores: c.stores.filter((s) => s.active).length },
    matched: matched.map((p) => p.id),
    matchedTotal: sorted.length,
    brands,
    storeStats: x.storeStats,
  };
}
