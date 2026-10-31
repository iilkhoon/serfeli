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
// Folded once per distinct string: the merge compares the same titles and spec values many times.
const matchTextCache = new Map<string, string>();
export const matchText = (s: string) => {
  let folded = matchTextCache.get(s);
  if (folded === undefined) {
    folded = s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\u0307/g, "")
      .replace(/[^\p{L}\p{N}]/gu, "");
    if (matchTextCache.size >= 200_000) matchTextCache.clear();
    matchTextCache.set(s, folded);
  }
  return folded;
};
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
// Colour names in English, Azerbaijani and Russian (with the feminine/neuter endings stores use).
// New groups go at the end: a group's index is part of modelKey().
const colorGroups = [
  "black|qara|черный|чёрный|черная|чёрная|черное|чёрное",
  "white|ağ|beyaz|белый|белая|белое",
  "silver|gümüşü|gümüş|серебристый|серебристая|серебряный",
  "blue|göy|mavi|синий|синяя|голубой|голубая",
  "red|qırmızı|красный|красная",
  "green|yaşıl|зеленый|зелёный|зеленая|зелёная",
  "pink|çəhrayı|розовый|розовая",
  "gold|qızılı|золотой|золотая|золотистый",
  "purple|bənövşəyi|фиолетовый|фиолетовая",
  "gray|grey|boz|серый|серая",
  "brown|qəhvəyi|коричневый|коричневая",
  "orange|orenge|narıncı|оранжевый|оранжевая",
  "yellow|sarı|желтый|жёлтый|желтая|жёлтая",
  "titanium|titan|титан|титановый",
  "lavender|lavanda|лавандовый",
  "starlight",
  "midnight",
  "glacier",
  "burgundy|bordo|бордовый",
];
const colorPatterns = colorGroups.map(
  (group) => new RegExp("(^|[^\\p{L}])(" + group + ")(?=$|[^\\p{L}])", "u"),
);
// Products are not changed in place, so values computed once hold for that object.
const colorCache = new WeakMap<Product, string[]>();
function colors(p: Product) {
  let found = colorCache.get(p);
  if (found) return found;
  // Both foldings: "WHITE" must read as "white", "QIRMIZI" as "qırmızı".
  const text = details(p).toLowerCase() + " " + details(p).toLocaleLowerCase("az");
  found = colorPatterns.flatMap((pattern, i) => (pattern.test(text) ? [String(i)] : []));
  colorCache.set(p, found);
  return found;
}
// Stores write memory as "12GB/256GB", "8GB/256", "6/128GB" or "256 GB". Storage is the largest
// figure; RAM is the smaller one when a pair is given, so a store that omits RAM still compares.
const memories = new WeakMap<Product, { storage: number; ram: number }>();
function memory(p: Product) {
  let found = memories.get(p);
  if (!found) memories.set(p, (found = computeMemory(p)));
  return found;
}
function computeMemory(p: Product) {
  const text = details(p);
  const gb = (n: string, unit = "GB") =>
    Number(n.replace(",", ".")) * (/TB|ТБ/iu.test(unit) ? 1024 : 1);
  const values: number[] = [];
  let ram = 0;
  let memoryPair = false;
  for (const m of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(?:GB|ГБ|QB)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(TB|GB|ТБ|ГБ|QB)?(?![\p{L}\d])/giu,
  )) {
    const a = gb(m[1]),
      b = gb(m[2], m[3]);
    if (!m[3] && !/GB|ГБ|QB/iu.test(m[0])) continue;
    values.push(a, b);
    ram = Math.min(a, b);
    memoryPair = true;
  }
  // "256GB", "256 Gb", "256 ГБ", "256 QB"; \b would not end a Cyrillic unit.
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(TB|GB|ТБ|ГБ|QB)(?![\p{L}\p{N}])/giu))
    values.push(gb(m[1], m[2]));
  for (const [key, value] of Object.entries(p.specs)) {
    if (!/^(ram|operativ yaddaş|əməli yaddaş|оперативная память)$/i.test(key.trim())) continue;
    const amount = value.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|ТБ|ГБ|QB)?/iu);
    if (amount) ram = gb(amount[1], amount[2]);
  }
  const namedRam = text.match(/(?:\bRAM\s*:?\s*(\d+)\s*GB|(\d+)\s*GB\s*RAM\b)/i);
  if (namedRam) ram = Number(namedRam[1] || namedRam[2]);
  let storage = values.length ? Math.max(...values) : 0;
  const statedStorage = Object.entries(p.specs).some(
    ([key, value]) =>
      /^(rom|daxili yaddaş|yaddaş|storage|ssd|hdd)$/i.test(key.trim()) && /\d/.test(value),
  );
  // A RAM-only label must not invent the same amount of internal storage.
  if (ram && storage === ram && !memoryPair && !statedStorage) storage = 0;
  return { storage, ram };
}
// Words that name the product type, or title noise ("rəsmi zəmanət", "original", "yeni"), rather
// than the model, in Azerbaijani, English and Russian.
const typeWords = new Set(
  (
    "smartfon smartfonu smartfonlar mobil telefon telefonu noutbuk notbuk notebook laptop planşet " +
    "planset planşeti tablet televizor qulaqlıq qulaqliq qulaqlığı qulaqlıqlar qulaqliqlar " +
    "headphones earphones earbuds simsiz wireless ağıllı saat saatı смартфон телефон ноутбук " +
    "планшет наушники беспроводные rəsmi resmi zəmanət zəmanətli zəmanəti zemanet original " +
    "orijinal orjinal оригинал оригинальный официальный yeni new новый for with üçün для ilə və " +
    "and the"
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
// The maker, not the retailer: some stores put their own name in the brand field, or the product
// type ("Qulaqlıq"), or the maker with the line ("Apple iPhone").
export function canonicalBrand(p: Product) {
  const own = matchText(p.brand);
  const placeholder =
    !own ||
    own === matchText(p.sourceStoreId || "") ||
    /^(digər|unknown|generic|ispace)$/.test(own) ||
    typeWords.has(own);
  for (const [pattern, brand] of brandAliases)
    if (pattern.test(own) || pattern.test(p.brand) || (pattern.test(p.name) && placeholder))
      return brand;
  return typeWords.has(own) ? "" : own;
}
// Order-insensitive model identity: brand, model words, storage and colour. Two listings with the
// same key name the same model in the same configuration, whatever each store's wording.
// Cached like colors().
const modelKeys = new WeakMap<Product, string>();
export function modelKey(p: Product) {
  let key = modelKeys.get(p);
  if (key === undefined) modelKeys.set(p, (key = computeModelKey(p)));
  return key;
}
// A manufacturer model code such as "UE43DU7100UXRU" or "SI5077SO": letters and at least 3 digits.
const modelCode = (t: string) =>
  t.length >= 7 && /^[a-z0-9]+$/.test(t) && /[a-z].*[a-z]/.test(t) && /(?:\d\D*){3}/.test(t);
function computeModelKey(p: Product) {
  const brand = canonicalBrand(p);
  if (!brand || /^(digər|unknown|generic)$/.test(brand)) return "";
  const text = (p.name + " " + (generic(p.variant) ? "" : p.variant))
    .normalize("NFKC")
    // "QIRMIZI" is "qırmızı" only in Azerbaijani case folding; "IPHONE" stays English.
    .replace(/\p{L}*I\p{L}*/gu, (word) => {
      const az = word.toLocaleLowerCase("az");
      return colorPatterns.some((pattern) => pattern.test(az)) ? az : word;
    })
    .toLowerCase()
    .replace(/\u0307/g, "")
    // "(2nd generation)", "2-ci nəsil", "Gen 2" name generation 2 like a bare "2".
    .replace(
      /\(?\s*(\d{1,2})\s*(?:st|nd|rd|th|-?ci|-?cı|-?cu|-?cü)?\s*(?:gen(?:eration)?\.?|nəsil|поколени[ея])\s*\)?/gu,
      " $1 ",
    )
    .replace(/\(?\s*(?:gen(?:eration)?\.?)\s*(\d{1,2})\s*\)?/gu, " $1 ")
    // Bracketed text is dropped, except noise cancelling: "AirPods 4 (Active Noice Cancellation)".
    .replace(/\(([^)]*)\)/g, (_, inner: string) =>
      ancPattern.test(inner) && !/without|non[- ]anc|yox/i.test(inner) ? " anc " : " ",
    )
    // Part numbers are compared separately; one feature has one word in every language.
    .replace(/(^|\s)[a-z0-9]{4,7}\/a(?=$|[\s,])/g, " ")
    .replace(
      /active noi[cs]e cancell?ation|aktiv səs\s*boğma|aktiv səs.?küy\S*\s+boğ\S*/gu,
      " anc ",
    )
    .replace(/\bwi[\s-]?fi\b/g, " wifi ")
    // "Pro+" is a model of its own ("Pro Plus"); a free-standing "+" joins words.
    .replace(/([\p{L}\p{N}])\+/gu, "$1 plus ")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d+)\s*(?:mm|мм)(?![\p{L}\p{N}])/gu, " $1mm ")
    .replace(
      /(\d+(?:[.,]\d+)?)\s*(?:gb|гб|qb)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(tb|gb|тб|гб|qb)?/giu,
      " ",
    )
    .replace(/(\d+(?:[.,]\d+)?)\s*(tb|gb|тб|гб|qb)(?![\p{L}\p{N}])/giu, " ")
    // Screen size: 43″, 15.6", 13-inch, 6.1 düym all read as the bare number.
    .replace(/(\d+(?:\.\d+)?)\s*(?:″|"|”|''|-?\s*inch(?:es)?|-?\s*düym|дюйм\S*)/gu, " $1 ");
  const colour = new Map(colors(p).map((c) => [c, true]));
  const tokens = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    const t = matchText(raw);
    if (!t || typeWords.has(t) || t === brand) continue;
    if (brandAliases.some(([pattern, b]) => b === brand && pattern.test(t) && t === b)) continue;
    tokens.add(t);
  }
  // A screen size the model code already spells ("43″ UE43DU7100UXRU") adds nothing.
  const codes = [...tokens].filter(modelCode);
  for (const t of [...tokens])
    if (/^\d{2,3}$/.test(t) && codes.some((code) => new RegExp("^[a-z]+" + t + "\\D").test(code)))
      tokens.delete(t);
  // Colour words are compared as colour groups ("qara" = "black"), the rest stay literal.
  const colourWords = new Set(
    [...tokens].filter((t) => colorPatterns.some((pattern) => pattern.test(t))),
  );
  const model = [...tokens].filter((t) => !colourWords.has(t)).sort();
  if (!model.length || !model.some((t) => /\d/.test(t))) return "";
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
// "(868MHz)", "(2x16GB)", "(800x450x3mm)", "(5000mAh)": a measure, not a code.
const measureUnit = "(?:gb|tb|mb|mm|cm|m|ml|w|wh|mah|[kmg]?hz|v|kg|mp|nm|dpi|rpm|[mg]bps)";
const measure = new RegExp(
  "^\\d+(?:[.,]\\d+)?(?:(?:[x×*]\\d+(?:[.,]\\d+)?)+" + measureUnit + "?|" + measureUnit + ")$",
  "i",
);
// Codes a store writes in brackets, shop numbers such as "(45518)" included. Two listings whose
// bracketed codes share nothing are different SKUs ("UGREEN US304 (70523)" and "(70525)" are two
// cable lengths), whatever the rest of the title says.
const bracketCodeCache = new WeakMap<Product, string[]>();
function bracketCodes(p: Product) {
  let found = bracketCodeCache.get(p);
  if (!found)
    bracketCodeCache.set(
      p,
      (found = [...p.name.matchAll(/\(([^()]+)\)/g)]
        .map((m) => m[1].trim())
        .filter((v) => !/\s/.test(v) && /\d/.test(v) && !measure.test(v))
        .map(matchText)
        .filter((v) => v.length >= 4)),
    );
  return found;
}
function bracketCodesConflict(a: Product, b: Product) {
  const left = bracketCodes(a),
    right = bracketCodes(b);
  return left.length > 0 && right.length > 0 && !left.some((code) => right.includes(code));
}
// A code in brackets is one word: "(Version 3)", "(TDP 300W)" or "(for iPhone 15 Pro)" describe,
// a measure such as "(5000mAh)" is a spec, and Samsung's "(SM-A175)" names every colour and size.
function titledModelCodes(p: Product) {
  return [...p.name.matchAll(/\(([^)]+)\)/g)]
    .map((value) => value[1].trim())
    .filter(
      (value) =>
        value.length >= 5 &&
        !/\s/.test(value) &&
        /[a-z]/i.test(value) &&
        /\d/.test(value) &&
        !measure.test(value) &&
        !/^SM-[A-Z]\d{3,4}[A-Z0-9]{0,3}(?:\/[A-Z]+)?$/i.test(value),
    );
}
// Manufacturer part numbers wherever a store writes them: "(MXP93ZE/A)" in the title, a bare
// "MKFW4ZE/A", or the source SKU field when it holds a code rather than the shop's own number.
// Short codes such as "(Gen.4)" or "(S948)" name a family, not one trade item. Kept as written
// for display; partNumbers() is the comparable form.
function writtenPartNumbers(p: Product) {
  const codes = [
    ...titledModelCodes(p),
    ...[...p.name.matchAll(/(?:^|[\s,(])([A-Z0-9]{4,7}\/A)(?=$|[\s,)])/g)].map((m) => m[1]),
  ];
  for (const [key, value] of Object.entries(p.specs))
    if (/^(mənbə sku|sku)$/i.test(key.trim()) && /[a-z]/i.test(value)) codes.push(value.trim());
  const seen = new Set<string>();
  return codes.filter((code) => {
    const v = matchText(code);
    if (seen.has(v) || !(v.length >= 8 || (v.length >= 6 && (v.match(/\d/g) || []).length >= 2)))
      return false;
    seen.add(v);
    return true;
  });
}
const partNumberCache = new WeakMap<Product, string[]>();
function partNumbers(p: Product) {
  let found = partNumberCache.get(p);
  if (!found) partNumberCache.set(p, (found = writtenPartNumbers(p).map(matchText)));
  return found;
}
// Codes conflict when each listing has one the other lacks: "(2E-SPEED-XL-D05-PRO)" against
// "(2E-SPEED-XL-D07-PRO)" even when both also carry a shared size code. One listing may write more
// codes than the other ("(82XB00HBRK)" against "15IAN8 (82XB00HBRK)").
function partNumbersConflict(a: Product, b: Product) {
  const left = partNumbers(a),
    right = partNumbers(b);
  return (
    left.length > 0 &&
    right.length > 0 &&
    left.some((code) => !right.includes(code)) &&
    right.some((code) => !left.includes(code))
  );
}
function samePartNumber(a: Product, b: Product) {
  const right = partNumbers(b);
  return partNumbers(a).some((code) => right.includes(code)) && !partNumbersConflict(a, b);
}
const ancPattern = /\bANC\b|active noi[cs]e cancel|aktiv səs\s*boğma|aktiv səs.?küy.*boğ/i;
const titleOf = (p: Product) => p.name + " " + (generic(p.variant) ? "" : p.variant);
// Listings whose title is the plain model while the same store lists the ANC model separately;
// their spec sheet was copied from the ANC model. Set by mergeDuplicateProducts.
let plainModel = new WeakSet<Product>();
function ancStates(p: Product) {
  if (plainModel.has(p)) return [0];
  const states = new Set<number>();
  const title = titleOf(p);
  if (ancPattern.test(title))
    states.add(
      /without\s+(?:ANC|active noise)|non[- ]ANC|ANC\s*(?:yoxdur|yox|xeyr)/i.test(title) ? 0 : 1,
    );
  for (const [key, value] of Object.entries(p.specs)) {
    if (!ancPattern.test(key)) continue;
    if (/^(?:yox|yoxdur|xeyr|no|false|0|dəstəkləmir|нет)$/i.test(value.trim())) states.add(0);
    else if (
      /^(?:var|bəli|yes|true|1|да)$/i.test(value.trim()) ||
      /adaptive?|aktiv|active|adaptiv/i.test(value)
    )
      states.add(1);
  }
  return [...states];
}
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
  if (!result.length && samePartNumber(a, b)) result.push("Eyni istehsalçı kodu");
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
  if (partNumbersConflict(source, target) || bracketCodesConflict(source, target))
    reasons.push("Başlıqdakı model kodu fərqlidir.");
  const sourceAnc = ancStates(source),
    targetAnc = ancStates(target);
  if (sourceAnc.length > 1 || targetAnc.length > 1)
    reasons.push("Mənbənin ANC məlumatları ziddiyyətlidir.");
  else if (sourceAnc.length && targetAnc.length && sourceAnc[0] !== targetAnc[0])
    reasons.push("ANC variantı uyğun deyil.");
  else if (!sourceAnc.length !== !targetAnc.length)
    warnings.push("ANC məlumatı yalnız bir mənbədə göstərilib; əl ilə yoxla.");
  if (packSize(source) !== packSize(target)) reasons.push("Paketdəki say fərqlidir.");
  const aColor = colors(source).join(","),
    bColor = colors(target).join(",");
  if (aColor && bColor && aColor !== bColor) reasons.push("Rənglər uyğun deyil.");
  const sourceColor = exactColor(source),
    targetColor = exactColor(target);
  if (sourceColor && targetColor && sourceColor !== targetColor)
    reasons.push("Rəng variantı uyğun deyil.");
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
  // A measured field compares by its figure: "6.3 inches, 96.4 cm2" and "6.3 düym" agree, "128"
  // and "128 GB" agree; anything else compares as written.
  const specValue = (k: string, v: string) => {
    const figure = /memory|yaddaş|ram|size|ölçü|capacity/i.test(k) && v.match(/\d+(?:[.,]\d+)?/);
    return figure ? figure[0].replace(",", ".") : matchText(v);
  };
  const targetSpecs = new Map(
    Object.entries(target.specs).map(([k, v]) => [matchText(k), specValue(k, v)]),
  );
  for (const [k, value] of Object.entries(source.specs))
    if (
      specKeys.test(k) &&
      !/^(color|colour|rəng|reng|цвет)$/i.test(k.trim()) &&
      targetSpecs.has(matchText(k)) &&
      targetSpecs.get(matchText(k)) !== specValue(k, value)
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
      ...partNumbers(p).map((v) => "part:" + v),
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
// Preserve the full named colour: "Deep Blue" is not automatically interchangeable with "Blue".
// Every language folds to the group's English name, so "Qara" = "Black" but "Midnight Black" stays.
const colorFolds = colorGroups.map((group) => ({
  pattern: new RegExp("(^|[^\\p{L}])(" + group + ")(?=$|[^\\p{L}])", "gu"),
  name: group.split("|")[0],
}));
const colorShade =
  "(?:(?:deep|dark|light|midnight|cosmic|sky|ocean|space|desert|natural|rose|jet|sierra|pacific|alpine|mist|cloud|cool)\\s+)*";
const shadedColor = new RegExp(
  "(^|[^\\p{L}])(" + colorShade + "(?:" + colorGroups.join("|") + "))(?=$|[^\\p{L}])",
  "gu",
);
const exactColors = new WeakMap<Product, string>();
function exactColor(p: Product) {
  let found = exactColors.get(p);
  if (found === undefined) exactColors.set(p, (found = computeExactColor(p)));
  return found;
}
function computeExactColor(p: Product) {
  // Both foldings: "WHITE" reads as "white", "QIRMIZI" as "qırmızı"; the one naming more colours wins.
  const fold = (value: string) => {
    const [plain, az] = [value.toLowerCase(), value.toLocaleLowerCase("az")].map((lower) => {
      let text = lower + " ",
        hits = 0;
      for (const { pattern, name } of colorFolds)
        text = text.replace(pattern, (_, prefix: string) => (hits++, prefix + name));
      return { text: matchText(text), hits };
    });
    return (az.hits > plain.hits ? az : plain).text;
  };
  const stated = Object.entries(p.specs)
    .filter(([key]) => /^(color|colour|rəng|reng|цвет)$/i.test(key.trim()))
    .map(([, value]) => fold(value))
    .filter(Boolean);
  if (stated.length) return [...new Set(stated)].sort().join(",");
  const named = (value: string) => [
    ...new Set(
      [value.toLowerCase(), value.toLocaleLowerCase("az")].flatMap((lower) =>
        [...lower.matchAll(shadedColor)].map((item) => fold(item[2])),
      ),
    ),
  ];
  // A variant such as "256 GB" names no colour; the title ("iPhone 17 256 GB Black") may.
  let result = generic(p.variant) ? [] : named(p.variant);
  if (!result.length) result = named(p.name);
  return result.sort().join(",");
}
function sameTradeItem(a: Product, b: Product) {
  return (
    samePartNumber(a, b) ||
    [gtinKeys, mpnKeys].some((keys) => {
      const right = identifiers(b, keys, keys === gtinKeys);
      return identifiers(a, keys, keys === gtinKeys).some((value) => right.includes(value));
    })
  );
}
// Title and variant as a store wrote them, minus WooCommerce's "(Copy)" marker on duplicated posts.
// matchText() drops punctuation, but "Pro+" is not "Pro".
const sameTitleKey = (p: Product) =>
  matchText(
    (p.name.replace(/\(copy\)/gi, "") + " " + (generic(p.variant) ? "" : p.variant)).replace(
      /\+/g,
      " plus ",
    ),
  );
// The same full title with a model number in it.
function sameModelTitle(a: Product, b: Product) {
  const title = sameTitleKey(a);
  return title.length >= 10 && /\d/.test(title) && title === sameTitleKey(b);
}
// The same model words, storage and colour, with a manufacturer model code among them: "Televizor
// Samsung UE43DU7100UXRU" and "Televizor Samsung 43″ UE43DU7100UXRU".
// modelKey() drops bracketed text, so that must agree too: "(TRAY)" and "(BX8071512700KF)" differ.
const bracketed = (p: Product) =>
  [...p.name.matchAll(/\(([^)]*)\)/g)].map((m) => matchText(m[1])).join(" ");
