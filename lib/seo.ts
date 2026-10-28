import { categories, canonicalProductId, type Catalog } from "./catalog";
export const SITE_URL = "https://qepik-az.mythicfern36.chatgpt.site";
export function pageSeo(path: string, c: Catalog) {
  const [route, qs] = path.split("?"),
    parts = route.split("/").filter(Boolean),
    page = parts[0] || "home";
  const product =
    page === "mehsul"
      ? c.products.find((p) => p.id === canonicalProductId(c, parts[1]) && p.active)
      : undefined;
  const category = categories.find((x) => x.id === parts[1]);
  const store =
    page === "magazalar" ? c.stores.find((s) => s.id === parts[1] && s.active) : undefined;
  const names: Record<string, string> = {
    home: "Qiymət müqayisəsi — Azərbaycan mağazalarında sərfəli qiymətlər",
    kataloq: "Məhsullar və qiymətlər",
    magazalar: "Azərbaycan mağazaları",
    endirimler: "Qiyməti düşən məhsullar",
    rehber: "Alış-veriş bələdçisi",
    "magaza-qeydiyyat": "Mağaza qeydiyyatı",
    admin: "Admin paneli",
    bildirisler: "Qiymət bildirişləri",
    secilmisler: "Seçilmişlər",
    muqayise: "Məhsul müqayisəsi",
    axtaris: "Axtarış nəticələri",
  };
  const title = product
    ? `${product.name} ${product.variant} qiymətləri`
    : page === "kateqoriya"
      ? `${category?.name || "Kateqoriya"} qiymətləri`
      : store
        ? `${store.name} qiymətləri və məhsulları`
        : names[page] || "Qəpik";
  const description = product
    ? `${product.name} ${product.variant}: Azərbaycan mağazalarında nağd qiyməti, stoku, çatdırılma və taksit yekununu müqayisə edin. Mənbə və yoxlanma vaxtı ilə.`
    : store
      ? `${store.name} mağazasının məhsul təklifləri, rəsmi ünvanı və qiymət müqayisəsi.`
      : `${category?.name || "Elektronika və ev texnikası"} üçün Azərbaycan mağazalarının qiymətlərini Qəpik-də müqayisə edin. Məhsul, stok, taksit və mənbə məlumatları bir yerdə.`;
  const privatePage = [
    "admin",
    "bildirisler",
    "secilmisler",
    "muqayise",
    "axtaris",
    "magaza-qeydiyyat",
  ].includes(page);
  const pageNo = new URLSearchParams(qs || "").get("page");
  const canonical =
    SITE_URL +
    (product ? "/mehsul/" + product.id : route === "/" ? "" : route) +
    (pageNo && Number(pageNo) > 1 ? "?page=" + pageNo : "");
  return {
    title: title + " | Qəpik",
    description,
    alternates: { canonical },
    robots: {
      index: !privatePage,
      follow: !["admin", "bildirisler", "secilmisler"].includes(page),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Qəpik",
      locale: "az_AZ",
      type: "website",
      images: [
        {
          url: SITE_URL + "/social-card.png",
          width: 1200,
          height: 630,
          alt: "Qəpik — Azərbaycan qiymət müqayisəsi",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SITE_URL + "/social-card.png"],
    },
  };
}
export function structuredData(path: string, c: Catalog) {
  const parts = path.split("?")[0].split("/").filter(Boolean),
    p = c.products.find((p) => p.id === canonicalProductId(c, parts[1]) && p.active);
  const data: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": SITE_URL + "/#website",
      name: "Qəpik",
      url: SITE_URL,
      inLanguage: "az-AZ",
    },
  ];
  if (parts[0] === "mehsul" && p) {
    const offers = c.offers.filter(
      (o) =>
        o.productId === p.id && !o.demo && c.stores.some((s) => s.id === o.storeId && s.active),
    );
    const available = offers.filter((o) => o.stock);
    const shown = available.length ? available : offers;
    data.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name + " " + p.variant,
      image: new URL(p.image, SITE_URL).href,
      description: p.description,
      sku: p.id,
      brand: { "@type": "Brand", name: p.brand },
      url: SITE_URL + "/mehsul/" + p.id,
      ...(shown.length
        ? {
            offers: {
              "@type": "AggregateOffer",
              lowPrice: Math.min(...shown.map((o) => o.price)),
              highPrice: Math.max(...shown.map((o) => o.price)),
              priceCurrency: "AZN",
              offerCount: shown.length,
              offers: shown.map((o) => ({
                "@type": "Offer",
                price: o.price,
                priceCurrency: "AZN",
                url: o.url,
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
                  name: c.stores.find((s) => s.id === o.storeId)?.name,
                },
              })),
            },
          }
        : {}),
    });
    data.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana səhifə", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: categories.find((cat) => cat.id === p.category)?.name || "Məhsullar",
          item: SITE_URL + "/kateqoriya/" + p.category,
        },
        { "@type": "ListItem", position: 3, name: p.name, item: SITE_URL + "/mehsul/" + p.id },
      ],
    });
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
