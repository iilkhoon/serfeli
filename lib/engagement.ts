// Product questions (moderated like reviews) and per-day product view counts, stored in the D1
// `records` table. View rows are aggregated counters keyed by product and Baku day: no IP address,
// user id or browser identifier is stored.
import { z } from "zod";
import { db, statement } from "./api/records";
import { ApiError } from "./api/http";
import { id as idSchema } from "./api/schemas";
import { publicCatalog } from "./public-data";
import { canonicalProductId } from "./catalog";
import type {
  ProductExtras,
  PublicQuestion,
  Question,
  TopViewed,
} from "./engagement-types";

// Asia/Baku is UTC+4 all year (no daylight saving).
export const bakuDay = (now = Date.now()) => new Date(now + 4 * 3600000).toISOString().slice(0, 10);

const publicQuestion = ({ userId: _u, status: _s, ...q }: Question): PublicQuestion => q;

async function activeProductId(raw: string) {
  const c = await publicCatalog();
  const pid = canonicalProductId(c, raw);
  return c.products.some((p) => p.id === pid && p.active) ? pid : null;
}

// ---- Questions -----------------------------------------------------------------------------

export async function approvedQuestions(productId: string): Promise<PublicQuestion[]> {
  const r = await db()
    .prepare(
      "SELECT payload FROM records WHERE kind='question' AND json_extract(payload,'$.productId')=? AND json_extract(payload,'$.status')='approved' ORDER BY updated_at DESC LIMIT 50",
    )
    .bind(productId)
    .all<{ payload: string }>();
  return r.results.map((x) => publicQuestion(JSON.parse(x.payload) as Question));
}

export const questionInput = z.object({
  productId: idSchema,
  text: z.string().trim().min(10).max(500),
});

export async function createQuestion(
  body: unknown,
  user: { userId: string; displayName: string },
) {
  const b = questionInput.parse(body);
  const productId = await activeProductId(b.productId);
  if (!productId) throw new ApiError(404, "Məhsul tapılmadı.");
  const q: Question = {
    id: crypto.randomUUID(),
    productId,
    text: b.text,
    name: user.displayName,
    userId: user.userId,
    status: "pending",
    date: new Date().toISOString(),
  };
  await statement("question", q).run();
  return { ok: true, status: "pending" as const };
}

// ---- Admin list (rendered by the admin panel) -------------------------------------------------
// GET /api/v1/admin/questions?status=pending|approved|rejected (omit for all). Moderation and
// answers go through POST /api/v1/admin/questions/answer.

export async function adminListQuestions(status: string | null) {
  const filter = ["pending", "approved", "rejected"].includes(status || "") ? status : null;
  const r = await db()
    .prepare(
      filter
        ? "SELECT payload FROM records WHERE kind='question' AND json_extract(payload,'$.status')=? ORDER BY updated_at DESC LIMIT 500"
        : "SELECT payload FROM records WHERE kind='question' ORDER BY updated_at DESC LIMIT 500",
    )
    .bind(...(filter ? [filter] : []))
    .all<{ payload: string }>();
  const c = await publicCatalog();
  const names = new Map(c.products.map((p) => [p.id, p.name]));
  const questions = r.results.map((x) => {
    const q = JSON.parse(x.payload) as Question;
    return { ...q, productName: names.get(q.productId) || q.productId };
  });
  return { questions, pending: questions.filter((q) => q.status === "pending").length };
}

// ---- Views ---------------------------------------------------------------------------------

const viewKey = (productId: string, day: string) => `view:${productId}:${day}`;

export async function productViews(productId: string) {
  // Row ids are "view:<productId>:<day>"; ";" sorts right after ":" so this is a prefix range.
  const row = await db()
    .prepare(
      "SELECT COALESCE(SUM(json_extract(payload,'$.count')),0) AS n FROM records WHERE id>=? AND id<? AND kind='view'",
    )
    .bind(`view:${productId}:`, `view:${productId};`)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

export async function recordView(body: unknown) {
  const b = z.object({ productId: idSchema }).parse(body);
  const productId = await activeProductId(b.productId);
  if (!productId) throw new ApiError(404, "Məhsul tapılmadı.");
  const day = bakuDay();
  await db()
    .prepare(
      "INSERT INTO records (id,kind,payload,updated_at) VALUES (?,'view',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_set(records.payload,'$.count',COALESCE(json_extract(records.payload,'$.count'),0)+1),updated_at=excluded.updated_at",
    )
    .bind(
      viewKey(productId, day),
      JSON.stringify({ id: `${productId}:${day}`, productId, date: day, count: 1 }),
      Date.now(),
    )
    .run();
  return { ok: true, productId, views: await productViews(productId) };
}

// Most viewed active products over the last `days` Baku days (today included).
export async function topViewed(days = 30, limit = 10): Promise<TopViewed[]> {
  const d = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
  const n = Math.min(Math.max(Math.floor(limit) || 10, 1), 100);
  const since = bakuDay(Date.now() - (d - 1) * 86400000);
  const r = await db()
    .prepare(
      "SELECT json_extract(payload,'$.productId') AS productId, SUM(json_extract(payload,'$.count')) AS views FROM records WHERE kind='view' AND json_extract(payload,'$.date')>=? GROUP BY productId ORDER BY views DESC LIMIT ?",
    )
    .bind(since, n * 2)
    .all<{ productId: string; views: number }>();
  const c = await publicCatalog();
  const byId = new Map(c.products.filter((p) => p.active).map((p) => [p.id, p]));
  return r.results
    .filter((x) => byId.has(x.productId))
    .slice(0, n)
    .map((x) => ({ productId: x.productId, name: byId.get(x.productId)!.name, views: Number(x.views) }));
}

// Daily totals for the admin chart: [{ date, views }] for the last `days` days.
export async function viewsByDay(days = 30) {
  const d = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
  const since = bakuDay(Date.now() - (d - 1) * 86400000);
  const r = await db()
    .prepare(
      "SELECT json_extract(payload,'$.date') AS date, SUM(json_extract(payload,'$.count')) AS views FROM records WHERE kind='view' AND json_extract(payload,'$.date')>=? GROUP BY date ORDER BY date",
    )
    .bind(since)
    .all<{ date: string; views: number }>();
  return r.results.map((x) => ({ date: x.date, views: Number(x.views) }));
}

// Questions and views for the server-rendered product page. A database outage leaves them empty.
export async function productExtras(productId: string): Promise<ProductExtras> {
  try {
    const [questions, views] = await Promise.all([
      approvedQuestions(productId),
      productViews(productId),
    ]);
    return { productId, questions, views };
  } catch (e) {
    console.error("Məhsul əlavələri oxunmadı:", e instanceof Error ? e.message : e);
    return { productId, questions: [], views: 0 };
  }
}