function sameCodedModel(a: Product, b: Product) {
  const key = modelKey(a);
  return (
    !!key &&
    key === modelKey(b) &&
    bracketed(a) === bracketed(b) &&
    key.split("|")[1].split(" ").some(modelCode)
  );
}
// Reasons an automatic fold may set aside: a store's second copy of its own listing, and a
// store's own brand or category field when the part number or the full model title proves the
// same trade item (stores file a Dell PC under "Grandstream", AirPods under accessories).
function blockingReasons(reasons: string[], a: Product, b: Product, sameStore: boolean) {
  return reasons.filter(
    (reason) =>
      !(sameStore && reason === "Eyni mağazanın iki qeydi bu yolla birləşdirilmir.") &&
      !(
        reason === "Kateqoriyalar uyğun deyil." &&
        (sameTradeItem(a, b) || sameModelTitle(a, b) || sameCodedModel(a, b))
      ) &&
      !(reason === "Brendlər uyğun deyil." && sameModelTitle(a, b)),
  );
}
function automaticPair(c: Catalog, a: Product, b: Product, sameStore: boolean) {
  // Pair checks remain useful for manual review, but an automatic decision needs more evidence.
  const result = checkProductPair(c, a.id, b.id);
  if (blockingReasons(result.reasons, a, b, sameStore).length) return false;
  const left = c.offers.filter((o) => o.productId === a.id && !o.demo),
    right = c.offers.filter((o) => o.productId === b.id && !o.demo);
  const condition = (items: typeof left) =>
    [...new Set(items.map((o) => o.condition || "unspecified"))].sort().join(",");
  const state = condition(left);
  if (state !== condition(right) || state === "unknown" || state.includes(",")) return false;
  const strong = sameTradeItem(a, b);
  // A title names noise cancelling when the product has it; silence means none.
  if (!strong && ancStates(a).includes(1) !== ancStates(b).includes(1)) return false;
  const aColor = exactColor(a),
    bColor = exactColor(b);
  if (aColor && bColor && aColor !== bColor) return false;
  const x = memory(a),
    y = memory(b);
  const memoryProduct = ["telefon", "noutbuk", "planset"].includes(a.category);
  // Each iPhone model and storage size has one RAM size, which Apple does not state; a store that
  // adds it does not make another variant. A stated conflict still blocks (checkProductPair).
  const iphone = (p: Product) => canonicalBrand(p) === "apple" && /\biphone\b/i.test(p.name);
  const ramAgrees = x.ram === y.ram || ((!x.ram || !y.ram) && iphone(a) && iphone(b));
  // The same full title with a model number in it: within one store that is the store listing one
  // item twice (outlet units included); across stores it names the same item when neither listing
  // has a colour or memory size that could tell variants apart (watches, trimmers, consoles).
  if (sameModelTitle(a, b)) {
    if (sameStore && x.storage === y.storage) return true;
    if (!aColor && !bColor && !memoryProduct) return true;
  }
  const fullVariant = !!(
    aColor &&
    bColor &&
    aColor === bColor &&
    (!memoryProduct ||
      // Storage must be stated; RAM must agree, and some makers (Apple) never state it.
      (x.storage && y.storage && x.storage === y.storage && ramAgrees))
  );
  // A trusted manufacturer identifier identifies the exact trade item, unlike a shop's own SKU.
  // Ordinary retail may omit condition on both sides; that is never converted to an invented "new".
  if (
    state === "unspecified" &&
    /outlet|refurb|renewed|ikinci əl|işlənmiş|used/i.test(
      a.name + " " + b.name + " " + a.variant + " " + b.variant,
    )
  )
    return false;
  // A model code settles the model; with no colour or memory size on either side, nothing is left
  // to tell variants apart (televisions, appliances).
  if (!aColor && !bColor && !memoryProduct && !x.storage && !y.storage && sameCodedModel(a, b))
    return true;
  if (!strong && !fullVariant) return false;
  if (!strong && (!modelKey(a) || modelKey(a) !== modelKey(b))) return false;
  // A one-sided storage or RAM value still needs review unless a trade-item identifier proves it.
  if (!strong && (!x.storage !== !y.storage || !ramAgrees)) return false;
  return true;
}
const availableOffer = (o: Catalog["offers"][number]) => o.stock && o.stockKnown !== false;
function compareOffer(a: Catalog["offers"][number], b: Catalog["offers"][number]) {
  return (
    Number(availableOffer(b)) - Number(availableOffer(a)) ||
    a.price - b.price ||
    a.shipping - b.shipping ||
    b.checkedAt.localeCompare(a.checkedAt) ||
    a.id.localeCompare(b.id)
  );
}
// A known product/store pair has one displayed offer. Mixed conditions remain separate for review.
function uniqueStoreOffers(offers: Catalog["offers"]) {
  const groups = new Map<string, Catalog["offers"]>();
  for (const offer of offers) {
    const key = offer.productId + "\n" + offer.storeId + "\n" + (offer.demo ? "demo" : "real");
    const group = groups.get(key) || [];
    group.push(offer);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) =>
    new Set(group.map((o) => o.condition || "unspecified")).size > 1
      ? group
      : [[...group].sort(compareOffer)[0]],
  );
}
function flattenAliases(input: Record<string, string>) {
  const aliases: Record<string, string> = {};
  for (const id of Object.keys(input)) {
    const seen = new Set([id]);
    let target = input[id];
    while (input[target] && !seen.has(target)) {
      seen.add(target);
      target = input[target];
    }
    if (!seen.has(target) && target !== id) aliases[id] = target;
  }
  return aliases;
}
// Automatic folds never delete original database records. A revoked pair constrains every member
// of a cluster, not just its representative; incomplete variant facts stay in manual review.
export function mergeDuplicateProducts(c: Catalog, matches: ProductMatch[] = []): Catalog {
  const pairKey = (a: string, b: string) => [a, b].sort().join("\n");
  const revoked = new Set(
    matches.filter((m) => !m.active).map((m) => pairKey(m.sourceId, m.targetId)),
  );
  const normalizedOffers = uniqueStoreOffers(c.offers);
  const offers = new Map<string, Catalog["offers"]>();
  for (const o of normalizedOffers) {
    if (o.demo) continue;
    const list = offers.get(o.productId);
    if (list) list.push(o);
    else offers.set(o.productId, [o]);
  }
  const candidates = c.products.filter(
    (p) => p.active && !p.marketplace && offers.has(p.id) && !c.productAliases?.[p.id],
  );
  const storesOf = (id: string) => new Set(offers.get(id)!.map((o) => o.storeId));
  // A store that lists "AirPods 4" and "AirPods 4 Active Noise Cancellation" separately sells the
  // plain model under the first title, whatever its copied spec sheet says.
  const withoutAnc = (p: Product) =>
    modelKey(p)
      .split("|")
      .map((part, i) => (i === 1 ? part.replace(/(^| )anc(?= |$)/, "").trim() : part))
      .join("|");
  plainModel = new WeakSet();
  const ancTitled = new Set(
    candidates
      .filter((p) => ancPattern.test(titleOf(p)) && modelKey(p))
      .flatMap((p) => [...storesOf(p.id)].map((s) => s + "\n" + withoutAnc(p))),
  );
  for (const p of candidates) {
    if (ancPattern.test(titleOf(p)) || !modelKey(p)) continue;
    if ([...storesOf(p.id)].some((s) => ancTitled.has(s + "\n" + modelKey(p)))) plainModel.add(p);
  }
  const best = (p: Product) => {
    const selected = [...offers.get(p.id)!].sort(compareOffer)[0];
    return [availableOffer(selected) ? 0 : 1, selected.price];
  };
  const buckets = new Map<string, Product[]>();
  for (const p of candidates) {
    const model = modelKey(p);
    const name = sameTitleKey(p);
    for (const key of [
      ...(name.length >= 10 ? ["name:" + name] : []),
      ...(model ? ["model:" + model] : []),
      ...partNumbers(p).map((v) => "part:" + v),
      ...identifiers(p, gtinKeys, true).map((v) => "gtin:" + v),
      ...identifiers(p, mpnKeys).map((v) => "mpn:" + v),
    ]) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(p);
      else buckets.set(key, [p]);
    }
  }
  const root = new Map<string, string>();
  const find = (id: string): string => {
    const r = root.get(id);
    return r && r !== id ? find(r) : id;
  };
  const members = new Map<string, Set<string>>();
  const clusterStores = (r: string) =>
    new Set([...(members.get(r) || [r])].flatMap((id) => [...storesOf(id)]));
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const allProducts = new Map(c.products.map((p) => [p.id, p]));
  const priorMembers = new Map<string, string[]>();
  const priorAliases = flattenAliases(c.productAliases || {});
  for (const [id, target] of Object.entries(priorAliases))
    priorMembers.set(target, [...(priorMembers.get(target) || []), id]);
  const cluster = (r: string) => [...(members.get(r) || [r])];
  const revokedMembers = (r: string) =>
    cluster(r).flatMap((id) => [id, ...(priorMembers.get(id) || [])]);
  const approvedFacts = (r: string) =>
    cluster(r).flatMap((id) =>
      (priorMembers.get(id) || []).flatMap((sourceId) => {
        const product = allProducts.get(sourceId);
        return product
          ? [
              {
                product: { ...product, active: true },
                offers: offers.get(id)!.map((o) => ({ ...o, productId: sourceId })),
              },
            ]
          : [];
      }),
    );
  for (const sameStore of [true, false])
    for (const original of buckets.values()) {
      const group = [...original];
      if (group.length < 2 || group.length > 30) continue;
      group.sort((a, b) => {
        if (sameStore) {
          const x = best(a),
            y = best(b);
          return x[0] - y[0] || x[1] - y[1] || a.id.localeCompare(b.id);
        }
        return storesOf(b.id).size - storesOf(a.id).size || a.id.localeCompare(b.id);
      });
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const target = find(group[i].id),
            source = find(group[j].id);
          if (target === source) continue;
          const left = clusterStores(target),
            right = clusterStores(source);
          const overlap = [...right].some((s) => left.has(s));
          if (sameStore ? !(overlap && left.size === 1 && right.size === 1) : overlap) continue;
          if (
            revokedMembers(source).some((x) =>
              revokedMembers(target).some((y) => revoked.has(pairKey(x, y))),
            )
          )
            continue;
          // A~B and B~C is insufficient on its own: one pair across the two groups must be proven
          // the same item, and no member may contradict any other (colour, memory, ANC, codes).
          const pairs = cluster(source).flatMap((x) => cluster(target).map((y) => [x, y]));
          const proven = pairs.some(([x, y]) => {
            const a = byId.get(x)!,
              b = byId.get(y)!;
            return automaticPair(
              { ...c, products: [a, b], offers: [...offers.get(x)!, ...offers.get(y)!] },
              a,
              b,
              sameStore,
            );
          });
          if (
            !proven ||
            !pairs.every(([x, y]) => {
              const a = byId.get(x)!,
                b = byId.get(y)!;
              const pair = checkProductPair(
                { ...c, products: [a, b], offers: [...offers.get(x)!, ...offers.get(y)!] },
                x,
                y,
              );
              const ca = exactColor(a),
                cb = exactColor(b);
              return (
                // The proven pair settles identity; a store's own category does not contradict it.
                blockingReasons(pair.reasons, a, b, sameStore).every(
                  (r) =>
                    r === "Eyni ad, barkod və ya istehsalçı kodu ilə sübut yoxdur." ||
                    r === "Kateqoriyalar uyğun deyil.",
                ) &&
                !(ca && cb && ca !== cb) &&
                ancStates(a).includes(1) === ancStates(b).includes(1)
              );
            })
          )
            continue;
          // Previously approved aliases can carry known attributes absent from their representative.
          // Their missing fields were manually checked, but a known conflict cannot be bridged later.
          const facts = (r: string) => [
            ...cluster(r).map((id) => ({ product: byId.get(id)!, offers: offers.get(id)! })),
            ...approvedFacts(r),
          ];
          if (
            !facts(source).every((x) =>
              facts(target).every((y) => {
                const pair = checkProductPair(
                  { ...c, products: [x.product, y.product], offers: [...x.offers, ...y.offers] },
                  x.product.id,
                  y.product.id,
                );
                const reasons = blockingReasons(
                  pair.reasons,
                  x.product,
                  y.product,
                  sameStore,
                ).filter(
                  (r) =>
                    r !== "Eyni ad, barkod və ya istehsalçı kodu ilə sübut yoxdur." &&
                    r !== "Kateqoriyalar uyğun deyil.",
                );
                const a = exactColor(x.product),
                  b = exactColor(y.product);
                return reasons.length === 0 && !(a && b && a !== b);
              }),
            )
          )
            continue;
          root.set(source, target);
          members.set(
            target,
            new Set([...(members.get(target) || [target]), ...(members.get(source) || [source])]),
          );
          members.delete(source);
        }
    }
  const pendingAliases: Record<string, string> = { ...priorAliases };
  for (const id of root.keys()) pendingAliases[id] = find(id);
  const aliases = flattenAliases(pendingAliases);
  const resolve = (id: string) => aliases[id] || id;
  return {
    ...c,
    productAliases: aliases,
    products: c.products.map((p) => (aliases[p.id] ? { ...p, active: false } : p)),
    offers: uniqueStoreOffers(
      normalizedOffers.map((o) =>
        resolve(o.productId) !== o.productId ? { ...o, productId: resolve(o.productId) } : o,
      ),
    ),
    reviews: c.reviews.map((r) =>
      aliases[r.productId] ? { ...r, productId: aliases[r.productId] } : r,
    ),
  };
}
// Pack size from a quantity field ("Paketdə ədəd: 2") or a "2 ədədlik paket" / "2-pack" phrase.
// Only a field that counts the items in the box: "SIM Kart Sayı" or "Sürət sayı" count features.
const packKeys =
  /^(?:paketdə(?:ki)? (?:ədəd|say)|dəstdə(?:ki)? (?:ədəd|say)|ədəd|say|miqdar|komplekt(?:də ədəd)?|quantity|pack(?: size| quantity)?|pcs|количество(?: в упаковке)?)$/i;
