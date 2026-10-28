import { withLiveFeed } from "./live-feed";
import { catalog } from "./api/records";
import { seedCatalog } from "./server-catalog";
import { withStoreSnapshots } from "./store-snapshots";
import type { Catalog } from "./catalog";

// Rebuilding the merged catalog reads every D1 record and ~13k bundled products, so each worker
// isolate keeps the result briefly. Writes through the API call invalidatePublicCatalog(); other
// isolates pick the change up when their copy expires.
const TTL = 60_000;
const FALLBACK_TTL = 5_000;
let cache: { expires: number; value: Promise<Catalog> } | undefined;

async function build(): Promise<{ value: Catalog; fallback: boolean }> {
  try {
    return { value: await withLiveFeed(await catalog()), fallback: false };
  } catch (e) {
    console.error("Kataloq bazadan oxunmadı:", e instanceof Error ? e.message : e);
    return { value: await withLiveFeed(withStoreSnapshots(seedCatalog)), fallback: true };
  }
}

export function publicCatalog(): Promise<Catalog> {
  if (cache && Date.now() < cache.expires) return cache.value;
  const entry = { expires: Date.now() + TTL, value: Promise.resolve(seedCatalog) };
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
