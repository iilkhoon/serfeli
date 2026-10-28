import type { Product, Offer } from "./catalog";
export const storeApiSources = [
  { id: "techbar", origin: "https://techbar.az", name: "Techbar" },
  { id: "casio", origin: "https://casio.az", name: "Casio Azərbaycan" },
  { id: "eurolux", origin: "https://eurolux.az", name: "Eurolux" },
  { id: "seehome", origin: "https://seehome.az", name: "SeeHome" },
  { id: "allstar", origin: "https://allstar.az", name: "Allstar" },
];
const plain = (v: unknown) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 1114111)))
    .replace(/\s+/g, " ")
    .trim();
// A WooCommerce Store API product row (/wp-json/wc/store/v1/products); fields are validated below.
export type StoreApiRow = {
  id: number;
  name?: unknown;
  permalink: string;
  sku?: unknown;
  type?: unknown;
  variation?: unknown;
  has_options?: unknown;
  is_in_stock?: unknown;
  categories?: { name?: unknown; slug?: unknown }[];
  attributes?: { name?: unknown; terms?: { name?: unknown }[] }[];
  brands?: { name?: unknown }[];
  images?: { thumbnail?: string; src?: string }[];
  prices?: { currency_code?: unknown; currency_minor_unit?: unknown; price?: unknown };
};
function category(raw: StoreApiRow, storeId: string) {
  const n = (raw.categories || [])
    .map((c) => `${c.name} ${c.slug}`)
    .join(" ")
    .toLocaleLowerCase("az");
  if (storeId === "casio") return "saat";
  if (storeId === "allstar") return /kamera|camera|video/.test(n) ? "foto" : "audio";
  if (/qulaq|headphone|audio|dinamik|speaker|mikrofon/.test(n)) return "audio";
  if (/saat|watch/.test(n)) return "saat";
  if (/noutbuk|notebook|laptop|macbook/.test(n)) return "noutbuk";
  if (/planşet|planset|tablet|ipad/.test(n)) return "planset";
  if (/televiz|televizor|television|smart-tv/.test(n)) return "tv";
  if (/oyun|gaming|playstation|konsol/.test(n)) return "oyun";
  if (/telefon|smartfon|smartphone|mobil/.test(n))
    return /akses|access|kabro|case|qoruyucu|şarj/.test(n) ? "aksesuar" : "telefon";
  if (/kamera|camera|foto/.test(n)) return "foto";
  if (/fen|saç|sac-|hair|beauty|gozellik|gözəllik/.test(n)) return "gozellik";
  if (/mebel|oturacaq|kreslo|stul|masa|furniture/.test(n)) return "mebel";
  if (/idman|sport|velosiped|bicycle/.test(n)) return "idman";
  if (/oyuncaq|toy|uşaq/.test(n)) return "oyuncaq";
  if (/avto|auto/.test(n)) return "avto";
  if (
    /texnika|paltar|soyuducu|tozsoran|vacuum|kondisioner|soba|ütü|utu|mətbəx|metbex|kitchen|qabyuyan|ev-|məişət|meiset|samovar|çaydan|caydan|blender/.test(
      n,
    ) ||
    storeId === "eurolux"
  )
    return "ev";
  return "aksesuar";
}
export function normalizeStoreProducts(
  storeId: string,
  rows: StoreApiRow[],
  checkedAt = new Date().toISOString(),
) {
  const source = storeApiSources.find((s) => s.id === storeId);
  if (!source) throw new Error("Naməlum kataloq mənbəyi");
  const products: Product[] = [],
    offers: Offer[] = [],
    warnings: { id: unknown; reason: string }[] = [];
  for (const r of rows) {
    try {
      if (!Number.isSafeInteger(r.id) || r.id <= 0 || !r.name)
        throw new Error("Məhsul ID/ad yoxdur");
      const url = new URL(r.permalink);
      if (
        url.protocol !== "https:" ||
        url.hostname.replace(/^www\./, "") !== new URL(source.origin).hostname
      )
        throw new Error("Məhsul domeni uyğun deyil");
      const attrs = Array.isArray(r.attributes) ? r.attributes : [];
      const specs: Record<string, string> = {};
      for (const a of attrs.slice(0, 8)) {
        const value = (a.terms || []).map((t) => plain(t.name)).join(", ");
        if (value) specs[plain(a.name).slice(0, 60)] = value.slice(0, 160);
      }
      const brand = plain(
        r.brands?.[0]?.name ||
          specs.Brend ||
          specs.Brand ||
          (storeId === "casio" ? "Casio" : storeId === "eurolux" ? "Eurolux" : "Digər"),
      ).slice(0, 80);
      let image = "/favicon.svg";
      const imageSource = r.images?.[0]?.thumbnail || r.images?.[0]?.src;
      if (imageSource) {
        const u = new URL(imageSource);
        if (u.protocol === "https:") image = u.href;
      }
      const id = "wc-" + storeId + "-" + r.id;
      const variants =
        plain(r.variation) ||
        [specs["Rəng"], specs["Yaddaş"]].filter(Boolean).join(" · ") ||
        (r.has_options ? "Variant mağazada seçilir" : "Mənbədəki model");
      products.push({
        id,
        name: plain(r.name).slice(0, 180),
        brand,
        category: category(r, storeId),
        variant: variants.slice(0, 180),
        image,
        specs,
        description:
          source.name +
          " mağazasının açıq məhsul kataloqundan alınıb. Dəqiq variantı, qiyməti və stok vəziyyətini mağazada yoxlayın.",
        active: true,
        featured: false,
        sourceStoreId: storeId,
        sourceUrl: url.href,
      });
      const currency = r.prices?.currency_code,
        unit = r.prices?.currency_minor_unit;
      const minor = String(r.prices?.price ?? "");
      if (
        currency !== "AZN" ||
        typeof unit !== "number" ||
        !Number.isInteger(unit) ||
        unit < 0 ||
        unit > 4 ||
        !/^\d+$/.test(minor) ||
        Number(minor) <= 0 ||
        r.type === "variable" ||
        r.has_options
      )
        continue;
      const price = Math.round((Number(minor) / 10 ** unit) * 100) / 100;
      if (!Number.isFinite(price) || price <= 0 || price > 10000000) continue;
      offers.push({
        id: "wc-offer-" + storeId + "-" + r.id,
        productId: id,
        storeId,
        price,
        shipping: 0,
        shippingKnown: false,
        months: 0,
        installmentTotal: 0,
        stock: r.is_in_stock === true,
        warranty: "Mağazada dəqiqləşdirin",
        url: url.href,
        demo: false,
        checkedAt,
        cities: ["Bakı"],
        sponsored: false,
        sourceSku: String(r.sku || r.id).slice(0, 200),
        sourceName: plain(r.name).slice(0, 300),
      });
    } catch (e) {
      warnings.push({ id: r.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { storeId, checkedAt, products, offers, warnings };
}
