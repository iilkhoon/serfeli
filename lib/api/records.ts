// Record helpers (SQLite, D1-style API; see db/sqlite.ts) shared by the API routes. Every record is a JSON payload keyed by `${kind}:${id}`.
import { getD1, type D1PreparedStatement } from "../../db/sqlite";
import type { Catalog, Review } from "../catalog";
import { seedCatalog } from "../server-catalog";
import { catalogMaterializationStatus } from "../catalog-storage";

export function db() {
  return getD1();
}

export async function list<T = unknown>(kind: string): Promise<T[]> {
  const r = await db()
    .prepare("SELECT payload FROM records WHERE kind=? ORDER BY updated_at DESC")
    .bind(kind)
    .all<{ payload: string }>();
  return r.results.map((x) => JSON.parse(x.payload) as T);
}

async function storedCatalog(): Promise<Catalog> {
  const [products, stores, offers, history, settings, reviews] = await Promise.all([
    list<Catalog["products"][number]>("product"),
    list<Catalog["stores"][number]>("store"),
    list<Catalog["offers"][number]>("offer"),
    list<Catalog["history"][number]>("history"),
    list<Catalog["settings"]>("settings"),
    list<Review>("review"),
  ]);
  const ready = (await catalogMaterializationStatus(db()))?.complete;
  return {
    products,
    stores,
    offers,
    history,
    settings: settings[0] || seedCatalog.settings,
    reviews: reviews.filter((r) => r.status === "approved"),
    dataStatus: ready
      ? { state: "ready" }
      : {
          state: "initializing",
          message:
            "İlkin kataloqun bazaya köçürülməsi davam edir. Hazırda bazada saxlanan məhsullar göstərilir.",
        },
  };
}

export async function catalog(): Promise<Catalog> {
  const c = await storedCatalog();
  const counts = new Map<string, Set<string>>(),
    checked = new Map<string, string>();
  for (const p of c.products)
    if (p.active && p.sourceStoreId) {
      const set = counts.get(p.sourceStoreId) || new Set<string>();
      set.add(p.id);
      counts.set(p.sourceStoreId, set);
    }
  for (const o of c.offers)
    if (!o.demo) {
      const set = counts.get(o.storeId) || new Set<string>();
      set.add(o.productId);
      counts.set(o.storeId, set);
      if ((checked.get(o.storeId) || "") < o.checkedAt) checked.set(o.storeId, o.checkedAt);
    }
  c.sourceCoverage = [...counts].map(([storeId, ids]) => ({
    storeId,
    count: ids.size,
    priced: new Set(
      c.offers.filter((o) => !o.demo && o.storeId === storeId).map((o) => o.productId),
    ).size,
    checkedAt: checked.get(storeId) || "",
  }));
  const feed = await list<{ checkedAt: string; sourceCount: number; variantCount: number }>("feed");
  const technomania = feed.find((f) => (f as { id?: string }).id === "technomania");
  const checkedAt = technomania?.checkedAt || checked.get("technomania") || "";
  c.liveSource = {
    name: "Technomania",
    checkedAt,
    sourceCount: technomania?.sourceCount || 0,
    variantCount: c.offers.filter((o) => o.storeId === "technomania" && !o.demo).length,
    state: Date.now() - Date.parse(checkedAt) < 3600000 ? "fresh" : "stale",
  };
  return c;
}

export function statement<T extends { id?: string }>(kind: string, value: T) {
  return db()
    .prepare(
      "INSERT INTO records (id,kind,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .bind(`${kind}:${value.id || "main"}`, kind, JSON.stringify(value), Date.now());
}

export async function audit(userId: string, action: string) {
  await statement("audit", {
    id: crypto.randomUUID(),
    userId,
    action,
    date: new Date().toISOString(),
  }).run();
}

export async function ownerId(): Promise<string | null> {
  const row = await db()
    .prepare("SELECT payload FROM records WHERE id='system:owner'")
    .first<{ payload: string }>();
  return row ? (JSON.parse(row.payload) as { userId: string }).userId : null;
}

export async function runBatched(commands: D1PreparedStatement[], size = 50) {
  for (let i = 0; i < commands.length; i += size) await db().batch(commands.slice(i, i + size));
}