const packSizes = new WeakMap<Product, number>();
function packSize(p: Product) {
  let found = packSizes.get(p);
  if (found === undefined) packSizes.set(p, (found = computePackSize(p)));
  return found;
}
function computePackSize(p: Product) {
  for (const [key, value] of Object.entries(p.specs)) {
    if (!packKeys.test(key.trim())) continue;
    const count = value.match(/^\s*(\d{1,3})\s*(?:ədəd|əd\.?|pcs|pc|ad)?\s*$/i);
    if (count && Number(count[1]) > 1) return Number(count[1]);
  }
  // The title may say "2'li paket", "4 pcs", "Pack of 2"; a description only the plain pack phrases.
  const phrase =
    p.name.match(
      /(?<![\p{L}\p{N}.,])(\d{1,3})\s*(?:ədədlik\s+(?:paket|dəst)|['’-]?\s*(?:li|lı|lu|lü)\s+(?:paket|dəst)|-?\s*(?:pack|pk|pcs|шт)(?![\p{L}\p{N}])|ədəd\s+(?:paket|dəst))/iu,
    ) ||
    p.name.match(/(?:pack|set|kit)\s+of\s+(\d{1,3})(?![\p{L}\p{N}])/iu) ||
    p.description.match(/\b(\d{1,3})\s*(?:ədədlik\s+(?:paket|dəst)|-?\s*pack\b|pk\b)/i);
  return phrase && Number(phrase[1]) > 1 ? Number(phrase[1]) : 0;
}
// Listings that stay separate yet share a title (iSpace sells MG8G4ZD/A and MG8G4HX/A-OD as
// "iPhone 17 Pro, 256 GB, Gümüş") get their part number and pack size under the title. A group
// whose members cannot be told apart this way keeps its plain cards.
export function labelSameTitleProducts(c: Catalog): Catalog {
  const priced = new Set(c.offers.filter((o) => !o.demo).map((o) => o.productId));
  const groups = new Map<string, Product[]>();
  for (const p of c.products) {
    if (!p.active || p.marketplace || !priced.has(p.id)) continue;
    const key = sameTitleKey(p);
    if (key) groups.set(key, [...(groups.get(key) || []), p]);
  }
  const labels = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const labelled = group.map((p) => {
      const pack = packSize(p);
      return [p.id, [writtenPartNumbers(p)[0], pack && pack + " ədəd"].filter(Boolean).join(" · ")];
    });
    if (new Set(labelled.map(([, label]) => label)).size < 2) continue;
    for (const [id, label] of labelled) if (label) labels.set(id, label);
  }
  if (!labels.size) return c;
  return {
    ...c,
    products: c.products.map((p) =>
      labels.has(p.id) ? { ...p, distinction: labels.get(p.id) } : p,
    ),
  };
}
