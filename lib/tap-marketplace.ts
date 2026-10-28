import type { Product, Offer, Store } from "./catalog";
// Apollo cache entries from a Tap.az listing page; only the fields read below are described.
type TapUrl = { url?: string };
type TapAd = {
  __typename?: string;
  features?: { adFeatures?: { hasLabel?: unknown; label?: unknown } };
  shop?: { __ref?: string } | null;
  status?: unknown;
  legacyResourceId?: unknown;
  path: string;
  title?: unknown;
  price?: unknown;
  region?: unknown;
  azProperties?: { name: string; value?: unknown }[];
  properties?: { name: string; value?: unknown }[];
  photosPreview?: TapUrl[];
  photo?: TapUrl;
  photos?: TapUrl[];
};
type TapShop = { name?: unknown; uri?: string; logo?: TapUrl };
export function tapShopProduct(
  state: Record<string, unknown>,
  checkedAt = new Date().toISOString(),
) {
  const products: Product[] = [],
    offers: Offer[] = [],
    stores: Store[] = [];
  for (const ad of Object.values(state) as (TapAd | null)[]) {
    if (
      ad?.__typename !== "Ad" ||
      ad.features?.adFeatures?.hasLabel !== true ||
      ad.features.adFeatures.label !== "RETAILER" ||
      !ad.shop?.__ref ||
      ad.status !== "APPROVED" ||
      !Number.isSafeInteger(ad.legacyResourceId) ||
      !String(ad.path).startsWith("/elanlar/elektronika/")
    )
      continue;
    const shop = state[ad.shop.__ref] as TapShop | undefined;
    if (!shop?.name || !String(shop.uri).startsWith("/shops/")) continue;
    const shopKey = String(shop.uri).split("/").pop() || "";
    if (!/^[a-zA-Z0-9_-]+$/.test(shopKey)) continue;
    const storeId = "tap-" + shopKey;
    const id = "tap-ad-" + ad.legacyResourceId;
    const properties = ad.azProperties || ad.properties || [];
    const get = (name: string) => properties.find((p) => p.name === name)?.value;
    const condition =
      get("Yeni?") === "Bəli" ? "new" : get("Yeni?") === "Xeyr" ? "used" : "unknown";
    const conditionName =
      condition === "new"
        ? "Yeni"
        : condition === "used"
          ? "İşlənmiş"
          : "Vəziyyət dəqiqləşdirilməlidir";
    const brand = String(get("Marka") || "Digər").slice(0, 80);
    const category = ad.path.includes("/noutbuklar/")
      ? "noutbuk"
      : ad.path.includes("/telefonlar/")
        ? "telefon"
        : ad.path.includes("/televizor")
          ? "tv"
          : ad.path.includes("/planset")
            ? "planset"
            : ad.path.includes("/foto")
              ? "foto"
              : ad.path.includes("/audio")
                ? "audio"
                : ad.path.includes("/oyun")
                  ? "oyun"
                  : "aksesuar";
    const image =
      ad.photosPreview?.[0]?.url || ad.photo?.url || ad.photos?.[0]?.url || "/favicon.svg";
    const url = "https://tap.az" + ad.path;
    if (!stores.some((s) => s.id === storeId))
      stores.push({
        id: storeId,
        name: String(shop.name).slice(0, 100) + " · Tap.az",
        domain: "tap.az",
        color: "#ff6b00",
        active: true,
        description:
          "Tap.az-da mağaza nişanı olan satıcı. Qiymət elandakı məbləğdir; stok və məhsulun vəziyyəti satıcıda yoxlanmalıdır.",
        logo: shop.logo?.url,
        sourceStatus: "marketplace_shop",
      });
    products.push({
      id,
      name: String(ad.title).trim().slice(0, 180),
      brand,
      category,
      variant: conditionName,
      image,
      specs: { Vəziyyət: conditionName, Mənbə: "Tap.az mağaza elanı" },
      description:
        "Tap.az-da RETAILER mağaza nişanı və mağaza profili təsdiqlənən elan. Mağaza: " +
        shop.name +
        ". Stok, zəmanət və məhsulun vəziyyətini satıcı ilə dəqiqləşdirin.",
      active: true,
      featured: false,
      sourceStoreId: storeId,
      sourceUrl: url,
      marketplace: true,
    });
    const price = Number(ad.price);
    if (Number.isFinite(price) && price > 0 && price < 10000000)
      offers.push({
        id: "tap-offer-" + ad.legacyResourceId,
        productId: id,
        storeId,
        price,
        shipping: 0,
        shippingKnown: false,
        months: 0,
        installmentTotal: 0,
        stock: false,
        stockKnown: false,
        condition,
        warranty: "Satıcı ilə dəqiqləşdirin",
        url,
        demo: false,
        checkedAt,
        cities: [String(ad.region || "Bakı")],
        sponsored: false,
        sourceSku: String(ad.legacyResourceId),
        sourceName: String(ad.title).slice(0, 300),
      });
  }
  return { products, offers, stores };
}
