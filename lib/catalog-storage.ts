import type { D1Database } from "@cloudflare/workers-types";
import { seedCatalog } from "./server-catalog";
import { withStoreSnapshots } from "./store-snapshots";

// Explicit version: bump when the bundled onboarding catalog changes. Existing operator or
// crawler records are never overwritten; refresh jobs own subsequent prices and stock.
const version = "2026-10-29-bundled-v1";
const markerId = "system:catalog-materialization";
type Entry = { kind: string; value: { id: string } };
export type CatalogMaterialization = {
  version: string;
  cursor: number;
  total: number;
  complete: boolean;
};
let entries: Entry[] | undefined;
function plan() {
  if (!entries) {
    const catalog = withStoreSnapshots(seedCatalog);
    entries = [
      ...catalog.stores.map((value) => ({ kind: "store", value })),
      ...catalog.products.map((value) => ({ kind: "product", value })),
      ...catalog.offers.map((value) => ({ kind: "offer", value })),
      ...catalog.history.filter((h) => !h.demo).map((value) => ({ kind: "history", value })),
      { kind: "settings", value: { id: "main", ...catalog.settings } },
    ];
  }
  return entries;
}
export async function catalogMaterializationStatus(
  db: D1Database,
): Promise<CatalogMaterialization | null> {
  const row = await db
    .prepare("SELECT payload FROM records WHERE id=?")
    .bind(markerId)
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}
export async function materializeCatalog(db: D1Database, size = 180) {
  const records = plan();
  const initial: CatalogMaterialization = {
    version,
    cursor: 0,
    total: records.length,
    complete: false,
  };
  await db
    .prepare(
      "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(markerId, "system", JSON.stringify(initial), Date.now())
    .run();
  let status = (await catalogMaterializationStatus(db))!;
  if (status.version !== version) {
    await db
      .prepare(
        "UPDATE records SET payload=?,updated_at=? WHERE id=? AND json_extract(payload,'$.version')=?",
      )
      .bind(JSON.stringify(initial), Date.now(), markerId, status.version)
      .run();
    status = (await catalogMaterializationStatus(db))!;
  }
  if (status.complete) return status;
  const end = Math.min(
    records.length,
    status.cursor + Math.min(180, Math.max(1, Math.floor(size))),
  );
  const next = { version, cursor: end, total: records.length, complete: end === records.length };
  // A batch is atomic. Concurrent callers can replay these INSERT OR IGNORE statements safely;
  // the cursor only advances from the state each caller actually read.
  const inserts = records
    .slice(status.cursor, end)
    .map(({ kind, value }) =>
      db
        .prepare(
          "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(`${kind}:${value.id}`, kind, JSON.stringify(value), Date.now()),
    );
  for (let i = 0; i < inserts.length; i += 40) await db.batch(inserts.slice(i, i + 40));
  await db
    .prepare(
      "UPDATE records SET payload=?,updated_at=? WHERE id=? AND json_extract(payload,'$.version')=? AND json_extract(payload,'$.cursor')=?",
    )
    .bind(JSON.stringify(next), Date.now(), markerId, version, status.cursor)
    .run();
  return (await catalogMaterializationStatus(db))!;
}
