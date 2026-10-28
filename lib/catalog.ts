import localMerchants from "../docs/local-merchants.json";
import { liveProducts, liveOffers, liveHistory } from "./live-catalog";
export type Product = {
  marketplace?: boolean;
  sourceStoreId?: string;
  sourceUrl?: string;
  id: string;
  name: string;
  brand: string;
  category: string;
  variant: string;
  image: string;
  specs: Record<string, string>;
  description: string;
  active: boolean;
  featured: boolean;
  familyId?: string;
};
export type Store = {
  id: string;
  name: string;
  domain: string;
  color: string;
  active: boolean;
  description: string;
  logo?: string;
  logoBackground?: string;
  sourceStatus?: string;
};
export type Offer = {
  stockKnown?: boolean;
  condition?: "new" | "used" | "unknown";
  id: string;
  productId: string;
  storeId: string;
  price: number;
  shipping: number;
  months: number;
  installmentTotal: number;
  stock: boolean;
  warranty: string;
  url: string;
  demo: boolean;
  checkedAt: string;
  cities: string[];
  sponsored: boolean;
  sourceSku?: string;
  sourceName?: string;
  shippingKnown?: boolean;
  installmentOptions?: { months: number; total: number; monthly: number }[];
  feedProductId?: string;
  feedVariantIndex?: number;
  feedUpdatedAt?: string | null;
};
export type Review = {
  id: string;
  productId: string;
  rating: number;
  text: string;
  name: string;
  userId?: string;
  status: "pending" | "approved" | "rejected";
  date: string;
};
export type Point = { id: string; productId: string; price: number; date: string; demo: boolean };
export type Catalog = {
  productAliases?: Record<string, string>;
  sourceCoverage?: {
    storeId: string;
    count: number;
    priced: number;
    checkedAt: string;
    sourceCount?: number;
    complete?: boolean;
    processed?: number;
  }[];
  liveSource?: {
    name: string;
    checkedAt: string;
    sourceCount: number;
    variantCount: number;
    state: "fresh" | "stale";
  };
  products: Product[];
  stores: Store[];
  offers: Offer[];
  history: Point[];
  settings: { headline: string; announcement: string };
  reviews: Review[];
  totals?: { products: number; stores: number };
};
export function canonicalProductId(c: Pick<Catalog, "productAliases">, id: string) {
  return c.productAliases &&
    Object.hasOwn(c.productAliases, id) &&
    typeof c.productAliases[id] === "string"
    ? c.productAliases[id]
    : id;
}
export const categories = [
  { id: "telefon", name: "Telefonlar", icon: "phone" },
  { id: "noutbuk", name: "Noutbuklar", icon: "laptop" },
  { id: "audio", name: "Qulaqlıq və audio", icon: "headphones" },
  { id: "planset", name: "Planşetlər", icon: "tablet" },
  { id: "ev", name: "Ev texnikası", icon: "home" },
  { id: "saat", name: "Ağıllı saatlar", icon: "watch" },
  { id: "oyun", name: "Oyun dünyası", icon: "game" },
  { id: "aksesuar", name: "Aksesuarlar", icon: "plug" },
  { id: "foto", name: "Foto və kamera", icon: "camera" },
  { id: "gozellik", name: "Gözəllik və baxım", icon: "sparkles" },
  { id: "tv", name: "Televizorlar", icon: "tv" },
  { id: "mebel", name: "Mebel və interyer", icon: "home" },
  { id: "idman", name: "İdman və istirahət", icon: "bike" },
  { id: "oyuncaq", name: "Uşaq və oyuncaq", icon: "game" },
  { id: "market", name: "Market", icon: "basket" },
  { id: "avto", name: "Avtomobil", icon: "car" },
  { id: "kitab", name: "Kitab və dəftərxana", icon: "book" },
];
const img = (c: string, s: string) => `https://cdn.dummyjson.com/product-images/${c}/${s}/1.webp`;
export const seedStores: Store[] = [
  {
    id: "alinino",
    name: "Ali & Nino",
    domain: "alinino.az",
    color: "#e52d37",
    active: true,
    description:
      "Kitablar, hədiyyələr, dəftərxana və müxtəlif məhsullar. Sitemap mənbəyi aşkar edilib; tam qiymət idxalı hazırlanır.",
    logo: "/logos/alinino.png",
    sourceStatus: "sitemap_discovered",
  },
  ...localMerchants.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    color: s.color,
    active: true,
    description: s.description,
    logo: s.logo,
    logoBackground: (s as { logoBackground?: string }).logoBackground,
    sourceStatus: s.priceIntegration,
  })),
  {
    id: "kontakt",
    name: "Kontakt",
    domain: "kontakt.az",
    color: "#e42f42",
    active: true,
    description: "Elektronika və məişət texnikası mağazası.",
  },
  {
    id: "irshad",
    name: "İrşad",
    domain: "irshad.az",
    color: "#58a546",
    active: true,
    description: "Telefon, elektronika və ev texnikası.",
  },
  {
    id: "baku",
    name: "Baku Electronics",
    domain: "bakuelectronics.az",
    color: "#e43c38",
    active: true,
    description: "Elektronika və məişət texnikası şəbəkəsi.",
  },
  {
    id: "ispace",
    name: "iSpace",
    domain: "ispace.az",
    color: "#24292b",
    active: true,
    description: "Apple məhsulları üzrə mağaza.",
  },
  {
    id: "soliton",
    name: "Soliton",
    domain: "soliton.az",
    color: "#274ca3",
    active: true,
    description: "Məişət texnikası və elektronika.",
  },
  {
    id: "technomania",
    name: "Technomania",
    domain: "technomania.az",
    color: "#cb842b",
    active: true,
    description: "Rəsmi JSON feed ilə məhsul, qiymət və stok məlumatları yenilənir.",
  },
  {
    id: "birmarket",
    name: "Birmarket",
    domain: "birmarket.az",
    color: "#8b42c7",
    active: true,
    description: "Müxtəlif satıcıların təkliflərini birləşdirən marketpleys.",
  },
];
// [id, name, brand, category, variant, image, base price, specs] for the inactive demo catalogue.
type SeedRow = [string, string, string, string, string, string, number, Record<string, string>];
const rows: SeedRow[] = [
  [
    "iphone-13-pro",
    "Apple iPhone 13 Pro",
    "Apple",
    "telefon",
    "256 GB · Sierra Blue",
    img("smartphones", "iphone-13-pro"),
    1299,
    { Ekran: "6.1 düym", Yaddaş: "256 GB", Rəng: "Sierra Blue", Prosessor: "A15 Bionic" },
  ],
  [
    "macbook-pro",
    "Apple MacBook Pro 14″",
    "Apple",
    "noutbuk",
    "16 GB / 512 GB · Space Grey",
    img("laptops", "apple-macbook-pro-14-inch-space-grey"),
    2899,
    { Ekran: "14 düym", Yaddaş: "512 GB SSD", RAM: "16 GB", Rəng: "Space Grey" },
  ],
  [
    "airpods-max",
    "Apple AirPods Max",
    "Apple",
    "audio",
    "Silver · Bluetooth",
    img("mobile-accessories", "apple-airpods-max-silver"),
    899,
    { Bağlantı: "Bluetooth", Rəng: "Silver", Tip: "Qulaqüstü", "Səs-küyün azaldılması": "Aktiv" },
  ],
  [
    "ipad-mini",
    "Apple iPad mini 2021",
    "Apple",
    "planset",
    "64 GB · Starlight",
    img("tablets", "ipad-mini-2021-starlight"),
    849,
    { Ekran: "8.3 düym", Yaddaş: "64 GB", Rəng: "Starlight", Prosessor: "A15 Bionic" },
  ],
  [
    "airpods",
    "Apple AirPods",
    "Apple",
    "audio",
    "White · Simsiz qulaqlıq",
    img("mobile-accessories", "apple-airpods"),
    229,
    { Bağlantı: "Bluetooth", Rəng: "Ağ", Tip: "Qulaqiçi", Qutu: "Şarj qutusu" },
  ],
  [
    "huawei-matebook",
    "Huawei MateBook X Pro",
    "Huawei",
    "noutbuk",
    "16 GB / 512 GB · Grey",
    img("laptops", "huawei-matebook-x-pro"),
    2099,
    { Ekran: "13.9 düym", RAM: "16 GB", Yaddaş: "512 GB SSD", Rəng: "Boz" },
  ],
  [
    "watch-series4",
    "Apple Watch Series 4",
    "Apple",
    "saat",
    "Gold · GPS",
    img("mobile-accessories", "apple-watch-series-4-gold"),
    349,
    { Korpus: "Alüminium", Bağlantı: "GPS", Rəng: "Gold", Uyğunluq: "iOS" },
  ],
  [
    "asus-zenbook",
    "ASUS Zenbook Pro Duo",
    "ASUS",
    "noutbuk",
    "16 GB / 1 TB · Dual Screen",
    img("laptops", "asus-zenbook-pro-dual-screen-laptop"),
    3299,
    { RAM: "16 GB", Yaddaş: "1 TB SSD", Ekran: "İki ekran", Rəng: "Mavi" },
  ],
  [
    "homepod-mini",
    "Apple HomePod mini",
    "Apple",
    "ev",
    "Cosmic Grey",
    img("mobile-accessories", "apple-homepod-mini-cosmic-grey"),
    189,
    { Bağlantı: "Wi-Fi", Rəng: "Cosmic Grey", Tip: "Ağıllı dinamik", Uyğunluq: "Apple Home" },
  ],
  [
    "dell-xps",
    "Dell XPS 13 9300",
    "Dell",
    "noutbuk",
    "16 GB / 512 GB · Silver",
    img("laptops", "new-dell-xps-13-9300-laptop"),
    2399,
    { Ekran: "13.4 düym", RAM: "16 GB", Yaddaş: "512 GB SSD", Rəng: "Gümüşü" },
  ],
  [
    "oppo-f19",
    "OPPO F19 Pro+",
    "OPPO",
    "telefon",
    "128 GB · Silver",
    img("smartphones", "oppo-f19-pro-plus"),
    479,
    { Ekran: "6.43 düym", Yaddaş: "128 GB", RAM: "8 GB", Rəng: "Gümüşü" },
  ],
  [
    "beats-flex",
    "Beats Flex",
    "Beats",
    "audio",
    "Black · Simsiz qulaqlıq",
    img("mobile-accessories", "beats-flex-wireless-earphones"),
    119,
    { Bağlantı: "Bluetooth", Rəng: "Qara", Tip: "Qulaqiçi", Şarj: "USB-C" },
  ],
  [
    "magsafe",
    "Apple MagSafe Battery Pack",
    "Apple",
    "aksesuar",
    "White",
    img("mobile-accessories", "apple-magsafe-battery-pack"),
    149,
    { Bağlantı: "MagSafe", Rəng: "Ağ", Tip: "Xarici batareya", Uyğunluq: "MagSafe iPhone" },
  ],
  [
    "lenovo-yoga",
    "Lenovo Yoga 920",
    "Lenovo",
    "noutbuk",
    "16 GB / 512 GB · Convertible",
    img("laptops", "lenovo-yoga-920"),
    1599,
    { Ekran: "13.9 düym", RAM: "16 GB", Yaddaş: "512 GB SSD", Tip: "Çevrilən ekran" },
  ],
  [
    "echo-plus",
    "Amazon Echo Plus",
    "Amazon",
    "ev",
    "Grey · Ağıllı dinamik",
    img("mobile-accessories", "amazon-echo-plus"),
    159,
    { Bağlantı: "Wi-Fi", Rəng: "Boz", Tip: "Ağıllı dinamik", Köməkçi: "Alexa" },
  ],
];
export const seedProducts: Product[] = [
  ...liveProducts,
  ...rows.map((p) => ({
    id: p[0],
    name: p[1],
    brand: p[2],
    category: p[3],
    variant: p[4],
    image: p[5],
    specs: p[7],
    description: `${p[1]} üçün eyni variantın mağaza təkliflərini müqayisə edin. Bu kataloq qeydi platformanın imkanlarını göstərən nümunədir.`,
    active: false,
    featured: false,
  })),
];
export const seedOffers: Offer[] = [
  ...liveOffers,
  ...rows.flatMap((p, i) =>
    seedStores
      .filter((s) => ["kontakt", "irshad", "baku", "ispace", "soliton"].includes(s.id))
      .slice(0, (i % 3) + 3)
      .map((s, j) => ({
        id: `${p[0]}-${s.id}`,
        productId: p[0],
        storeId: s.id,
        price: p[6] + j * (i % 2 ? 90 : 60),
        shipping: j === 1 ? 5 : 0,
        months: 12,
        installmentTotal: Math.round((p[6] + j * (i % 2 ? 90 : 60)) * 1.12 * 100) / 100,
        stock: true,
        warranty: "Nümunə: 12 ay",
        url: `https://${s.domain}`,
        demo: true,
        checkedAt: "2026-10-27T12:00:00Z",
        cities: ["Bakı", "Sumqayıt", "Gəncə"],
        sponsored: false,
      })),
  ),
];
export const seedHistory: Point[] = [
  ...liveHistory,
  ...rows.flatMap((p) =>
    Array.from({ length: 12 }, (_, i) => ({
      id: `h-${p[0]}-${i}`,
      productId: p[0],
      price: p[6] + [200, 180, 220, 160, 140, 170, 90, 120, 60, 80, 30, 0][i],
      date: new Date(Date.UTC(2026, 9, i * 2 + 5)).toISOString(),
      demo: true,
    })),
  ),
];
export const seedCatalog: Catalog = {
  products: seedProducts,
  stores: seedStores,
  offers: seedOffers,
  history: seedHistory,
  settings: {
    headline: "Qiyməti bil. Ağıllı seç.",
    announcement: "Az xərclə. Daha çoxunu əldə et.",
  },
  reviews: [],
};
const offerIndex = new WeakMap<Catalog, Map<string, Offer[]>>();
export function recordedOffersFor(c: Catalog, pid: string, city?: string) {
  let index = offerIndex.get(c);
  if (!index) {
    index = new Map();
    const active = new Set(c.stores.filter((s) => s.active).map((s) => s.id));
    for (const o of c.offers) {
      if (!active.has(o.storeId)) continue;
      const list = index.get(o.productId) || [];
      list.push(o);
      index.set(o.productId, list);
    }
    offerIndex.set(c, index);
  }
  const all = index.get(pid) || [];
  return city ? all.filter((o) => o.cities.includes(city)) : all;
}
export function validOffers(c: Catalog, pid: string, city?: string) {
  const all = recordedOffersFor(c, pid, city);
  const real = all.filter((o) => !o.demo);
  return (real.length ? real : all)
    .filter((o) => o.stock)
    .sort((a, b) => a.price + a.shipping - (b.price + b.shipping));
}
export function priceOf(c: Catalog, pid: string) {
  const l = validOffers(c, pid);
  if (l.length) return l[0].price + l[0].shipping;
  const all = recordedOffersFor(c, pid);
  const real = all.filter((o) => !o.demo);
  const shown = real.length ? real : all;
  return shown.length ? Math.min(...shown.map((o) => o.price + o.shipping)) : 0;
}
export function money(n: number) {
  if (!Number.isFinite(n)) return "—";
  const [a, b] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (b === "00" ? "" : "," + b) + " ₼";
}
