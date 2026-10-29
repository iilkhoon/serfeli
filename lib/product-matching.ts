import type { Catalog, Product } from "./catalog";

export type ProductMatch = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceSignature: string;
  targetSignature: string;
  active: boolean;
  approvedAt: string;
};
export const matchText = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u0307/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
const generic = (s: string) => !s || /^(mənbədəki model|standart|default|unknown)$/i.test(s.trim());
export function productIdentity(c: Catalog, p: Product) {
  const offers = c.offers
    .filter((o) => o.productId === p.id && !o.demo)
    .map((o) => [
      o.id,
      o.storeId,
      o.condition || "unspecified",
      o.sourceSku || "",
      o.sourceName || "",
      o.url,
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([
    p.id,
    matchText(p.name),
    matchText(p.brand),
    p.category,
    matchText(p.variant),
    Object.entries(p.specs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [matchText(k), matchText(v)]),
    offers,
  ]);
}
function details(p: Product) {
  return (
    p.name + " " + (generic(p.variant) ? "" : p.variant) + " " + Object.values(p.specs).join(" ")
  );
}
function colors(p: Product) {
  // Both foldings: "WHITE" must read as "white", "QIRMIZI" as "qırmızı".
  const text = details(p).toLowerCase() + " " + details(p).toLocaleLowerCase("az");
  const groups = [
    "black|qara|черный|чёрный",
    "white|ağ|beyaz|белый",
    "silver|gümüşü|gümüş|серебристый",
    "blue|göy|mavi|синий",
    "red|qırmızı|красный",
    "green|yaşıl|зеленый",
    "pink|çəhrayı|розовый",
    "gold|qızılı|золотой",
    "purple|bənövşəyi|фиолетовый",
    "gray|grey|boz|серый",
    "brown|qəhvəyi|коричневый",
    "orange|narıncı|оранжевый",
  ];
  return groups.flatMap((group, i) =>
    new RegExp("(^|[^\\p{L}])(" + group + ")(?=$|[^\\p{L}])", "u").test(text) ? [String(i)] : [],
  );
}
// Stores write memory as "12GB/256GB", "8GB/256", "6/128GB" or "256 GB". Storage is the largest
// figure; RAM is the smaller one when a pair is given, so a store that omits RAM still compares.
function memory(p: Product) {
  const text = details(p);
  const gb = (n: string, unit = "GB") =>
    Number(n.replace(",", ".")) * (/TB|ТБ/i.test(unit) ? 1024 : 1);
  const values: number[] = [];
  let ram = 0;
  for (const m of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(?:GB|ГБ)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(TB|GB|ТБ|ГБ)?(?![\p{L}\d])/giu,
  )) {
    const a = gb(m[1]),
      b = gb(m[2], m[3]);
    if (!m[3] && !/GB|ГБ/i.test(m[0])) continue;
    values.push(a, b);
    ram = Math.min(a, b);
  }
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(TB|GB|ТБ|ГБ)\b/gi))
    values.push(gb(m[1], m[2]));
  return { storage: values.length ? Math.max(...values) : 0, ram };
}
// Words that name the product type or connectivity rather than the model.
const typeWords = new Set(
  (
    "smartfon smartfonu mobil telefon telefonu noutbuk notebook laptop planşet planset tablet " +
    "televizor qulaqlıq qulaqliq simsiz ağıllı saat saatı nfc lte dual sim ds global version " +
    "yeni new for with ilə və and the"
  ).split(" "),
);
const brandAliases: [RegExp, string][] = [
  [/\b(iphone|ipad|macbook|imac|airpods|apple)\b/i, "apple"],
  [/\b(galaxy|samsung)\b/i, "samsung"],
  [/\b(redmi|poco|xiaomi)\b/i, "xiaomi"],
  [/\bhonor\b/i, "honor"],
  [/\bhuawei\b/i, "huawei"],
  [/\b(pixel|google)\b/i, "google"],
];
// The maker, not the retailer: some stores put their own name in the brand field.
export function canonicalBrand(p: Product) {
  const own = matchText(p.brand);
  for (const [pattern, brand] of brandAliases)
    if (
      pattern.test(own) ||
      (pattern.test(p.name) &&
        (!own ||
          own === matchText(p.sourceStoreId || "") ||
          /^(digər|unknown|generic|ispace)$/.test(own)))
    )
      return brand;
  return own;
}
// Order-insensitive model identity: brand, model words, storage and colour. Two listings with the
// same key name the same model in the same configuration, whatever each store's wording.
export function modelKey(p: Product) {
  const brand = canonicalBrand(p);
  if (!brand || /^(digər|unknown|generic)$/.test(brand)) return "";
  const text = (p.name + " " + (generic(p.variant) ? "" : p.variant))
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:gb|гб)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(tb|gb|тб|гб)?/giu, " ")
    .replace(/(\d+(?:[.,]\d+)?)\s*(tb|gb|тб|гб)\b/giu, " ");
  const colour = new Map(colors(p).map((c) => [c, true]));
  const tokens = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    const t = matchText(raw);
    if (!t || typeWords.has(t) || t === brand) continue;
    if (brandAliases.some(([pattern, b]) => b === brand && pattern.test(t) && t === b)) continue;
    tokens.add(t);
  }
  // Colour words are compared as colour groups ("qara" = "black"), the rest stay literal.
  const colourWords = new Set(
    [...tokens].filter((t) => colors({ ...p, name: t, variant: "", specs: {} }).length > 0),
  );
  const model = [...tokens].filter((t) => !colourWords.has(t)).sort();
  if (model.length < 2 || !model.some((t) => /\d/.test(t))) return "";
  const { storage } = memory(p);
  return [brand, model.join(" "), storage || "", [...colour.keys()].sort().join(",")].join("|");
}
function barcode(value: string) {
  const code = value.replace(/[\s-]/g, "");
  if (/^\d{9}[\dX]$/i.test(code))
    return (
      [...code.toUpperCase()].reduce(
        (sum, digit, i) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - i),
        0,
      ) %
        11 ===
      0
    );
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number),
    check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
