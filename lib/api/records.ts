// D1 record helpers shared by the API routes. Every record is a JSON payload keyed by `${kind}:${id}`.
import { env } from "cloudflare:workers";
import type { Catalog, Review } from "../catalog";
import { seedCatalog } from "../server-catalog";
import { withStoreSnapshots } from "../store-snapshots";

export function db() {
  if (!env.DB) throw new Error("Məlumat bazası qoşulmayıb.");
  return env.DB;
}

export async function list<T = unknown>(kind: string): Promise<T[]> {
  const r = await db()
    .prepare("SELECT payload FROM records WHERE kind=? ORDER BY updated_at DESC")
    .bind(kind)
    .all<{ payload: string }>();
  return r.results.map((x) => JSON.parse(x.payload) as T);
}

async function storedCatalog(): Promise<Catalog> {
  const initialized = await db().prepare("SELECT id FROM records WHERE id='system:seed'").first();
  if (!initialized) return seedCatalog;
  const [products, stores, offers, history, settings, reviews] = await Promise.all([
    list<Catalog["products"][number]>("product"),
    list<Catalog["stores"][number]>("store"),
    list<Catalog["offers"][number]>("offer"),
    list<Catalog["history"][number]>("history"),
    list<Catalog["settings"]>("settings"),
    list<Review>("review"),
  ]);
  return {
    products,
    stores,
    offers,
    history,
    settings: settings[0] || seedCatalog.settings,
    reviews: reviews.filter((r) => r.status === "approved"),
  };
}

export async function catalog(): Promise<Catalog> {
  return withStoreSnapshots(await storedCatalog());
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
