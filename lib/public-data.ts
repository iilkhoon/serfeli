import { catalog, list } from "./api/records";
import { applyProductMatches, mergeDuplicateProducts, type ProductMatch } from "./product-matching";
import type { Catalog } from "./catalog";

// Rebuilding the merged catalog reads every D1 record and ~13k bundled products, so each worker
// isolate keeps the result briefly. Writes through the API call invalidatePublicCatalog(); other
// isolates pick the change up when their copy expires.
const TTL = 60_000;
const FALLBACK_TTL = 5_000;
const emptyCatalog = (): Catalog => ({
  products: [],
  offers: [],
  history: [],
  stores: [],
  reviews: [],
  settings: {
    headline: "Qiyməti bil. Ağıllı seç.",
    announcement: "Az xərclə. Daha çoxunu əldə et.",
  },
  dataStatus: {
    state: "unavailable",
    message: "Məlumat bazası hazırda cavab vermir. Qiymətləri yenidən yükləyin.",
  },
});
let cache: { expires: number; value: Promise<Catalog> } | undefined;

async function build(): Promise<{ value: Catalog; fallback: boolean }> {
  try {
    const [raw, matches] = await Promise.all([catalog(), list<ProductMatch>("productMatch")]);
    // Admin-approved matches first, then the duplicates that need no review.
    return {
      value: mergeDuplicateProducts(applyProductMatches(raw, matches), matches),
      fallback: false,
    };
  } catch (e) {
    console.error("Kataloq bazadan oxunmadı:", e instanceof Error ? e.message : e);
    return {
      value: emptyCatalog(),
      fallback: true,
    };
  }
}

export function publicCatalog(): Promise<Catalog> {
  if (cache && Date.now() < cache.expires) return cache.value;
  const entry = { expires: Date.now() + TTL, value: Promise.resolve(emptyCatalog()) };
  entry.value = build().then(({ value, fallback }) => {
    // A database outage should not pin the seed catalog for a full minute.
    if (fallback) entry.expires = Date.now() + FALLBACK_TTL;
    return value;
  });
  cache = entry;
  return entry.value;
}

export function invalidatePublicCatalog() {
  cache = undefined;
}