function identifiers(p: Product, keys: RegExp, checkBarcode = false) {
  return Object.entries(p.specs)
    .filter(([k]) => keys.test(k))
    .map(([, v]) => v)
    .filter((v) => !checkBarcode || barcode(v))
    .map(matchText)
    .filter((v) => v.length >= 5);
}
const gtinKeys = /^(gtin|ean|ean13|upc|barcode|barkod|isbn)$/i;
const mpnKeys = /^(mpn|manufacturer part number|istehsalçı kodu|model kodu)$/i;
function evidence(a: Product, b: Product) {
  const result: string[] = [];
  for (const [keys, label] of [
    [gtinKeys, "Eyni barkod / ISBN"],
    [mpnKeys, "Eyni istehsalçı kodu"],
  ] as const) {
    const left = identifiers(a, keys, keys === gtinKeys),
      right = identifiers(b, keys, keys === gtinKeys);
    if (left.some((v) => v.length >= 5 && right.includes(v))) result.push(label);
  }
  if (matchText(a.name) === matchText(b.name) && matchText(a.name).length >= 10)
    result.push("Eyni məhsul adı");
  else if (modelKey(a) && modelKey(a) === modelKey(b)) result.push("Eyni model, yaddaş və rəng");
  return result;
}
export function checkProductPair(c: Catalog, sourceId: string, targetId: string) {
  const source = c.products.find((p) => p.id === sourceId),
    target = c.products.find((p) => p.id === targetId);
  const reasons: string[] = [],
    warnings: string[] = [];
  if (!source || !target)
    return { allowed: false, reasons: ["Məhsul tapılmadı."], warnings, evidence: [] as string[] };
  if (sourceId === targetId) reasons.push("Məhsul özü ilə uyğunlaşdırıla bilməz.");
  if (!source.active || !target.active) reasons.push("Hər iki məhsul aktiv olmalıdır.");
  if (source.marketplace || target.marketplace)
    reasons.push("Mağaza elanları bu modulda birləşdirilmir.");
  if (
    !canonicalBrand(source) ||
    /^(digər|unknown|generic)$/i.test(canonicalBrand(source)) ||
    canonicalBrand(source) !== canonicalBrand(target)
  )
    reasons.push("Brendlər uyğun deyil.");
  if (source.category !== target.category) reasons.push("Kateqoriyalar uyğun deyil.");
  const offers = (id: string) => c.offers.filter((o) => o.productId === id && !o.demo);
  const left = offers(sourceId),
    right = offers(targetId);
  if (!left.length || !right.length)
    reasons.push("Hər iki məhsulun real qiymət təklifi olmalıdır.");
  if (
    new Set(left.map((o) => o.storeId)).size !== left.length ||
    new Set(right.map((o) => o.storeId)).size !== right.length
  )
    reasons.push("Bir məhsulda eyni mağazanın birdən çox variant təklifi var; əvvəl onları ayır.");
  if (left.some((o) => right.some((r) => r.storeId === o.storeId)))
    reasons.push("Eyni mağazanın iki qeydi bu yolla birləşdirilmir.");
  const condition = (items: typeof left) =>
    [...new Set(items.map((o) => o.condition || "unspecified"))].sort().join(",");
  if (
    condition(left).includes(",") ||
    condition(right).includes(",") ||
    condition(left) !== condition(right)
  )
    reasons.push("Yeni / işlənmiş vəziyyəti uyğun deyil.");
  if ([...left, ...right].some((o) => !o.condition || o.condition === "unknown"))
    warnings.push("Məhsulun yeni / işlənmiş vəziyyətini mənbədə ayrıca yoxla.");
  for (const keys of [gtinKeys, mpnKeys]) {
    const a = identifiers(source, keys, keys === gtinKeys),
      b = identifiers(target, keys, keys === gtinKeys);
    if (a.length && b.length && !a.some((v) => b.includes(v)))
      reasons.push(keys === gtinKeys ? "Barkod / ISBN fərqlidir." : "İstehsalçı kodu fərqlidir.");
  }
  const aColor = colors(source).join(","),
    bColor = colors(target).join(",");
  if (aColor && bColor && aColor !== bColor) reasons.push("Rənglər uyğun deyil.");
  if (!aColor || !bColor)
    warnings.push("Mənbələrdən ən az birində rəng dəqiq göstərilməyib; əl ilə yoxla.");
  const aMemory = memory(source),
    bMemory = memory(target);
  if (
    (aMemory.storage && bMemory.storage && aMemory.storage !== bMemory.storage) ||
    (aMemory.ram && bMemory.ram && aMemory.ram !== bMemory.ram)
  )
    reasons.push("Yaddaş / RAM uyğun deyil.");
  if (!aMemory.storage !== !bMemory.storage)
    warnings.push("Yaddaş məlumatı bir mənbədə çatışmır; əl ilə yoxla.");
  else if (!aMemory.ram !== !bMemory.ram)
    warnings.push("RAM yalnız bir mənbədə göstərilib; əl ilə yoxla.");
  const specKeys =
    /memory|yaddaş|ram|rəng|color|size|ölçü|capacity|edition|format|isbn|gtin|ean|mpn/i;
  const targetSpecs = new Map(
    Object.entries(target.specs).map(([k, v]) => [matchText(k), matchText(v)]),
  );
  for (const [k, value] of Object.entries(source.specs))
    if (
      specKeys.test(k) &&
      targetSpecs.has(matchText(k)) &&
      targetSpecs.get(matchText(k)) !== matchText(value)
    )
      reasons.push(k + " fərqlidir.");
  if (
    !generic(source.variant) &&
    !generic(target.variant) &&
    matchText(source.variant) !== matchText(target.variant)
  )
    warnings.push("Variant yazılışları fərqlidir; bütün seçimləri yoxla.");
  const proof = evidence(source, target);
  if (!proof.length) reasons.push("Eyni ad, barkod və ya istehsalçı kodu ilə sübut yoxdur.");
  return { allowed: reasons.length === 0, reasons, warnings, evidence: proof };
}
export function prepareProductMatch(
  c: Catalog,
  sourceId: string,
  targetId: string,
  matches: ProductMatch[],
): ProductMatch {
  const result = checkProductPair(c, sourceId, targetId);
  if (!result.allowed) throw new Error(result.reasons.join(" "));
  if (
    matches.some(
      (m) =>
        m.active && (m.sourceId === sourceId || m.sourceId === targetId || m.targetId === sourceId),
    )
  )
    throw new Error("Zəncir və ya təkrar uyğunlaşdırma olmaz. Əvvəl mövcud əlaqəni geri al.");
  const stores = new Set(
    c.offers.filter((o) => !o.demo && o.productId === sourceId).map((o) => o.storeId),
  );
  const linked = new Set(
    matches.filter((m) => m.active && m.targetId === targetId).map((m) => m.sourceId),
  );
  if (c.offers.some((o) => !o.demo && linked.has(o.productId) && stores.has(o.storeId)))
    throw new Error("Bu mağazanın təklifi əsas məhsula artıq bağlıdır.");
  return {
    id: sourceId,
    sourceId,
    targetId,
    sourceSignature: productIdentity(c, c.products.find((p) => p.id === sourceId)!),
    targetSignature: productIdentity(c, c.products.find((p) => p.id === targetId)!),
    active: true,
    approvedAt: new Date().toISOString(),
  };
}
export function productMatchValid(c: Catalog, m: ProductMatch) {
  const a = c.products.find((p) => p.id === m.sourceId),
    b = c.products.find((p) => p.id === m.targetId);
  return !!(
    m.active &&
    a &&
    b &&
    productIdentity(c, a) === m.sourceSignature &&
    productIdentity(c, b) === m.targetSignature &&
    checkProductPair(c, a.id, b.id).allowed
  );
}
export function applyProductMatches(c: Catalog, matches: ProductMatch[]): Catalog {
  const valid = matches.filter((m) => productMatchValid(c, m));
  const sourceIds = new Set(valid.map((m) => m.sourceId));
  const aliases: Record<string, string> = Object.create(null);
  const stores = new Map<string, Set<string>>();
  for (const m of [...valid].sort(
    (a, b) => a.approvedAt.localeCompare(b.approvedAt) || a.id.localeCompare(b.id),
  )) {
    if (sourceIds.has(m.targetId) || aliases[m.sourceId]) continue;
    const occupied =
      stores.get(m.targetId) ||
      new Set(c.offers.filter((o) => !o.demo && o.productId === m.targetId).map((o) => o.storeId));
    const incoming = c.offers
      .filter((o) => !o.demo && o.productId === m.sourceId)
      .map((o) => o.storeId);
    if (incoming.some((id) => occupied.has(id))) continue;
    aliases[m.sourceId] = m.targetId;
    incoming.forEach((id) => occupied.add(id));
    stores.set(m.targetId, occupied);
  }
  return {
    ...c,
    productAliases: { ...aliases },
    products: c.products.map((p) => (aliases[p.id] ? { ...p, active: false } : p)),
    offers: c.offers.map((o) =>
      aliases[o.productId] ? { ...o, productId: aliases[o.productId] } : o,
    ),
    reviews: c.reviews.map((r) =>
      aliases[r.productId] ? { ...r, productId: aliases[r.productId] } : r,
    ),
  };
}
export function productMatchCandidates(c: Catalog, matches: ProductMatch[], search = "") {
  const buckets = new Map<string, Product[]>();
  const linked = new Set(matches.filter((m) => m.active).map((m) => m.sourceId));
  const targets = new Set(matches.filter((m) => m.active).map((m) => m.targetId));
  const query = matchText(search);
  const realIds = new Set(c.offers.filter((o) => !o.demo).map((o) => o.productId));
  for (const p of c.products) {
    if (!p.active || p.marketplace || linked.has(p.id) || !realIds.has(p.id)) continue;
    const model = modelKey(p);
    const keys = [
      "name:" + matchText(p.name),
      ...(model ? ["model:" + model] : []),
      ...identifiers(p, gtinKeys, true).map((v) => "gtin:" + v),
      ...identifiers(p, mpnKeys).map((v) => "mpn:" + v),
    ];
    for (const key of keys) {
      const group = buckets.get(key) || [];
      group.push(p);
      buckets.set(key, group);
    }
  }
  const seen = new Set<string>();
  const candidates: {
    source: Product;
    target: Product;
    sourceSignature: string;
    targetSignature: string;
    evidence: string[];
    warnings: string[];
  }[] = [];
  for (const group of buckets.values()) {
    // A generic source label is not a useful identity bucket.
    if (group.length > 30) continue;
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const [target, source] = [group[i], group[j]].sort(
          (a, b) =>
            Number(targets.has(b.id)) - Number(targets.has(a.id)) || a.id.localeCompare(b.id),
        );
        if (targets.has(source.id)) continue;
        const key = source.id + ":" + target.id;
        if (
          seen.has(key) ||
          (query && !matchText(source.name + target.name + source.brand).includes(query))
        )
          continue;
        seen.add(key);
        const result = checkProductPair(c, source.id, target.id);
        if (result.allowed) {
          try {
            prepareProductMatch(c, source.id, target.id, matches);
          } catch {
            continue;
          }
          candidates.push({
            source,
            target,
            sourceSignature: productIdentity(c, source),
            targetSignature: productIdentity(c, target),
            evidence: result.evidence,
            warnings: result.warnings,
          });
        }
      }
  }
  return candidates;
}
