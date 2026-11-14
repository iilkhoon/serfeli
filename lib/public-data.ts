import { catalog, list } from "./api/records";
import {
  applyProductMatches,
  labelSameTitleProducts,
  mergeDuplicateProducts,
  type ProductMatch,
} from "./product-matching";
import type { Catalog } from "./catalog";

// Rebuilding the merged catalog reads every stored record and ~13k bundled products, so the server
// process keeps the result. After TTL the old copy keeps serving while one rebuild runs in the
// background (cron imports show up within a minute and no visitor waits for the rebuild). Writes
// through the API call invalidatePublicCatalog(), so the next request sees them at once.
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
type Entry = { expires: number; value: Promise<Catalog>; refreshing?: boolean };
let cache: Entry | undefined;

async function build(): Promise<{ value: Catalog; fallback: boolean }> {
  try {
    const [raw, matches] = await Promise.all([catalog(), list<ProductMatch>("productMatch")]);
    // Admin-approved matches first, then the duplicates that need no review.
    return {
      value: labelSameTitleProducts(
        mergeDuplicateProducts(applyProductMatches(raw, matches), matches),
      ),
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

function rebuild(): Entry {
  const entry: Entry = { expires: Date.now() + TTL, value: Promise.resolve(emptyCatalog()) };
  entry.value = build().then(({ value, fallback }) => {
    // A database outage should not pin the empty catalog for a full minute.
    if (fallback) entry.expires = Date.now() + FALLBACK_TTL;
    return value;
  });
  return entry;
}

export function publicCatalog(): Promise<Catalog> {
  const current = cache;
  if (!current) return (cache = rebuild()).value;
  if (Date.now() >= current.expires && !current.refreshing) {
    current.refreshing = true;
    const next = rebuild();
    next.value.then(
      () => {
        if (cache === current) cache = next;
      },
      () => {
        current.refreshing = false;
      },
    );
  }
  return current.value;
}

export function invalidatePublicCatalog() {
  cache = undefined;
}
