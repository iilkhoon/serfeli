function entity(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function attr(tag: string, name: string) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i"));
  return m ? entity(m[2]) : undefined;
}
// Shape of the storefront's data-product-json attribute; every field is re-checked below.
type AlininoVariant = {
  id: unknown;
  price: unknown;
  image_id?: unknown;
  image_ids?: unknown[];
  barcode?: string;
  sku?: string;
  available?: unknown;
  title?: string;
};
type AlininoProduct = {
  id: unknown;
  title?: string;
  url: string;
  short_description?: string;
  properties?: { id: unknown; title: unknown; backoffice?: boolean; is_hidden?: boolean }[];
  characteristics?: { property_id: unknown; title: unknown }[];
  variants?: AlininoVariant[];
  images?: { id: unknown; medium_url?: string; original_url?: string; url?: string }[];
};
export function extractAlinino(html: string, rawUrl: string) {
  let pageId: string | undefined, currency: string | undefined;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const config = attr(m[0], "data-config");
    if (!config) continue;
    try {
      const data = JSON.parse(config);
      if (data.product_id) pageId = String(data.product_id);
      if (data.currency_code) currency = data.currency_code;
    } catch {}
  }
  if (!pageId || currency !== "AZN")
    throw new Error("Ali & Nino məhsul/valyuta məlumatı təsdiqlənmədi.");
  const forms = [...html.matchAll(/<form\b[^>]*>/gi)].filter(
    (m) => /\bdata-main-form\b/.test(m[0]) && attr(m[0], "data-product-id") === pageId,
  );
  if (!forms.length) throw new Error("Ali & Nino əsas məhsul forması tapılmadı.");
  const raw = attr(forms[0][0], "data-product-json");
  if (!raw) throw new Error("Ali & Nino məhsul JSON-u yoxdur.");
  const p = JSON.parse(raw) as AlininoProduct;
  if (String(p.id) !== pageId || !p.title)
    throw new Error("Ali & Nino məhsul identifikatoru uyğun deyil.");
  const expected = new URL(p.url, "https://alinino.az"),
    actual = new URL(rawUrl);
  if (
    expected.hostname.replace(/^www\./, "") !== actual.hostname.replace(/^www\./, "") ||
    expected.pathname.replace(/\/$/, "") !== actual.pathname.replace(/\/$/, "")
  )
    throw new Error("Əsas məhsulun ünvanı uyğun deyil.");
  const specs: Record<string, string> = {};
  for (const prop of p.properties || []) {
    if (prop.backoffice || prop.is_hidden) continue;
    const values = (p.characteristics || [])
      .filter((x) => x.property_id === prop.id)
      .map((x) => String(x.title));
    if (values.length && Object.keys(specs).length < 10)
      specs[String(prop.title).slice(0, 80)] = values.join(", ").slice(0, 200);
  }
  const variants = Array.isArray(p.variants) ? p.variants : [];
  if (!variants.length || variants.length > 500)
    throw new Error("Ali & Nino variant siyahısı düzgün deyil.");
  const checkedAt = new Date().toISOString();
  const rows = variants.map((v) => {
    const price = Number(v.price);
    if (!Number.isFinite(price) || price <= 0 || price > 10000000 || !/^\d+$/.test(String(v.id)))
      throw new Error("Ali & Nino variant qiyməti düzgün deyil.");
    const photos = p.images || [];
    const image =
      photos.find((i) => i.id === v.image_id || v.image_ids?.includes(i.id)) || photos[0];
    const imageUrl = image?.medium_url || image?.original_url || image?.url;
    const gtin = String(v.barcode || specs.ISBN || "");
    return {
      name: String(p.title),
      sku: String(v.sku || v.id),
      price,
      currency: "AZN",
      stock: v.available === true,
      stockKnown: typeof v.available === "boolean",
      image: imageUrl,
      brand: specs.Brend || specs.Brand || specs["Nəşriyyat"],
      description: String(p.short_description || "")
        .replace(/<[^>]*>/g, " ")
        .slice(0, 1500),
      gtin,
      specs,
      variant: String(v.title || "Mənbədəki model").slice(0, 180),
      variantId: String(v.id),
      familyId: "alinino-" + p.id,
      category: /^(978|979)\d{10}$/.test(gtin) || specs["Müəllif"] ? "kitab" : undefined,
      checkedAt,
    };
  });
  return rows;
}
